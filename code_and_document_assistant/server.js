const express=require('express');
const path=require('node:path');
const crypto=require('node:crypto');
const {Workspace}=require('./src/workspace.js');
const {Engine}=require('./src/engine.js');
const {registry}=require('./src/tools.js');
const config=require('./config/example.json');
const {ProjectScope}=require('./src/project-scope.js');
const {AppState}=require('./src/app-state.js');
const {ConversationMemory,estimateTokens,turn}=require('./src/conversation-memory.js');
const sessionLifetime=30*86400000;
async function createApp({runtime=path.join(__dirname,'runtime'),limits={...config.limits},adminToken=crypto.randomBytes(3).toString('hex'),projectConfig=process.env.CDA_PROJECTS_CONFIG,aiOptions={}}={}) {
  const workspace=new Workspace(runtime,limits);await workspace.init(path.join(__dirname,'examples'),[path.join(__dirname,'docs','example_data')]);
  const saved=await new AppState(runtime).init();
  let interruptedImages=false;
  for(const conversation of saved.data.conversations)for(const job of conversation.jobs)if(job.kind==='image'&&job.status==='running'){
    job.status='partial';job.progress='圖片創作因服務重啟而中斷';job.finishedAt=Date.now();job.result={conclusions:[],facts:[],inferences:[],unknown:['服務重啟前尚未完成圖片創作，請重新送出提示詞'],mock:false};interruptedImages=true;
  }
  if(interruptedImages)await saved.save();
  if(projectConfig) {
    const entries=JSON.parse(await require('node:fs/promises').readFile(projectConfig,'utf8')).projects;
    if(!Array.isArray(entries))throw new Error('專案設定需要 projects 陣列');
    for(const p of entries) {
      if(typeof p.path!=='string'||!path.isAbsolute(p.path)||typeof p.name!=='string')throw new Error('專案設定需要絕對 path 與 name');
      if(p.kind&&!['project','global-reference'].includes(p.kind))throw new Error('設定檔授權類型不合法');
      if(!saved.data.projects.some(r=>path.resolve(r.path).toLowerCase()===path.resolve(p.path).toLowerCase())) saved.data.projects.push({id:'project-'+require('./src/workspace.js').hash(path.resolve(p.path).toLowerCase()).slice(0,24),path:path.resolve(p.path),label:p.name,kind:p.kind||'project'});
    }
  }
  for(const p of saved.data.projects)workspace.roots.push({...p,generation:0,writable:false,permissions:{read:false,write:false,verify:false,ai:false},expiresAt:1});
  const engine=new Engine(workspace,limits,require('./src/connections.js').createModel(aiOptions));const app=express();const sessions=new Map(saved.data.sessions.filter(s=>Date.now()-s.created<sessionLifetime).map(s=>[s.id,s]));const requests=new Map();
  const memories=new ConversationMemory(saved,engine.model);
  const recordAndSummarize=async job=>{
    if(job.deletedConversation)return;
    await saved.record(job);
    if(job.autoMemory!==true||engine.model.mode!=='real')return;
    const conversation=saved.conversation(job.owner,job.projectId,job.conversationId);
    try{await memories.update(conversation,job.scope,{question:job.question,job});}
    catch{job.memoryError='記憶整理未完成；原始對話仍保留。';}
    finally{job.memoryUpdating=false;if(!job.deletedConversation)await saved.record(job);}
  };
  const persistProjects=async()=>{saved.data.projects=workspace.roots.filter(r=>r.id!=='demo').map(({id,path,label,kind,grantDefaults})=>({id,path,label,kind:kind||'project',grantDefaults}));await saved.save();};
  await persistProjects();
  const projects=new (require('./src/projects.js').Projects)(workspace);
  const images=new (require('./src/image-store.js').ImageStore)();
  const creations=new (require('./src/image-creation.js').ImageCreationService)({runtime,model:engine.model,fetchImpl:aiOptions.fetchImpl||fetch,saved});
  app.disable('x-powered-by');app.use(express.json({limit:'512kb'}));
  const isAdmin=req=>['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)&&req.body?.adminToken===adminToken;
  const requireAdmin=(req,res,next)=>isAdmin(req)?next():res.status(403).json({error:'此操作需要主機本機的管理碼确认'});
  app.use((req,res,next)=>{res.set({'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self' https://code.jquery.com/jquery-3.7.1.min.js https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/js/select2.min.js https://cdn.jsdelivr.net/npm/diff@5.2.0/dist/diff.min.js https://cdn.jsdelivr.net/npm/diff2html@3.4.52/bundles/js/diff2html-ui-slim.min.js; style-src 'self' https://cdn-uicons.flaticon.com https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/css/select2.min.css https://cdn.jsdelivr.net/npm/diff2html@3.4.52/bundles/css/diff2html.min.css https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/styles/github.min.css; font-src 'self' https://cdn-uicons.flaticon.com; frame-ancestors 'none'",'Cache-Control':'no-store'});next();});
  app.get('/api/session',async(req,res,next)=>{try{
    const cookie=req.headers.cookie?.match(/(?:^|; )cda_session=([a-f0-9]+)/)?.[1];
    let session=sessions.get(cookie);
    if(session&&Date.now()-session.created>=sessionLifetime){sessions.delete(cookie);session=null;}
    if(!session) {
      for(const [id,s] of sessions) if(Date.now()-s.created>sessionLifetime)sessions.delete(id);
      if(sessions.size>=500)return res.status(429).json({error:'工作階段上限'});
      const id=crypto.randomBytes(24).toString('hex');session={id,csrf:crypto.randomBytes(24).toString('hex'),created:Date.now()};sessions.set(id,session);
    }
    session.created=Date.now();res.cookie('cda_session',session.id,{httpOnly:true,sameSite:'strict',path:'/',maxAge:sessionLifetime});
    saved.data.sessions=[...sessions.values()];await saved.save();
    res.json({csrf:session.csrf,phase:2,mode:engine.model.mode||'mock',limits,tools:engine.model.mode==='real'?require('./src/ai-agent.js').definitions:registry,connections:require('./src/connections.js').status(engine.model),imageGeneration:creations.status(),pythonAvailable:!!require('./src/parsers.js').pythonPath()});
  }catch(e){next(e);}});
  app.use('/api',(req,res,next)=>{
    const id=req.headers.cookie?.match(/(?:^|; )cda_session=([a-f0-9]+)/)?.[1];const session=sessions.get(id);
    if(!session||Date.now()-session.created>=sessionLifetime||req.headers['x-cda-token']!==session.csrf)return res.status(403).json({error:'工作階段驗證失敗，請重新整理'});
    if(req.headers.origin&&req.headers.origin!==`${req.protocol}://${req.headers.host}`)return res.status(403).json({error:'拒絕跨來源操作'});
    req.owner=id;next();
  });
  const route=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
  const target=req=>req.headers['x-cda-project']||'demo';
  const scope=req=>new ProjectScope(workspace,target(req),JSON.parse(req.headers['x-cda-references']||'[]'));
  const context=req=>{
    const projectId=target(req);scope(req);
    const c=saved.conversation(req.owner,projectId,req.headers['x-cda-conversation']);
    if(c.jobs.length>=100)throw new Error('此對話已達 100 個任務，請建立新對話；舊紀錄保留');
    return {projectId,conversationId:c.id,referenceProjectIds:scope(req).referenceProjectIds};
  };
  const jobFor=req=>{const j=engine.get(req.params.id,req.owner);if(j.projectId!==target(req)|| (req.headers['x-cda-conversation']&&req.headers['x-cda-conversation']!==j.conversationId))throw new Error('任務不屬於目前專案或對話');const c=saved.conversation(req.owner,j.projectId,j.conversationId);if(c.jobs.some(item=>item.versions?.some(v=>v.id===j.id)))throw new Error('此為歷史需求版本，請載入編輯後重新執行');return j;};
  const anyJobFor=req=>{
    const c=saved.conversation(req.owner,target(req),req.headers['x-cda-conversation']);
    const image=c.jobs.find(j=>j.id===req.params.id&&j.kind==='image')||creations.jobs.get(req.params.id);
    if(image?.kind==='image')return creations.find(req.owner,target(req),c.id,req.params.id);
    return jobFor(req);
  };
  const imageConversation=req=>{
    if(!workspace.roots.some(r=>r.id===target(req))||!req.headers['x-cda-conversation'])throw new Error('請先開啟專案對話');
    return saved.conversation(req.owner,target(req),req.headers['x-cda-conversation']).id;
  };
  app.get('/api/image-settings',(req,res)=>res.json({maxImageMB:images.limit(req.owner),maxImages:5,supportsImages:engine.model.mode==='real'&&engine.model.config.supportsImages===true}));
  app.post('/api/image-settings',route(async(req,res)=>res.json({maxImageMB:images.setLimit(req.owner,req.body.maxImageMB)})));
  app.get('/api/image-draft',route(async(req,res)=>res.json({images:images.list(req.owner,target(req),imageConversation(req))})));
  app.get('/api/image-generation',(req,res)=>res.json(creations.status()));
  app.post('/api/image-generation',route(async(req,res)=>{
    const s=scope(req),ctx=context(req);
    if(!s.root(s.targetProjectId).permissions.ai)throw new Error('AI_PERMISSION：目前專案尚未授權提示詞送往 AI');
    const previous=creations.previous(req.owner,ctx.projectId,ctx.conversationId,req.body.previousJobId);
    const job=creations.start({owner:req.owner,projectId:ctx.projectId,conversationId:ctx.conversationId,prompt:req.body.prompt,imageModel:req.body.imageModel,previous});
    const live=creations.jobs.get(job.id);
    await saved.record(live);
    creations.launch(live,previous);
    res.status(202).json(job);
  }));
  app.get('/generated-images/:jobId',route(async(req,res)=>{
    const owner=req.headers.cookie?.match(/(?:^|; )cda_session=([a-f0-9]+)/)?.[1],session=sessions.get(owner);
    if(!session||Date.now()-session.created>=sessionLifetime)return res.sendStatus(403);
    const record=saved.data.conversations.find(c=>c.owner===owner&&c.jobs.some(j=>j.id===req.params.jobId&&j.kind==='image'));
    if(!record)return res.sendStatus(404);
    const job=creations.find(owner,record.projectId,record.id,req.params.jobId);
    if(job.status!=='completed')return res.sendStatus(404);
    res.set('Content-Security-Policy',"default-src 'none'; sandbox");res.type('png').send(await creations.readImage(job));
  }));
  app.post('/api/image-draft',express.raw({type:['image/png','image/jpeg','image/webp'],limit:'20mb'}),route(async(req,res)=>{
    const conversation=imageConversation(req),mime=req.get('content-type')?.split(';')[0];
    const image=images.add(req.owner,target(req),conversation,mime,req.body,decodeURIComponent(req.get('x-cda-image-name')||'貼入的圖片'));
    res.status(201).json(image);
  }));
  app.delete('/api/image-draft/:imageId',route(async(req,res)=>{images.remove(req.owner,target(req),imageConversation(req),req.params.imageId);res.json({status:'removed'});}));
  app.get('/attachments/:imageId',route(async(req,res)=>{
    const owner=req.headers.cookie?.match(/(?:^|; )cda_session=([a-f0-9]+)/)?.[1],session=sessions.get(owner);
    if(!session||Date.now()-session.created>=sessionLifetime)return res.sendStatus(403);
    const i=images.get(owner,req.params.imageId);res.type(i.mime).send(i.buffer);
  }));
  const inventory=req=>{
    const s=scope(req),data=workspace.inventory(),allowed=[s.targetProjectId,...s.referenceProjectIds];
    return {...data,files:s.files.map(({content,segments,...f})=>({...f,projectName:workspace.roots.find(r=>r.id===f.rootId).label})),roots:data.roots.filter(r=>allowed.includes(r.id)),issues:data.issues.filter(i=>allowed.some(id=>{const rel=path.relative(workspace.roots.find(r=>r.id===id).path,i.path);return !rel.startsWith('..')&&!path.isAbsolute(rel);} ))};
  };
  app.get('/api/catalog',(req,res)=>{
    const roots=workspace.roots.map(r=>({id:r.id,kind:r.kind||'project',name:r.label,path:r.path,active:!!workspace.active(r),permissions:r.permissions,expiresAt:r.expiresAt,grantDefaults:r.grantDefaults||{write:false,verify:false,ai:false,minutes:60}}));
    res.json({projects:roots.filter(r=>r.kind==='project'),globalReferences:roots.filter(r=>r.kind==='global-reference')});
  });
  app.post('/api/projects/:id/open',route(async(req,res)=>{
    const root=workspace.roots.find(r=>r.id===req.params.id);
    if(!root)throw new Error('找不到專案');
    if(process.platform!=='win32')throw new Error('目前只支援在 Windows 開啟資料夾');
    const {spawn}=require('node:child_process');
    const child=spawn('explorer.exe',[path.resolve(root.path)],{detached:true,stdio:'ignore'});
    child.unref();
    res.json({opened:true,path:root.path});
  }));
  app.get('/api/conversations',route(async(req,res)=>{
    if(!workspace.roots.some(r=>r.id===target(req)))throw new Error('找不到專案');
    const c=saved.conversation(req.owner,target(req),req.headers['x-cda-conversation']);await saved.save();
    res.json({id:c.id,memory:saved.publicMemory(c),conversations:saved.data.conversations.filter(x=>x.owner===req.owner&&x.projectId===target(req)).map(x=>({id:x.id,createdAt:x.createdAt})),jobs:c.jobs.map(j=>{
      const live=engine.jobs.get(j.id);return live?engine.public(live):j;
    })});
  }));
  app.get('/api/conversation-list',route(async(req,res)=>{
    if(!workspace.roots.some(r=>r.id===target(req)))throw new Error('找不到專案');
    res.json({conversations:saved.data.conversations.filter(c=>c.owner===req.owner&&c.projectId===target(req)).map(c=>({id:c.id,createdAt:c.createdAt,updatedAt:c.updatedAt||c.createdAt,title:c.jobs[0]?.question||'新對話'})).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))});
  }));
  app.post('/api/conversations',route(async(req,res)=>{
    if(!workspace.roots.some(r=>r.id===target(req)))throw new Error('找不到專案');
    if(saved.data.conversations.length>=500)throw new Error('對話保存數量已達上限');
    const id=crypto.randomUUID();saved.data.conversations.unshift({id,owner:req.owner,projectId:target(req),createdAt:new Date().toISOString(),jobs:[],memory:{version:1,confirmed:[],summary:'',compressedAt:null,sourceJobCount:0}});
    await saved.save();res.json({id});
  }));
  app.post('/api/skills/suggest',route(async(req,res)=>{
    const question=typeof req.body.question==='string'?req.body.question:'';
    if(question.length>4000)throw new Error('問題過長');
    res.json({suggestions:engine.model.mode==='real'?require('./src/skills.js').suggest(question):[]});
  }));
  app.post('/api/conversation-memory/confirm',route(async(req,res)=>{
    const c=saved.conversation(req.owner,target(req),req.headers['x-cda-conversation']);
    const result=saved.confirmRequirement(req.owner,target(req),c.id,req.body.jobId,{replace:req.body.replace===true});await saved.save();
    if(c.autoMemory&&result.confirmed){await memories.update(c,scope(req));result.memory=saved.publicMemory(c);}res.json(result);
  }));
  app.delete('/api/conversations/:id',route(async(req,res)=>{
    const projectId=target(req);if(!workspace.roots.some(r=>r.id===projectId))throw new Error('找不到專案');
    for(const job of engine.jobs.values())if(job.owner===req.owner&&job.projectId===projectId&&job.conversationId===req.params.id){job.deletedConversation=true;if(['running','awaiting_approval'].includes(job.status))engine.cancel(job.id,req.owner);}
    await saved.deleteConversation(req.owner,projectId,req.params.id);
    images.clearConversation(req.owner,projectId,req.params.id);
    const next=saved.data.conversations.find(c=>c.owner===req.owner&&c.projectId===projectId);
    res.json({status:'deleted',nextConversationId:next?.id||null});
  }));
  app.get('/project-preview/:id',route(async(req,res)=>{
    const owner=req.headers.cookie?.match(/(?:^|; )cda_session=([a-f0-9]+)/)?.[1];
    if(!sessions.has(owner))return res.status(403).send('請先由助手開啟專案預覽');
    const html=await projects.preview(req.params.id,owner);
    res.set('Content-Security-Policy',"sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline' https://code.jquery.com https://cdn.jsdelivr.net; style-src 'unsafe-inline' https://cdn.jsdelivr.net; connect-src 'none'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    res.set('Referrer-Policy','no-referrer');res.type('html').send(html);
  }));
  const checkProject=req=>{const p=projects.get(req.params.id,req.owner);if(p.rootId!==target(req))throw new Error('建立提案不屬於目前專案');scope(req).root(p.rootId);return p;};
  app.post('/api/projects',requireAdmin,route(async(req,res)=>{if(req.body.rootId!==target(req))throw new Error('請先切換到欲建立內容的目標專案');scope(req);res.status(202).json(await projects.propose(req.body,req.owner));}));
  app.post('/api/projects/:id/apply',requireAdmin,route(async(req,res)=>{checkProject(req);res.json(await projects.apply(req.params.id,req.owner));}));
  app.post('/api/projects/:id/cancel',requireAdmin,route(async(req,res)=>{checkProject(req);res.json(projects.cancel(req.params.id,req.owner));}));
  app.get('/api/files',route(async(req,res)=>res.json(inventory(req))));
  app.get('/api/connections',(req,res)=>res.json(require('./src/connections.js').status(engine.model)));
  app.post('/api/ai/test',requireAdmin,route(async(req,res)=>{
    if(engine.model.mode!=='real')throw new Error('CONFIG_REQUIRED：請先設定 real 模式、端點、模型與後端 key');
    const tool={name:'connection_check',description:'Return ok true to confirm a connection test.',parameters:{type:'object',additionalProperties:false,properties:{ok:{type:'boolean',enum:[true]}},required:['ok']}};
    const prompt='Connection test only. Call connection_check with ok true. For JSON mode return {"name":"connection_check","arguments":{"ok":true}}.';
    const response=await engine.model.turn([{role:'user',content:prompt}],[tool],AbortSignal.timeout(engine.model.config.overallTimeoutMs));
    let args;try{args=JSON.parse(response.call.arguments);}catch{}
    if(response.call.name!=='connection_check'||args?.ok!==true||Object.keys(args).length!==1)throw new Error('AI_SCHEMA：連線回應不符合測試 schema');
    engine.model.verified=true;
    res.json({status:'connected',message:'模型呼叫與工具格式驗證成功；此次只送出固定測試文字。',usage:response.usage});
  }));
  app.post('/api/versions/list',requireAdmin,route(async(req,res)=>res.json({versions:await workspace.listVersions()})));
  app.post('/api/versions/cleanup',requireAdmin,route(async(req,res)=>res.json(await workspace.removeVersions(req.body.ids))));
  app.post('/api/index',route(async(req,res)=>{const s=scope(req);await workspace.update([s.targetProjectId,...s.referenceProjectIds]);res.json(inventory(req));}));
  app.get('/api/files/:id',route(async(req,res)=>res.json(await scope(req).read(req.params.id))));
  app.post('/api/roots/request',route(async(req,res)=>{
    if(typeof req.body.path!=='string'||req.body.path.length>1024)throw new Error('路徑格式錯誤');
    if(requests.size>=100)throw new Error('授權請求上限');
    const kind=req.body.kind||'project';
    if(!['project','global-reference'].includes(kind))throw new Error('授權類型不合法');
    if(kind==='global-reference'&&(req.body.write||req.body.verify||req.body.create))throw new Error('全域參考只能授權既有資料夾唯讀');
    const permissions={write:req.body.write===true,verify:req.body.verify===true,ai:req.body.ai===true,minutes:req.body.minutes??60};
    if(!Number.isInteger(permissions.minutes)||permissions.minutes<1||permissions.minutes>1440)throw new Error('授權有效期必須是 1–1440 分鐘');
    const request={id:crypto.randomUUID(),kind,path:req.body.path,owner:req.owner,status:'pending',create:req.body.create===true,permissions};requests.set(request.id,request);res.json(request);
  }));
  app.post('/api/roots/:id/approve',route(async(req,res)=>{
    const local=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
    if(!local||req.body.adminToken!==adminToken)return res.status(403).json({error:'新增資料夾需在主機本機，以終端顯示的管理碼授權'});
    const request=requests.get(req.params.id);if(!request||request.status!=='pending')throw new Error('授權請求不存在');
    if(request.owner!==req.owner)throw new Error('授權請求不屬於本工作階段');
    const createdPath=request.create?await workspace.createDirectory(request.path):null;
    const root=await workspace.authorize(createdPath||request.path,{...request.permissions,kind:request.kind});
    root.grantDefaults={...request.permissions};
    if(createdPath)await workspace.audit('create-folder',{rootId:root.id,path:createdPath});
    await persistProjects();request.status='approved';res.json({status:'approved',access:root.permissions.write?'write':'readonly',created:!!createdPath,root});
  }));
  app.post('/api/roots/:id/revoke',requireAdmin,route(async(req,res)=>{await workspace.revoke(req.params.id);res.json({status:'revoked'});}));
  app.post('/api/proposals',requireAdmin,route(async(req,res)=>{
    if(typeof req.body.fileId!=='string'||typeof req.body.version!=='string')throw new Error('需要已索引的檔案 ID 與版本');
    const s=scope(req),f=await s.read(req.body.fileId);s.check(f,true);if(f.hash!==req.body.version)throw new Error('編輯器版本已過期，請重新載入');
    const job=await engine.manual(f.id,req.body.after,req.owner,s,context(req));await saved.record(engine.get(job.id,req.owner));res.status(202).json(job);
  }));
  app.post('/api/files/:id/verify',requireAdmin,route(async(req,res)=>{
    const s=scope(req),file=await s.read(req.params.id);if(file.rootId!==s.targetProjectId)throw new Error('參考專案不可執行驗證');const root=s.root(file.rootId);
    if(!root.permissions.verify)throw new Error('此範圍未授權靜態驗證');
    if(!/\.(js|cjs|mjs|py|html|css|json)$/.test(file.path))throw new Error('此檔案無靜態 profile');
    const result=await workspace.verify(file.path,file.content);await workspace.audit('verify',{fileId:file.id,version:file.hash,status:result.status});res.json(result);
  }));
  app.post('/api/jobs',route(async(req,res)=>{
    const {question,fileIds=[]}=req.body;
    if(req.body.autoMemory!==undefined&&typeof req.body.autoMemory!=='boolean')throw new Error('自動記憶參數必須為布林值');
    if(typeof question!=='string'||!question.trim()||question.length>4000||!Array.isArray(fileIds)||fileIds.length>6||fileIds.some(id=>typeof id!=='string'))throw new Error('問題或檔案參數不合法');
    const s=scope(req),ctx=context(req),selectedImages=images.select(req.owner,ctx.projectId,ctx.conversationId,req.body.imageIds||[]);
    if(engine.model.mode==='real'&&!s.root(s.targetProjectId).permissions.ai)throw new Error('AI_PERMISSION：目前專案尚未授權內容送往 AI');
    let skill=null;if(req.body.skillId!==undefined){
      if(engine.model.mode!=='real')throw new Error('技能流程需要已設定的 real AI');
      const definition=require('./src/skills.js').get(req.body.skillId);skill={id:definition.id,name:definition.name};
    }
    if(selectedImages.length){
      if(engine.model.mode!=='real'||!engine.model.config.supportsImages)throw new Error('AI_IMAGE_UNSUPPORTED：此模型／端點不支援圖片或尚未設定圖片能力；圖片未送出');
      if(!s.root(s.targetProjectId).permissions.ai)throw new Error('AI_PERMISSION：目前專案尚未授權圖片送往 AI');
    }
    const conversation=saved.conversation(req.owner,ctx.projectId,ctx.conversationId),canSendHistory=engine.model.mode==='real'&&s.root(s.targetProjectId).permissions.ai===true;
    const resolved=saved.resolveRequest(conversation,question,req.body);
    if(resolved.taskId){const previous=conversation.jobs.find(j=>(j.taskId||j.id)===resolved.taskId),live=engine.jobs.get(previous.id);if(live&&['running','applying','awaiting_approval'].includes(live.status))throw new Error('請先完成或取消原任務再編輯');}
    if(resolved.requiresContinuationSelection)return res.status(200).json(resolved);
    if(resolved.enableEdits&&!s.root(s.targetProjectId).permissions.write)throw new Error('目前專案尚未授權修改，請先完成授權');
    const autoMemory=req.body.autoMemory===true&&engine.model.mode==='real';
    conversation.autoMemory=autoMemory;
    if(autoMemory&&estimateTokens({question:resolved.question,turns:memories.eligible(conversation,s).map(turn)})>=(engine.model.config.memoryBudgetTokens||8000)*0.75)await memories.update(conversation,s,{question:resolved.question});
    const historyContext=canSendHistory?(autoMemory?memories.context(conversation,s,resolved.question):saved.context(conversation,resolved.question)):null;
    const historySources=autoMemory?memories.eligible(conversation,s):[];
    const historyCheck=()=>{if(autoMemory&&(!s.root(s.targetProjectId).permissions.ai||historySources.some(job=>!memories.canSend(job,s))))throw new Error('AI_PERMISSION：記憶来源外送授權已變更');};
    if(historyContext&&(resolved.continuationOf||resolved.taskId)){historyContext.currentRequest=resolved.question;historyContext.retrieved=[];historyContext.notice+=' 本次完整需求優先於舊記憶；依本次需求執行，舊需求僅供參考。';if(resolved.taskId){historyContext.recent=historyContext.recent.filter(t=>t.question!==conversation.jobs.find(j=>(j.taskId||j.id)===resolved.taskId)?.question);}}
    const effectiveFileIds=fileIds.length?fileIds:(resolved.sourceFileIds||[]).filter(id=>s.files.some(f=>f.id===id));
    const job=engine.start(resolved.question,effectiveFileIds,req.owner,s,{...ctx,...resolved,autoMemory,memoryUpdating:autoMemory,allowEdits:skill?false:req.body.allowEdits===true||resolved.enableEdits===true,skill,historyContext,historyCheck,attachments:selectedImages.map(i=>images.meta(i)),imageInputs:selectedImages.map(({mime,buffer})=>({mime,buffer}))}),internal=engine.get(job.id,req.owner);
    for(const i of selectedImages)i.jobId=job.id;
    await saved.record(internal);
    job.versions=conversation.jobs.find(j=>j.id===job.id)?.versions||[];internal.versions=job.versions;
    internal.finished.then(()=>recordAndSummarize(internal)).catch(e=>{internal.memoryUpdating=false;internal.persistenceError='對話保存失敗：'+e.message;});
    res.status(202).json(job);
  }));
  app.get('/api/jobs/:id',route(async(req,res)=>{const job=anyJobFor(req);res.json(job.kind==='image'?creations.public(job):{...engine.public(job),memory:saved.publicMemory(saved.conversation(req.owner,job.projectId,job.conversationId))});}));
  app.post('/api/jobs/:id/cancel',route(async(req,res)=>{const job=anyJobFor(req);if(job.kind==='image')return res.json(creations.cancel(job));const result=engine.cancel(req.params.id,req.owner);await saved.record(job);res.json(result);}));
  app.post('/api/jobs/:id/apply',route(async(req,res)=>{
    const job=jobFor(req);
    if(job.proposal?.rootId!=='demo'&&!isAdmin(req))return res.status(403).json({error:'真實檔案套用需主機管理碼確認'});
    let result;try{result=await engine.apply(req.params.id,req.owner);}finally{job.memoryUpdating=job.autoMemory===true;await recordAndSummarize(job);}res.json({...engine.public(job),memory:saved.publicMemory(saved.conversation(req.owner,job.projectId,job.conversationId))});
  }));
  app.post('/api/jobs/:id/new-files/:itemId',requireAdmin,route(async(req,res)=>{
    const job=jobFor(req);let result;
    try{result=await engine.decideNewFile(job.id,req.owner,req.params.itemId,req.body.decision);}finally{job.memoryUpdating=job.autoMemory===true;await recordAndSummarize(job);}
    res.json({...engine.public(job),memory:saved.publicMemory(saved.conversation(req.owner,job.projectId,job.conversationId))});
  }));
  app.post('/api/jobs/:id/restore',requireAdmin,route(async(req,res)=>{
    const job=jobFor(req);if(!job.applied||job.restored)throw new Error('沒有可還原的修改');
    const file=await job.scope.read(job.proposal.fileId);
    if(file.content!==job.proposal.after)throw new Error('套用後又有其他修改，拒絕覆蓋；請人工比較備份');
    const proposal=await job.scope.createProposal(file.id,job.proposal.before,'restore');
    const result=await job.scope.apply(proposal);job.restored=true;engine.event(job,'已還原修改');job.finishedAt=Date.now();job.memoryUpdating=job.autoMemory===true;await recordAndSummarize(job);res.json(result);
  }));
  app.use(express.static(path.join(__dirname,'public')));
  app.use((err,req,res,next)=>res.status(400).json({error:err.message||'操作失敗'}));
  return {app,engine,workspace,projects,adminToken,saved,images,creations};
}
if(require.main===module)createApp().then(({app,adminToken,engine})=>{
  const host=process.env.CDA_HOST||config.host,port=Number(process.env.CDA_PORT||config.port);
  app.listen(port,host,()=>{console.log(`Project assistant (AI: ${engine.model.mode||'mock'}; DB unconfigured): http://${host}:${port}`);console.log(`本機資料夾授權管理碼（勿分享）：${adminToken}`);console.log('專案登錄與對話保存於 runtime/assistant-state；重啟需重新授權外部資料夾，舊任務不自動恢復執行。');});
}).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={createApp};

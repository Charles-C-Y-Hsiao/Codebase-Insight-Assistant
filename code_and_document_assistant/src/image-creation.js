const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {imageSize}=require('image-size');
const {within}=require('./path-policy.js');

const IMAGE_ENDPOINT='https://api.openai.com/v1/images';
const MAX_IMAGE_BYTES=20*1024*1024;
const IMAGE_MODEL_OPTIONS=['gpt-image-2.5-sunburst','gpt-image-1'];
const DEFAULT_IMAGE_MODEL='gpt-image-2.5-sunburst';
function imageModel(config){return config?.provider==='openai'?config.imageGenerationModel||'': '';}
function imageSlug(prompt){
  const words=String(prompt).match(/[A-Za-z][A-Za-z0-9-]*/g)||[];
  const useful=words.filter(word=>word.length>2&&!/^(please|create|make|image|picture|with|from|this|that|the|and|for|use)$/i.test(word)).slice(0,5);
  if(useful.length)return useful.join('-').toLowerCase().slice(0,64);
  const subject=String(prompt).replace(/^(?:請|幫我|我要|請幫我|製作|產生|生成|畫出|設計|一張|一個|一幅|圖片|圖像|簡報|資訊圖表|的|\s)+/u,'').match(/[\p{Script=Han}]{2,}/u)?.[0];
  return subject?.slice(0,18)||'創作-'+crypto.createHash('sha256').update(prompt).digest('hex').slice(0,8);
}
class ImageCreationService{
  constructor({runtime,model,fetchImpl=fetch,saved,projectRootForId=()=>null}){
    this.base=path.join(runtime,'assistant-state','generated-images');
    this.model=model;this.fetch=fetchImpl;this.saved=saved;this.projectRootForId=projectRootForId;this.jobs=new Map();
  }
  status(){return {enabled:!!imageModel(this.model?.config),model:imageModel(this.model?.config)||null,models:IMAGE_MODEL_OPTIONS,provider:this.model?.config?.provider||null};}
  projectStatus(){
    let keyReady=false;try{keyReady=this.model?.config?.provider==='openai'&&typeof this.model.imageKey==='function'&&!!this.model.imageKey();}catch{}
    return {enabled:keyReady,model:DEFAULT_IMAGE_MODEL,models:IMAGE_MODEL_OPTIONS,provider:this.model?.config?.provider||null};
  }
  public(job){const {owner,controller,finished,imageProjectDirectory,referenceImages,...visible}=job;return visible;}
  find(owner,project,conversation,id){
    const c=this.saved.conversation(owner,project,conversation);
    const job=this.jobs.get(id)||c.jobs.find(item=>item.id===id&&item.kind==='image');
    if(!job||job.owner&&job.owner!==owner||job.projectId!==project||job.conversationId!==conversation)throw new Error('圖片任務不屬於目前對話');
    return job;
  }
  previous(owner,project,conversation,id){
    if(!id)return null;
    const job=this.find(owner,project,conversation,id);
    if(job.status!=='completed'||!job.imageCreation?.fileName)throw new Error('上一版圖片尚未完成');
    return job;
  }
  start({owner,projectId,conversationId,prompt,imageModel:requestedModel,previous=null,allowDefaultModel=false,imageProject=null,series=null,currentRequest=null,memorySnapshot=null,referenceImages=[],response=null,storeInProject=false}){
    const config=this.model?.config,configuredModel=imageModel(config);
    if(!configuredModel&&!allowDefaultModel)throw new Error('IMAGE_UNAVAILABLE：請在官方 OpenAI AI 設定中指定 imageGenerationModel；目前沒有核准的圖片模型');
    if(allowDefaultModel&&!this.projectStatus().enabled)throw new Error('IMAGE_UNAVAILABLE：請在服務啟動設定中提供官方 OpenAI API key');
    if(requestedModel&&!IMAGE_MODEL_OPTIONS.includes(requestedModel))throw new Error('IMAGE_MODEL_INVALID：圖片模型不在允許清單');
    const model=requestedModel||configuredModel||DEFAULT_IMAGE_MODEL;
    if(typeof prompt!=='string'||!prompt.trim()||prompt.length>15000)throw new Error('圖片提示詞需為 1–15000 字');
    const seriesId=series?.id||previous?.imageCreation.seriesId||crypto.randomUUID();
    const version=(previous?.imageCreation.version||0)+1;
    if([...this.jobs.values()].some(j=>j.imageCreation?.seriesId===seriesId&&j.status==='running'))throw new Error('此圖片系列正在產生新版本，請稍候');
    const slug=previous?.imageCreation.slug||imageSlug(prompt),projectInfo=imageProject?{id:imageProject.id,name:imageProject.name,folderName:imageProject.folderName}:null;
    if(!Array.isArray(referenceImages)||referenceImages.length>5)throw new Error('本次圖片創作最多 5 張參考圖');
    const references=referenceImages.map(({buffer,...reference})=>reference);
    const responseRecord=response&&typeof response.answer==='string'?{answer:response.answer.slice(0,12000),source:response.source||'image-generation'}:null;
    const jobId=crypto.randomUUID();
    const projectStorage=storeInProject&&!imageProject?{kind:'project',relativeDirectory:path.join('.cda','image-generations',owner,conversationId,seriesId)}:null;
    const job={id:jobId,kind:'image',owner,projectId,conversationId,question:currentRequest||prompt,status:'running',progress:'正在創作圖片',startedAt:Date.now(),finishedAt:null,plan:[],events:[],iterations:[],tools:[],evidence:[],result:null,ai:{provider:'openai',model,requests:1,usage:[],cost:null},archived:false,imageCreation:{seriesId,seriesName:series?.name||null,slug,version,previousJobId:previous?.id||null,draftJobId:memorySnapshot?.draftJobId||null,promptCompositionId:memorySnapshot?.promptCompositionId||null,promptSource:memorySnapshot?.promptSource||'legacy',model,prompt,currentRequest:currentRequest||prompt,projectSummary:memorySnapshot?.projectSummary||'',projectSummaryVersion:memorySnapshot?.projectSummaryVersion||0,seriesSummary:memorySnapshot?.seriesSummary||'',seriesSummaryVersion:memorySnapshot?.seriesSummaryVersion||0,referenceJobIds:Array.isArray(memorySnapshot?.referenceJobIds)?memorySnapshot.referenceJobIds:[],references,createdAt:new Date().toISOString(),fileName:null,mime:'image/png',imageProject:projectInfo,outputFileName:null,projectStorage,taskRecordFileName:projectStorage?jobId+'.task.json':null,response:responseRecord},referenceImages,imageProjectDirectory:imageProject?.directory||null,controller:new AbortController()};
    this.jobs.set(job.id,job);
    return this.public(job);
  }
  launch(job,previous){job.finished=this.run(job,previous);}
  async run(job,previous){
    try{
      const config=this.model.config;
      const directory=await this.directoryFor(job,{create:true}),seriesSuffix=job.imageCreation.seriesId.split('-').at(-1).slice(-11);
      while(true){
        const name=job.imageCreation.slug+'-v'+job.imageCreation.version+'.png';
        const outputName=job.imageProjectDirectory?`${job.imageCreation.imageProject.folderName}-${job.imageCreation.slug}-${seriesSuffix}-v${job.imageCreation.version}.png`:null;
        const occupied=await fs.access(path.join(directory,name)).then(()=>true,()=>false)||outputName&&await fs.access(path.join(job.imageProjectDirectory,outputName)).then(()=>true,()=>false);
        if(!occupied)break;
        job.imageCreation.version++;
      }
      let endpoint=IMAGE_ENDPOINT+'/generations',body,headers={Authorization:config.authPrefix+this.model.imageKey()};
      const sources=[...job.referenceImages];
      if(previous&&!sources.some(item=>item.generatedJobId===previous.id))sources.unshift({id:'previous-'+previous.id,name:'previous-version.png',mime:'image/png',source:'previous',generatedJobId:previous.id,buffer:await this.readImage(previous)});
      if(sources.length){
        const form=new FormData();form.set('model',job.imageCreation.model);form.set('prompt',job.imageCreation.prompt);for(const source of sources)form.append('image[]',new Blob([source.buffer],{type:source.mime}),source.name||'reference.png');form.set('output_format','png');
        body=form;endpoint=IMAGE_ENDPOINT+'/edits';
      }else{
        headers['Content-Type']='application/json';body=JSON.stringify({model:job.imageCreation.model,prompt:job.imageCreation.prompt,output_format:'png'});
      }
      const signal=AbortSignal.any([job.controller.signal,AbortSignal.timeout(180000)]);
      const response=await this.fetch(endpoint,{method:'POST',headers,body,signal,redirect:'error'});
      if(!response.ok){await response.body?.cancel();throw new Error('圖片服務拒絕請求（HTTP '+response.status+'）；請檢查模型權限、額度與格式');}
      const reader=response.body.getReader();let total=0;const chunks=[];
      try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>MAX_IMAGE_BYTES*4/3+1024*1024){await reader.cancel();throw new Error('圖片回應超過大小限制');}chunks.push(value);}}finally{reader.releaseLock();}
      let data;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new Error('圖片回應格式不合法');}
      const encoded=data.data?.[0]?.b64_json;
      if(typeof encoded!=='string'||encoded.length>MAX_IMAGE_BYTES*4/3+16)throw new Error('圖片回應缺少有效的 PNG 內容或超過 20 MB');
      const bytes=Buffer.from(encoded,'base64');
      if(!bytes.length||bytes.length>MAX_IMAGE_BYTES||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new Error('圖片回應不是有效的 PNG');
      const size=imageSize(bytes);if(!size.width||!size.height||size.width*size.height>40000000)throw new Error('圖片尺寸超過限制');
      await fs.mkdir(directory,{recursive:true});
      const name=job.imageCreation.slug+'-v'+job.imageCreation.version+'.png';
      await fs.writeFile(path.join(directory,name),bytes,{flag:'wx',mode:0o600});
      job.imageCreation.fileName=name;job.imageCreation.width=size.width;job.imageCreation.height=size.height;
      await fs.writeFile(path.join(directory,name.slice(0,-4)+'.json'),JSON.stringify(job.imageCreation,null,2),{flag:'wx',mode:0o600});
      if(job.imageProjectDirectory){
        const outputName=`${job.imageCreation.imageProject.folderName}-${job.imageCreation.slug}-${seriesSuffix}-v${job.imageCreation.version}.png`;
        await fs.writeFile(path.join(job.imageProjectDirectory,outputName),bytes,{flag:'wx',mode:0o600});
        job.imageCreation.outputFileName=outputName;
        await fs.writeFile(path.join(job.imageProjectDirectory,outputName.slice(0,-4)+'.json'),JSON.stringify(job.imageCreation,null,2),{flag:'wx',mode:0o600});
      }
      job.status='completed';job.progress='圖片創作完成';job.finishedAt=Date.now();job.result={conclusions:['已產生 '+(job.imageCreation.outputFileName||name)],facts:[],inferences:[],unknown:[],mock:false};
    }catch(error){
      job.status='partial';job.progress='圖片創作失敗';job.finishedAt=Date.now();
      job.imageCreation.error={code:error.code||error.name||'IMAGE_CREATION_FAILED',message:error.message||'圖片產生或保存失敗'};
      job.result={conclusions:[],facts:[],inferences:[],unknown:[job.controller.signal.aborted?'圖片創作已取消':/圖片服務拒絕|圖片回應|圖片尺寸/.test(error.message)?error.message:'圖片產生或保存失敗，請檢查服務設定'],mock:false};
    }finally{
      if(job.imageCreation.projectStorage)try{await this.writeTaskArchive(job);}catch(error){job.imageCreation.archiveError=error.message;job.status='partial';job.progress='圖片任務紀錄保存失敗';job.result={...(job.result||{}),unknown:[...new Set([...(job.result?.unknown||[]),'專案內的完整任務紀錄未能保存：'+error.message])],mock:false};}
      await this.saved.record(job);
    }
  }
  async directoryFor(job,{create=false}={}){
    const storage=job.imageCreation?.projectStorage;
    if(!storage)return path.join(this.base,job.projectId,job.conversationId,job.imageCreation.seriesId);
    if(storage.kind!=='project'||typeof storage.relativeDirectory!=='string'||path.isAbsolute(storage.relativeDirectory)||storage.relativeDirectory.split(/[\\/]/).includes('..'))throw new Error('專案圖片保存路徑不合法');
    const projectRoot=this.projectRootForId(job.projectId);if(typeof projectRoot!=='string'||!path.isAbsolute(projectRoot))throw new Error('找不到圖片所屬的一般專案路徑');
    const root=await fs.realpath(projectRoot),directory=path.resolve(root,storage.relativeDirectory);if(!within(root,directory)||directory===root)throw new Error('專案圖片保存路徑超出專案範圍');
    let current=root;for(const part of path.relative(root,directory).split(path.sep)){current=path.join(current,part);if(create)try{await fs.mkdir(current);}catch(error){if(error.code!=='EEXIST')throw error;}const stat=await fs.lstat(current);if(stat.isSymbolicLink()||!stat.isDirectory()||!within(root,await fs.realpath(current)))throw new Error('專案圖片保存目錄不安全');}
    return directory;
  }
  taskArchive(job){
    const {controller,finished,referenceImages,imageProjectDirectory,...record}=job;
    return {schemaVersion:1,archiveType:'project-image-job',archivedAt:new Date().toISOString(),job:record};
  }
  async writeTaskArchive(job){
    const directory=await this.directoryFor(job,{create:true}),name=job.imageCreation.taskRecordFileName;
    if(typeof name!=='string'||!/^[0-9a-f-]{36}\.task\.json$/i.test(name))throw new Error('圖片任務紀錄檔名不合法');
    const target=path.join(directory,name),payload=JSON.stringify(this.taskArchive(job),null,2);
    try{await fs.writeFile(target,payload,{flag:'wx',mode:0o600});}
    catch(error){if(error.code!=='EEXIST')throw error;const stat=await fs.lstat(target);if(stat.isSymbolicLink()||!stat.isFile())throw new Error('圖片任務紀錄檔路徑不安全');const existing=JSON.parse(await fs.readFile(target,'utf8'));if(existing.archiveType!=='project-image-job'||existing.job?.id!==job.id)throw new Error('圖片任務紀錄檔已被其他任務占用');await fs.writeFile(target,payload,{mode:0o600});}
    return target;
  }
  async hasProjectTaskArchive(job){
    if(job.imageCreation?.projectStorage?.kind!=='project'||!job.imageCreation.taskRecordFileName)return false;
    try{const directory=await this.directoryFor(job),record=path.join(directory,job.imageCreation.taskRecordFileName),stat=await fs.lstat(record);if(stat.isSymbolicLink()||!stat.isFile())return false;if(job.imageCreation.fileName){const image=await fs.lstat(path.join(directory,job.imageCreation.fileName));if(image.isSymbolicLink()||!image.isFile())return false;}return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}
  }
  async projectArchiveBase(projectRoot){
    const root=await fs.realpath(projectRoot);let current=root;
    for(const part of ['.cda','image-generations']){current=path.join(current,part);const stat=await fs.lstat(current).catch(error=>error.code==='ENOENT'?null:Promise.reject(error));if(!stat)return null;if(stat.isSymbolicLink()||!stat.isDirectory()||!within(root,await fs.realpath(current)))throw new Error('專案圖片保存目錄不安全');}
    return current;
  }
  async migrateProjectImages(projectId,projectRoot){
    const configuredRoot=this.projectRootForId(projectId);if(typeof projectRoot!=='string'||typeof configuredRoot!=='string'||path.resolve(projectRoot)!==path.resolve(configuredRoot))throw new Error('圖片專案保存路徑與目前授權專案不符');
    const conversations=this.saved.data.conversations.filter(conversation=>conversation.projectId===projectId),changes=[],cleanup=[];
    for(const conversation of conversations)for(const record of conversation.jobs||[]){
      if(record.kind!=='image'||record.imageCreation?.imageProject)continue;
      const image=record.imageCreation;if(!image?.seriesId)continue;
      const projectStorage=image.projectStorage||{kind:'project',relativeDirectory:path.join('.cda','image-generations',conversation.owner,conversation.id,image.seriesId)},taskRecordFileName=image.taskRecordFileName||record.id+'.task.json',job={...record,owner:conversation.owner,projectId,conversationId:conversation.id,imageCreation:{...image,projectStorage,taskRecordFileName}};
      const directory=await this.directoryFor(job,{create:true});
      if(image.fileName){
        const source=path.join(this.base,projectId,conversation.id,image.seriesId,image.fileName),target=path.join(directory,image.fileName),stat=await fs.stat(source).catch(error=>error.code==='ENOENT'?null:Promise.reject(error)),targetStat=await fs.stat(target).catch(error=>error.code==='ENOENT'?null:Promise.reject(error));
        if(!stat&&!targetStat)throw new Error('找不到既有圖片的中央檔或專案副本，停止搬移並保留任務紀錄');
        if(stat&&!targetStat){await fs.copyFile(source,target,require('node:fs').constants.COPYFILE_EXCL);cleanup.push(source);}
        else if(stat&&targetStat){const [a,b]=await Promise.all([fs.readFile(source),fs.readFile(target)]);if(!a.equals(b)){if(!image.projectStorage)throw new Error('既有專案圖片與中央圖片內容不同，停止搬移以保留兩份資料');}else cleanup.push(source);}
        const sourceJson=source.replace(/\.png$/i,'.json'),targetJson=target.replace(/\.png$/i,'.json');
        const sourceMetadata=await fs.readFile(sourceJson,'utf8').catch(error=>error.code==='ENOENT'?null:Promise.reject(error)),metadata=image.projectStorage?JSON.stringify(job.imageCreation,null,2):sourceMetadata||JSON.stringify(job.imageCreation,null,2);
        await fs.writeFile(targetJson,metadata,{flag:'wx',mode:0o600}).catch(async error=>{if(error.code!=='EEXIST')throw error;const stat=await fs.lstat(targetJson);if(stat.isSymbolicLink()||!stat.isFile())throw new Error('既有圖片 JSON 路徑不安全');const existing=JSON.parse(await fs.readFile(targetJson,'utf8'));if(existing.prompt!==job.imageCreation.prompt||existing.fileName!==job.imageCreation.fileName)throw new Error('既有圖片 JSON 與任務紀錄不符，停止搬移');});if(sourceMetadata)cleanup.push(sourceJson);
      }
      await this.writeTaskArchive(job);if(!image.projectStorage||!image.taskRecordFileName)changes.push({record,image:record.imageCreation,next:job.imageCreation,conversation,live:this.jobs.get(record.id)});
    }
    if(!changes.length)return 0;
    for(const change of changes){change.record.imageCreation=change.next;if(change.live)change.live.imageCreation=change.next;}
    try{await this.saved.save();}catch(error){for(const change of changes){change.record.imageCreation=change.image;if(change.live)change.live.imageCreation=change.image;}throw error;}
    for(const file of cleanup)await fs.rm(file,{force:true}).catch(()=>{});
    const emptyCandidates=new Set();for(const file of cleanup){let folder=path.dirname(file);while(folder!==this.base&&within(this.base,folder)){emptyCandidates.add(folder);folder=path.dirname(folder);}}
    for(const folder of [...emptyCandidates].sort((a,b)=>b.length-a.length))await fs.rmdir(folder).catch(error=>{if(error.code!=='ENOENT'&&error.code!=='ENOTEMPTY')throw error;});
    return changes.length;
  }
  async listProjectArchive(projectId,projectRoot,owner){
    const root=await fs.realpath(projectRoot),base=await this.projectArchiveBase(root);if(!base)return [];
    const results=[];
    const visit=async(folder,depth)=>{if(depth>4)return;for(const entry of await fs.readdir(folder,{withFileTypes:true}).catch(error=>error.code==='ENOENT'?[]:Promise.reject(error))){const full=path.join(folder,entry.name),stat=await fs.lstat(full);if(stat.isSymbolicLink())continue;if(entry.isDirectory()){await visit(full,depth+1);continue;}if(!entry.isFile()||!entry.name.endsWith('.task.json'))continue;let archive;try{archive=JSON.parse(await fs.readFile(full,'utf8'));}catch{continue;}const job=archive?.job;if(archive?.archiveType==='project-image-job'&&job?.kind==='image'&&job.owner===owner&&job.projectId===projectId)results.push({id:job.id,conversationId:job.conversationId,seriesId:job.imageCreation?.seriesId,status:job.status,question:job.question,prompt:job.imageCreation?.prompt||'',fileName:job.imageCreation?.fileName||null,finishedAt:job.finishedAt||null});}};
    await visit(base,0);return results.sort((a,b)=>(Number(a.finishedAt)||0)-(Number(b.finishedAt)||0));
  }
  async readProjectArchive(projectId,projectRoot,owner,jobId){
    const root=await fs.realpath(projectRoot),base=await this.projectArchiveBase(root);if(!base)throw new Error('找不到此專案中可恢復的圖片任務紀錄');
    const visit=async(folder,depth)=>{if(depth>4)return null;for(const entry of await fs.readdir(folder,{withFileTypes:true}).catch(error=>error.code==='ENOENT'?[]:Promise.reject(error))){const full=path.join(folder,entry.name),stat=await fs.lstat(full);if(stat.isSymbolicLink())continue;if(entry.isDirectory()){const found=await visit(full,depth+1);if(found)return found;continue;}if(entry.isFile()&&entry.name===jobId+'.task.json'){const archive=JSON.parse(await fs.readFile(full,'utf8')),job=archive?.job;if(archive?.archiveType==='project-image-job'&&job?.id===jobId&&job.owner===owner&&job.projectId===projectId&&job.kind==='image')return job;}}return null;};
    const job=await visit(base,0);if(!job)throw new Error('找不到此專案中可恢復的圖片任務紀錄');return job;
  }
  async readImage(job){
    const image=job.imageCreation;
    if(!image?.fileName||!/^[\w\p{Script=Han}-]+-v\d+\.png$/u.test(image.fileName)||!(/^[0-9a-f-]{36}$/i.test(image.seriesId)))throw new Error('圖片檔案名稱不合法');
    const directory=await this.directoryFor(job);const file=path.join(directory,image.fileName),stat=await fs.lstat(file);if(stat.isSymbolicLink()||!stat.isFile())throw new Error('圖片檔案路徑不安全');return fs.readFile(file);
  }
  cancel(job){if(job.status==='running'){job.controller.abort();job.progress='正在取消圖片創作';}return this.public(job);}
}
module.exports={ImageCreationService,imageSlug};

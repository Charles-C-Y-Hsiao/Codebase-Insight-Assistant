const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const http=require('node:http');
const {AIClient}=require('../src/ai-client.js');
const {loadConfig}=require('../src/ai-config.js');
const {Engine}=require('../src/engine.js');
const {ProjectScope}=require('../src/project-scope.js');
const {Workspace}=require('../src/workspace.js');
const limits=require('../config/example.json').limits;
const finish={status:'completed',answer:'已查得文件。\n\n- 原文包含 `marker`。\n- 請核對來源。',steps:['核對文件'],conclusions:['已查得文件'],facts:[{text:'原文含有 marker',evidenceIds:['AI-E1']}],inferences:[],unknown:[]};
async function setup(t,settings={},permissions={}){
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'cda-ai-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));
  const file=path.join(base,'ai.json');await fs.writeFile(file,JSON.stringify({provider:'openai-compatible',protocol:'responses',endpoint:'http://127.0.0.1:1/v1/responses',model:'test-model',...settings}));
  const env={CDA_MODEL_MODE:'real',CDA_AI_CONFIG:file,CDA_AI_KEY:'FAKE_TEST_KEY_NOT_REAL'};
  const ws=new Workspace(path.join(base,'state'),limits);await ws.init(path.join(__dirname,'../examples'));
  const tree=path.join(base,'projects'),dir=path.join(tree,'a');await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,'main.js'),'const marker=1;');
  const root=await ws.authorize(dir,{write:true,ai:true,...permissions}),scope=new ProjectScope(ws,root.id),f=scope.files[0];
  return {base,file,env,ws,root,scope,f,tree};
}
const responseCall=(name,args,id='call-1')=>({status:'completed',output:[{type:'function_call',call_id:id,name,arguments:JSON.stringify(args)}],usage:{input_tokens:12,output_tokens:8}});
async function run(fixture,fetchImpl,options={}){const client=new AIClient({env:fixture.env,fetchImpl}),engine=new Engine(fixture.ws,limits,client);const job=engine.start('讀取 marker 並說明',options.ids||[], 'test',fixture.scope,{allowEdits:!!options.edit,...(options.context||{})});const j=engine.get(job.id,'test');await j.finished;return {j,engine,client};}
test('Responses 原生工具：讀檔、引用、用量、外送僅授權資料',async t=>{
  const f=await setup(t);await fs.mkdir(path.join(f.tree,'b'));await fs.writeFile(path.join(f.tree,'b','private.txt'),'DO_NOT_SEND');
  await f.ws.authorize(path.join(f.tree,'b'),{ai:false});const g=await f.ws.authorize(f.tree,{kind:'global-reference',ai:true});f.scope=new ProjectScope(f.ws,f.root.id);
  const requests=[];const {j}=await run(f,async(url,options)=>{const body=JSON.parse(options.body);requests.push(body);return Response.json(requests.length===1?responseCall('read_file',{fileId:f.f.id}):responseCall('finish',finish));});
  assert.equal(j.status,'completed');assert.equal(j.result.mock,false);assert.equal(j.result.facts[0].evidenceIds[0],'AI-E1');assert.match(j.result.answer,/原文包含/);
  assert.equal(requests[0].store,false);assert.equal(j.ai.usage[0].inputTokens,12);
  assert.ok(!JSON.stringify(requests).includes('private.txt'));assert.ok(!JSON.stringify(j.result).includes('FAKE_TEST_KEY'));
  assert.equal(f.ws.roots.find(r=>r.id===g.id).permissions.write,false);
  assert.match(j.iterations[0].purpose,/讀取原文/);assert.equal(j.iterations[0].target,f.f.path);
  assert.match(j.iterations[0].observation,/main.js 原文.*bytes.*版本/);
  assert.equal(j.iterations[0].previews[0].excerpt,'const marker=1;');
  assert.match(j.iterations[0].next,/整理已取得結果/);
  assert.equal(j.iterations[1].next,'本次回答完成');
  assert.equal(j.tools.find(t=>t.name==='read_file').result,j.iterations[0].observation);
});
test('Responses incomplete_details 會保存安全的中斷原因',async t=>{
  const f=await setup(t),client=new AIClient({env:f.env,fetchImpl:async()=>Response.json({status:'incomplete',incomplete_details:{reason:'max_output_tokens'},output:[],usage:{input_tokens:321,output_tokens:4096}})});
  await assert.rejects(()=>client.turn([{role:'user',content:'test'}],[],new AbortController().signal),error=>{
    assert.equal(error.code,'AI_FORMAT');assert.match(error.message,/原因：max_output_tokens/);assert.deepEqual(error.incompleteDetails,{reason:'max_output_tokens'});assert.deepEqual(error.usage,{inputTokens:321,outputTokens:4096});return true;
  });
});
test('Agent 將 incomplete usage 保存到任務與失敗請求追蹤點',async t=>{
  const f=await setup(t),{j}=await run(f,async()=>Response.json({status:'incomplete',incomplete_details:{reason:'max_output_tokens'},output:[],usage:{input_tokens:654,output_tokens:9000}}));
  const request=j.tools.find(item=>item.name==='ai.request');
  assert.equal(j.status,'partial');assert.deepEqual(j.ai.usage,[{inputTokens:654,outputTokens:9000}]);assert.deepEqual(request.usage,{inputTokens:654,outputTokens:9000});assert.deepEqual(request.incompleteDetails,{reason:'max_output_tokens'});
});
test('圖片創作討論依需求精簡分析，不強制輸出座標與完整 OCR',async t=>{
  const f=await setup(t,{supportsImages:true}),requests=[];
  const result={status:'completed',answer:'已整理成生成提示詞。',steps:['分析參考圖'],conclusions:['已建立提示詞'],facts:[],inferences:[],unknown:[],agentUnderstanding:'將參考圖轉成提示詞',discussion:'保留主要構圖與配色',prompt:'白底資訊圖，深藍線條與清楚流程。'};
  const {j}=await run(f,async(url,o)=>{requests.push(JSON.parse(o.body));return Response.json(responseCall('finish_image_discussion',result));},{context:{skill:{id:'image-planning-chat',name:'圖片創作討論'},attachments:[{name:'圖一',width:1181,height:1331}],imageInputs:[{mime:'image/png',buffer:Buffer.from('image')}]}});
  const instructions=requests[0].input[0].content;
  assert.equal(j.status,'completed');assert.match(instructions,/只分析與使用者本次需求/);assert.match(instructions,/不要輸出逐元素座標/);assert.doesNotMatch(instructions,/finish\.answer 必須固定依序使用以下區段/);
});
test('圖片歷史篩選只接受候選任務 ID，並保留選擇理由',async t=>{
  const f=await setup(t);let request;
  const client=new AIClient({env:f.env,fetchImpl:async(url,options)=>{request=JSON.parse(options.body);return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({selectedJobIds:['job-2'],reason:'第二筆包含目前要求的配色決定',reasons:{'job-1':'構圖與本次配色無關','job-2':'包含要延續的配色決定'}})}]}],usage:{input_tokens:20,output_tokens:7}});}});
  const result=await client.selectImageHistory({currentRequest:'延續配色',projectSummary:'品牌規範',seriesSummary:'目前構圖',candidates:[{id:'job-1',question:'構圖'},{id:'job-2',question:'配色'}]},new AbortController().signal);
  assert.deepEqual(result.selectedJobIds,['job-2']);assert.match(result.reason,/配色/);assert.match(result.reasons['job-1'],/無關/);assert.match(request.input[0].content,/不得分析或推測圖片內容/);
  const invalid=new AIClient({env:f.env,fetchImpl:async()=>Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({selectedJobIds:['unknown'],reason:'錯誤 ID'})}]}]})});
  await assert.rejects(()=>invalid.selectImageHistory({candidates:[{id:'job-1'}]},new AbortController().signal),/AI_FORMAT/);
});
test('工作摘要保留原回答，並以第二次已授權 AI 請求整理公開紀錄',async t=>{
  const f=await setup(t);let round=0,summaryInput;
  const {j,engine}=await run(f,async(url,o)=>{
    round++;if(round===1)return Response.json(responseCall('read_file',{fileId:f.f.id}));
    if(round===2)return Response.json(responseCall('finish',finish));
    summaryInput=JSON.parse(o.body);return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'已讀取 main.js，核對 marker，並提供可追溯的回覆。'}]}],usage:{input_tokens:18,output_tokens:11}});
  });
  const answer=j.result.answer;assert.equal(j.activitySummary.status,'queued');await engine.activityReport(j);
  assert.equal(j.result.answer,answer);assert.equal(j.activitySummary.status,'completed');assert.match(j.activitySummary.answer,/核對 marker/);assert.equal(j.ai.requests,3);
  assert.equal('tools' in summaryInput,false);assert.match(JSON.parse(summaryInput.input[1].content).answer,/原文包含/);
});
test('AI 修改：版本及目標檢查，確認前不寫入，套用後靜態驗證',async t=>{
  const f=await setup(t,{},{verify:true});let round=0;
  const {j,engine}=await run(f,async()=>Response.json(++round===1?responseCall('read_file',{fileId:f.f.id}):round===2?responseCall('propose_edit',{fileId:f.f.id,version:f.f.hash,after:'const marker=2;',summary:'將值改為 2'}):{status:'completed',output:[{type:'message',content:[{type:'output_text',text:'已將 marker 改為 2。\n\n靜態驗證已通過；未做瀏覽器測試。'}]}]}),{edit:true});
  assert.equal(j.status,'awaiting_approval');assert.equal(await fs.readFile(f.f.path,'utf8'),'const marker=1;');
  assert.ok(Number.isFinite(j.startedAt));assert.equal(j.finishedAt,null);
  assert.ok(j.tools.every(t=>Number.isFinite(t.startedAt)&&Number.isFinite(t.elapsedMs)));
  const applied=await engine.apply(j.id,'test');assert.equal(await fs.readFile(f.f.path,'utf8'),'const marker=2;');
  assert.ok(applied.finishedAt>=applied.startedAt);
  const verification=applied.tools.find(t=>t.name==='apply_edit').verification;
  assert.ok(verification.command.includes('--check'));assert.equal(verification.input,'stdin');assert.equal(verification.exitCode,0);
  assert.equal(j.activitySummary.status,'queued');await engine.activityReport(j);
  assert.match(j.activitySummary.answer,/已將 marker 改為 2/);assert.equal(j.ai.requests,3);
});
test('AI 修改未授權驗證：紀錄 not_run，不虛構驗證命令',async t=>{
  const f=await setup(t);let round=0;
  const {j,engine}=await run(f,async()=>Response.json(++round===1?responseCall('read_file',{fileId:f.f.id}):round===2?responseCall('propose_edit',{fileId:f.f.id,version:f.f.hash,after:'const marker=2;',summary:'將值改為 2'}):{status:'completed',output:[{type:'message',content:[{type:'output_text',text:'已套用；尚未授權靜態驗證。'}]}]}),{edit:true});
  const applied=await engine.apply(j.id,'test'),verification=applied.tools.find(t=>t.name==='apply_edit').verification;
  assert.equal(verification.status,'not_run');assert.equal(verification.command,undefined);
  assert.equal(await fs.readFile(f.f.path,'utf8'),'const marker=2;');
});
test('候選預檢失敗會要求 AI 最多修正三輪，最後可明確強制套用',async t=>{
  const f=await setup(t,{},{verify:true});let round=0,reportInput;
  const {j,engine}=await run(f,async(url,o)=>{
    const body=JSON.parse(o.body);round++;
    if(round===1)return Response.json(responseCall('read_file',{fileId:f.f.id}));
    if(round<=4)return Response.json(responseCall('propose_edit',{fileId:f.f.id,version:f.f.hash,after:'const = ;',summary:'故意產生語法錯誤'}));
    reportInput=body;return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'檔案已寫入，但靜態驗證失敗。請修正語法後重試。'}]}]});
  },{edit:true});
  assert.equal(j.status,'awaiting_approval');assert.equal(j.preflight.status,'failed');assert.equal(j.preflightAttempts.length,3);await assert.rejects(()=>engine.apply(j.id,'test'),/強制套用/);
  const applied=await engine.apply(j.id,'test',{force:true});await engine.activityReport(j);
  assert.equal(applied.status,'partial');assert.equal(applied.applied.verification.status,'failed');assert.match(j.activitySummary.answer,/靜態驗證失敗/);
  assert.equal(round,5);assert.equal('tools' in reportInput,false);assert.equal(JSON.parse(reportInput.input[1].content).changed.verification.status,'failed');

  const next=await setup(t,{},{verify:true});let secondRound=0;
  const failed=await run(next,async()=>Response.json(++secondRound===1?responseCall('read_file',{fileId:next.f.id}):secondRound===2?responseCall('propose_edit',{fileId:next.f.id,version:next.f.hash,after:'const marker=3;',summary:'改為 3'}):{status:'incomplete',output:[]}),{edit:true});
  const result=await failed.engine.apply(failed.j.id,'test');await failed.engine.activityReport(failed.j);
  assert.equal(result.status,'completed');assert.match(failed.j.activitySummary.answer,/已套用修改/);assert.match(failed.j.result.unknown.at(-1),/工作摘要未取得/);
});
test('新增檔案逐份確認後才補述一次，略過的檔案不算已建立',async t=>{
  const f=await setup(t,{},{verify:true});let requests=0;
  const {j,engine}=await run(f,async()=>{requests++;return Response.json(requests===1?responseCall('propose_new_files',{files:[{path:'first.js',purpose:'建立第一份',content:'const first=1;'},{path:'second.js',purpose:'建立第二份',content:'const second=2;'}]}):{status:'completed',output:[{type:'message',content:[{type:'output_text',text:'已建立 first.js；second.js 已略過。'}]}]});},{edit:true});
  assert.equal(j.status,'awaiting_approval');assert.equal(requests,1);
  await engine.decideNewFile(j.id,'test',j.creations[0].id,'create');assert.equal(requests,1);
  const final=await engine.decideNewFile(j.id,'test',j.creations[1].id,'skip');await engine.activityReport(j);
  assert.equal(requests,2);assert.match(j.activitySummary.answer,/已略過/);
  assert.equal(await fs.readFile(path.join(path.dirname(f.f.path),'first.js'),'utf8'),'const first=1;');
  await assert.rejects(fs.access(path.join(path.dirname(f.f.path),'second.js')));
});
test('未授權外送及撤銷阻止請求，不經全域繞過',async t=>{
  const f=await setup(t);f.root.permissions.ai=false;let requests=0;
  const {j}=await run(f,async()=>{requests++;return Response.json({});},{ids:[f.f.id]});
  assert.equal(requests,0);assert.equal(j.status,'partial');assert.match(j.result.unknown[0],/AI_PERMISSION/);
  f.root.permissions.ai=true;
  const second=await run(f,async()=>{requests++;f.root.permissions.ai=false;return Response.json(responseCall('read_file',{fileId:f.f.id}));});
  assert.equal(requests,1);assert.equal(second.j.evidence.length,0);
});
test('未知工具、假引用、重複呼叫及未允許修改均拒絕',async t=>{
  for(const attack of ['shell','finish','repeat','propose_edit']){
    const f=await setup(t);let round=0;
    const {j}=await run(f,async()=>{round++;return Response.json(attack==='shell'?responseCall('shell',{command:'test'}):attack==='finish'?responseCall('finish',finish):attack==='propose_edit'?responseCall('propose_edit',{fileId:f.f.id,version:f.f.hash,after:'x',summary:'x'}):responseCall('read_file',{fileId:f.f.id}));});
    assert.equal(j.status,'partial',attack);assert.equal(await fs.readFile(f.f.path,'utf8'),'const marker=1;');assert.ok(round<=2);
  }
});
test('公司 Chat 原生工具、自訂認證標頭與端點指定模型',async t=>{
  const f=await setup(t,{protocol:'chat-completions',authHeader:'api-key',authPrefix:'',omitModel:true});let request;
  const client=new AIClient({env:f.env,fetchImpl:async(url,o)=>{request=o;return Response.json({choices:[{finish_reason:'tool_calls',message:{role:'assistant',content:null,tool_calls:[{id:'c1',type:'function',function:{name:'finish',arguments:JSON.stringify({...finish,facts:[]})}}]}}]});}});
  const r=await client.turn([{role:'user',content:'test'}],[],new AbortController().signal);
  assert.equal(r.call.name,'finish');assert.equal(request.headers['api-key'],f.env.CDA_AI_KEY);assert.equal('model' in JSON.parse(request.body),false);
});
test('Chat 端點完工說明以純文字取得，不要求工具呼叫',async t=>{
  const f=await setup(t,{protocol:'chat-completions',toolMode:'json'});let body;
  const client=new AIClient({env:f.env,fetchImpl:async(url,o)=>{body=JSON.parse(o.body);return Response.json({choices:[{finish_reason:'stop',message:{content:'已完成修改。\n\n驗證通過。'}}],usage:{prompt_tokens:10,completion_tokens:7}});}});
  const result=await client.finalAnswer([{role:'user',content:'請說明已完成的工作'}],new AbortController().signal);
  assert.match(result.answer,/驗證通過/);assert.equal(result.usage.outputTokens,7);assert.equal('tools' in body,false);assert.equal('tool_choice' in body,false);
});
test('公司 JSON 指令後端 schema 驗證、沒有原生 tools',async t=>{
  const f=await setup(t,{protocol:'chat-completions',toolMode:'json'});let request;
  const {j}=await run(f,async(url,o)=>{request=JSON.parse(o.body);return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({name:'finish',arguments:{...finish,facts:[]}})}}]});});
  assert.equal(j.status,'completed');assert.equal('tools' in request,false);
});
test('需求釐清技能只取得唯讀 finish，並帶入壓縮上下文',async t=>{
  const f=await setup(t),requests=[];
  const clarification={status:'needs_input',answer:'請問成功條件是什麼？有哪些不能改的範圍？',steps:['釐清需求'],conclusions:['成功條件是什麼？','有哪些不能改的範圍？'],facts:[],inferences:[],unknown:[]};
  const {j}=await run(f,async(url,o)=>{requests.push(JSON.parse(o.body));return Response.json(responseCall('finish',clarification));},{context:{skill:{id:'clarify-requirements',name:'需求釐清'},historyContext:{summary:'較早需求摘要',confirmed:['保留登入流程'],recent:[],retrieved:[],notice:'本機歷史資料'}}});
  assert.equal(j.status,'needs_input');assert.deepEqual(requests[0].tools.map(x=>x.name),['finish']);
  assert.match(JSON.stringify(requests[0]),/保留登入流程/);assert.equal(j.contextUsage.confirmedCount,1);
});
test('HTTP 429 有限重試、401 不重試，不顯示供應商錯誤原文',async t=>{
  const f=await setup(t);for(const status of [429,401]){let n=0;const {j}=await run(f,async()=>{n++;return new Response('FAKE_TEST_KEY_NOT_REAL provider error',{status});});assert.equal(n,status===429?2:1);assert.equal(j.status,'partial');assert.ok(!JSON.stringify(j.result).includes('FAKE_TEST_KEY'));}
});
test('真實 HTTP 傳輸逾時與取消有界結束',async t=>{
  const sockets=new Set(),server=http.createServer(()=>{});server.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));});server.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(async()=>{for(const s of sockets)s.destroy();await new Promise(r=>server.close(r));});
  const f=await setup(t,{endpoint:'http://127.0.0.1:'+server.address().port,timeoutMs:100,maxRetries:1});
  const {j}=await run(f,fetch);assert.equal(j.status,'partial');assert.match(j.result.unknown[0],/AI_TIMEOUT/);assert.equal(j.ai.requests,2);
  const engine=new Engine(f.ws,limits,new AIClient({env:f.env})),job=engine.start('test',[],'test',f.scope);engine.cancel(job.id,'test');await engine.get(job.id,'test').finished;assert.equal(engine.get(job.id,'test').status,'cancelled');
});
test('設定限制：缺 key、未知欄位、非 HTTPS、錯協定不可假裝接通',async t=>{
  const f=await setup(t);assert.throws(()=>loadConfig({...f.env,CDA_AI_KEY:''}),/CONFIG_REQUIRED/);
  for(const key of [' 測試key','FAKE KEY','FAKE\uFEFFKEY'])assert.throws(()=>loadConfig({...f.env,CDA_AI_KEY:key}),/AI_KEY_FORMAT/);
  for(const extra of [{apiKey:'not-allowed'},{endpoint:'http://company.example/api'},{provider:'claude'},{endpoint:'https://host.test/?api-key=bad'}]){
    await fs.writeFile(f.file,JSON.stringify({provider:'openai-compatible',protocol:'responses',endpoint:'https://host.test/responses',model:'test',...extra}));assert.throws(()=>loadConfig(f.env),/CONFIG_REQUIRED/);
  }
});
test('網路診斷保留安全代碼，巢狀錯誤不洩漏 key 或任意錯誤本文',async t=>{
  const f=await setup(t);
  for(const code of ['ENOTFOUND','UNABLE_TO_GET_ISSUER_CERT_LOCALLY','UND_ERR_CONNECT_TIMEOUT','UNKNOWN_PRIVATE_CODE']){
    let attempts=0;
    const client=new AIClient({env:f.env,fetchImpl:async()=>{
      attempts++;
      throw new TypeError('private '+f.env.CDA_AI_KEY,{cause:new AggregateError([Object.assign(new Error('private endpoint '+f.env.CDA_AI_KEY),{code})])});
    }});
    await assert.rejects(()=>client.request({},new AbortController().signal),e=>{
      assert.equal(e.code,'AI_NETWORK');assert.ok(!e.message.includes(f.env.CDA_AI_KEY));
      assert.ok(!e.message.includes('private'));assert.ok(!e.message.includes('UNKNOWN_PRIVATE_CODE'));
      if(code!=='UNKNOWN_PRIVATE_CODE')assert.ok(e.message.includes(code));return true;
    });
    assert.equal(attempts,2);
  }
});

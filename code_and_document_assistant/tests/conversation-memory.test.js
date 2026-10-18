const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {AppState}=require('../src/app-state');
const {ConversationMemory,buildContext,emptyState,fingerprint}=require('../src/conversation-memory');
async function setup(t){
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'cda-auto-memory-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));
  const saved=await new AppState(base).init(),c=saved.conversation('owner','project');
  const grant={permissions:{ai:true}},scope={targetProjectId:'project',referenceProjectIds:[],root:()=>grant};
  const jobs=Array.from({length:8},(_,i)=>({id:'job-'+i,owner:'owner',projectId:'project',conversationId:c.id,question:'需求 '+i,status:'completed',tools:[],result:{answer:'完整回答 '+i,conclusions:['結論 '+i]}}));
  for(const job of jobs)await saved.record(job);
  return {base,saved,c,scope,grant,jobs};
}
const model=(fn)=>({mode:'real',config:{model:'test',memoryBudgetTokens:8000,contextBudgetTokens:32000,maxOutputTokens:4096,overallTimeoutMs:1000},summarizeMemory:fn});
test('未勾選不呼叫模型；切回舊方式維持四輪與本機摘要',async t=>{
  const {saved,c,scope}=await setup(t);let calls=0;
  await new ConversationMemory(saved,model(()=>calls++)).update(c,scope);assert.equal(calls,0);
  c.memory.structured=emptyState();c.memory.summary='模型摘要不得用於舊模式';
  const context=saved.context(c,'需求');assert.equal(context.recent.length,4);assert.doesNotMatch(context.summary,/模型摘要不得/);assert.match(context.summary,/較早對話摘要/);
});
test('預算內包含全部完整需求與回答，不固定四輪',async t=>{
  const {saved,c}=await setup(t);const context=buildContext(saved.ensureMemory(c),c.jobs,'需求',8000);
  assert.equal(context.recent.length,8);assert.equal(context.recent[0].response.answer,'完整回答 0');assert.equal(context.budget.omittedTurns,0);assert.equal(context.budget.mode,'full');
});
test('模型摘要保存版本、來源與用量；相同來源不重複呼叫',async t=>{
  const {saved,c,scope,jobs}=await setup(t);c.autoMemory=true;let calls=0;
  const service=new ConversationMemory(saved,model(async(payload,signal,check,attempt)=>{
    check();attempt();calls++;assert.equal(payload.turns[0].response.answer,'完整回答 0');
    return {answer:JSON.stringify({...emptyState(),goals:[{text:'保留完整回覆',sourceJobIds:['job-0']}]}),usage:{inputTokens:120,outputTokens:30}};
  }));
  await service.update(c,scope,{job:jobs[7]});await service.update(c,scope,{job:jobs[7]});
  assert.equal(calls,1);assert.equal(c.memory.summaryVersion,1);assert.match(c.memory.summary,/保留完整回覆/);assert.equal(c.memory.updates[0].usage[0].inputTokens,120);assert.equal(c.jobs.length,8);
  const reload=await new AppState(path.dirname(path.dirname(saved.file))).init();assert.equal(reload.data.conversations[0].memory.summaryVersion,1);
});
test('摘要格式錯誤保留上一版與原始歷史，留下失敗記錄',async t=>{
  const {saved,c,scope}=await setup(t);c.autoMemory=true;c.memory.structured=emptyState();c.memory.summary='上一版';c.memory.summaryVersion=2;
  await new ConversationMemory(saved,model(async()=>({answer:'not JSON',usage:{inputTokens:1,outputTokens:2}}))).update(c,scope);
  assert.equal(c.memory.summary,'上一版');assert.equal(c.memory.summaryVersion,2);assert.equal(c.memory.updates[0].status,'error');assert.equal(c.memory.updates[0].usage.length,1);assert.equal(c.jobs.length,8);
});
test('來源授權撤銷、跨專案、取消時不外送或提交摘要',async t=>{
  const {saved,c,scope,grant}=await setup(t);c.autoMemory=true;let calls=0;
  const service=new ConversationMemory(saved,model(async(payload,signal,check)=>{check();calls++;return {answer:JSON.stringify(emptyState())};}));
  grant.permissions.ai=false;await service.update(c,scope);assert.equal(calls,0);
  grant.permissions.ai=true;assert.equal(service.canSend({...c.jobs[0],projectId:'other'},scope),false);assert.equal(service.canSend({...c.jobs[0],referenceProjectIds:['other']},scope),false);
  const controller=new AbortController();controller.abort();await service.update(c,scope,{job:{tools:[],controller}});assert.equal(calls,0);assert.equal(c.memory.summaryVersion,0);
});
test('改口或來源修訂使舊摘要失效；過大近期內容不靜默截斷',async t=>{
  const {saved,c}=await setup(t);const memory=saved.ensureMemory(c);memory.structured=emptyState();memory.sources=c.jobs.map(j=>({id:j.id,fingerprint:fingerprint(j)}));memory.structured.decisions=[{text:'舊決定',sourceJobIds:['job-0']}];
  c.jobs[0].question='改口後新決定';c.jobs.at(-1).result.answer='長回答'.repeat(3000);
  assert.throws(()=>buildContext(memory,c.jobs,'新決定',2000),/MEMORY_CONTEXT_LIMIT/);
  c.jobs.at(-1).result.answer='正常';const context=buildContext(memory,c.jobs,'新決定',8000);assert.doesNotMatch(JSON.stringify(context),/舊決定/);
});
test('HTTP 勾選才產生摘要請求，取消勾選後回到原流程',async t=>{
  const {base}=await setup(t);const {createApp}=require('../server');let summaryCalls=0;const inputs=[];
  const instance=await createApp({runtime:path.join(base,'http'),aiOptions:{env:{CDA_MODEL_MODE:'real',CDA_AI_MODEL:'test-model',CDA_AI_KEY:'FAKE_NOT_REAL'},fetchImpl:async(url,o)=>{
    const body=JSON.parse(o.body);inputs.push(body);
    const system=body.input?.[0]?.content||'';
    if(system.includes('一般專案對話歷史篩選器')){const payload=JSON.parse(body.input[1].content);return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({selectedJobIds:[],reason:'舊任務與本次需求無關',reasons:Object.fromEntries(payload.candidates.map(item=>[item.id,'本次不需要']))})}]}],usage:{input_tokens:10,output_tokens:5}});}
    if(system.includes('對話記憶整理器')){summaryCalls++;const payload=JSON.parse(body.input[1].content);return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({...emptyState(),goals:[{text:'需求摘要',sourceJobIds:[payload.turns[0].id]}]})}]}],usage:{input_tokens:50,output_tokens:20}});}
    if(!body.tools)return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'已整理公開工作摘要'}]}]});
    return Response.json({status:'completed',output:[{type:'function_call',call_id:'finish',name:'finish',arguments:JSON.stringify({status:'completed',answer:'完整回答',steps:[],conclusions:['完成'],facts:[],inferences:[],unknown:[]})}]});
  }}});
  const server=instance.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
  const origin='http://127.0.0.1:'+server.address().port,response=await fetch(origin+'/api/session'),session=await response.json();
  instance.workspace.roots.find(r=>r.id==='demo').permissions.ai=true;
  const headers={cookie:response.headers.get('set-cookie').split(';')[0],'x-cda-token':session.csrf,'content-type':'application/json'};
  async function send(autoMemory){const response=await fetch(origin+'/api/jobs',{method:'POST',headers,body:JSON.stringify({question:'完整需求測試',autoMemory})});assert.equal(response.status,202);const job=await response.json();let current;for(let i=0;i<100;i++){current=await (await fetch(origin+'/api/jobs/'+job.id,{headers})).json();if(current.status!=='running'&&!current.memoryUpdating)return current;await new Promise(r=>setTimeout(r,10));}assert.fail('未完成');}
  await send(false);assert.equal(summaryCalls,0);
  const automatic=await send(true);assert.equal(summaryCalls,1);assert.equal(automatic.memory.summaryVersion,1);assert.equal(automatic.contextUsage.mode,'automatic');
  assert.equal(inputs.some(input=>input.input?.[0]?.content?.includes('對話記憶整理器')&&input.input[1].content.includes('完整回答')),true);
  const legacy=await send(false);assert.equal(summaryCalls,1);assert.equal(legacy.contextUsage.mode,'legacy');assert.equal(legacy.memory.mode,'legacy');
});

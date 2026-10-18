const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createApp}=require('../server.js');
const {AppState}=require('../src/app-state.js');
const {generalHistoryPreview}=require('../src/history-selection.js');

const completed=answer=>Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:answer}]}],usage:{input_tokens:21,output_tokens:8}});
const finished=()=>Response.json({status:'completed',output:[{type:'function_call',call_id:'finish',name:'finish',arguments:JSON.stringify({status:'completed',answer:'已完成本次要求',steps:[],conclusions:['完成'],facts:[],inferences:[],unknown:[]})}],usage:{input_tokens:40,output_tokens:12}});

test('一般歷史候選排除圖片討論與含本輪圖片的任務',()=>{
  const jobs=[
    {id:'text',question:'純文字需求',status:'completed',result:{answer:'完成'}},
    {id:'discussion',question:'圖片討論',status:'completed',result:{answer:'完成'},imageProjectChat:{projectId:'image'}},
    {id:'attachment',question:'附圖需求',status:'completed',result:{answer:'完成'},attachments:[{id:'img'}]}
  ];
  const preview=generalHistoryPreview({jobs,memory:{confirmed:[],sources:[]}}, {},{canSend:()=>true,saved:{ensureMemory:conversation=>conversation.memory}},'延續文字需求');
  assert.deepEqual(preview.input.candidates.map(item=>item.id),['text']);
});

async function serve(t,aiOptions){
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'cda-history-flow-'));
  const runtime=path.join(base,'runtime'),{config,...options}=aiOptions;
  if(config){const configPath=path.join(base,'ai-config.json');await fs.writeFile(configPath,JSON.stringify(config));options.env={...options.env,CDA_AI_CONFIG:configPath};}
  const instance=await createApp({runtime,aiOptions:options});
  const server=instance.app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await instance.saved.queue;await fs.rm(base,{recursive:true,force:true});});
  const origin='http://127.0.0.1:'+server.address().port,response=await fetch(origin+'/api/session'),session=await response.json();
  const headers={cookie:response.headers.get('set-cookie').split(';')[0],'x-cda-token':session.csrf,'content-type':'application/json'};
  const request=async(endpoint,body)=>{const response=await fetch(origin+endpoint,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body)});const data=await response.json();assert(response.ok,data.error||response.status);return data;};
  const conversation=await request('/api/conversations');headers['x-cda-conversation']=conversation.id;
  const send=async(question,autoMemory=false)=>{
    const started=await request('/api/jobs',{question,autoMemory});
    let job;for(let i=0;i<120;i++){
      job=await request('/api/jobs/'+started.id);
      const savedConversation=instance.saved.data.conversations.find(item=>item.id===conversation.id);
      if(job.status!=='running'&&savedConversation.jobs.some(item=>item.id===started.id))return job;
      await new Promise(resolve=>setTimeout(resolve,10));
    }
    assert.fail('任務未在測試時限內完成並保存');
  };
  return {instance,runtime,headers,request,send,conversation};
}

test('一般專案候選預覽、逐筆篩選、零筆選取、錯誤退回與重啟追蹤',async t=>{
  const calls=[];
  const fixture=await serve(t,{env:{CDA_MODEL_MODE:'real',CDA_AI_MODEL:'test-model',CDA_AI_KEY:'FAKE_NOT_REAL'},fetchImpl:async(url,options)=>{
    const body=JSON.parse(options.body),system=body.input?.[0]?.content||'';
    if(system.includes('一般專案對話歷史篩選器')){
      const input=JSON.parse(body.input[1].content);calls.push({kind:'filter',input});
      if(input.currentRequest.includes('格式錯誤'))return completed('not JSON');
      const selectedJobIds=input.currentRequest.includes('零筆')?[]:[input.candidates.at(-1).id];
      return completed(JSON.stringify({selectedJobIds,reason:'依本次需求選取',reasons:Object.fromEntries(input.candidates.map(item=>[item.id,selectedJobIds.includes(item.id)?'此任務與需求相關':'此任務與需求無關']))}));
    }
    if(body.tools){calls.push({kind:'main',body});return finished();}
    return completed('已整理公開工作摘要');
  }});
  fixture.instance.workspace.roots.find(item=>item.id==='demo').permissions.ai=true;
  const first=await fixture.send('先保留藍色按鈕');
  assert.equal(first.historySelection.status,'skipped');
  await fixture.request('/api/conversation-memory/confirm',{jobId:first.id});
  const preview=await fixture.request('/api/conversation-memory/preview',{question:'延續藍色按鈕',autoMemory:false});
  assert.equal(preview.phase,'candidate');assert.equal(preview.candidates.length,1);assert.equal(preview.candidates[0].id,first.id);assert.deepEqual(preview.fixed.confirmed,['先保留藍色按鈕']);
  const second=await fixture.send('延續藍色按鈕');
  assert.equal(second.historySelection.status,'completed');assert.deepEqual(second.historySelection.selectedJobIds,[first.id]);
  assert.equal(second.historySelection.decisions[0].reason,'此任務與需求相關');
  assert.deepEqual(second.historySelection.candidateInput,preview.candidateInput);
  const filter=calls.findLast(item=>item.kind==='filter'),main=calls.findLast(item=>item.kind==='main');
  assert.deepEqual(filter.input,preview.candidateInput);
  assert.deepEqual(JSON.parse(main.body.input[1].content).conversationContext,second.historySelection.mainContext);
  assert.equal(second.ai.requests>=2,true);assert.equal(second.historySelection.usage.inputTokens,21);
  const zero=await fixture.send('零筆相關歷史');
  assert.equal(zero.historySelection.status,'completed');assert.equal(zero.historySelection.mainContext.recent.length,0);
  assert(zero.historySelection.mainContext.confirmed.includes('先保留藍色按鈕'));
  const failed=await fixture.send('格式錯誤時仍完成');
  assert.equal(failed.historySelection.status,'fallback');assert.equal(failed.historySelection.mainContext.recent.length,0);
  assert.match(failed.historySelection.warning,/篩選失敗/);assert(failed.historySelection.decisions.every(item=>!item.selected));
  const automatic=await fixture.send('啟用自動整理記憶仍逐筆篩選',true);
  assert.equal(automatic.historySelection.status,'completed');
  assert(automatic.historySelection.candidateInput.candidates.length>0);
  const reloaded=await new AppState(fixture.runtime).init();
  const record=reloaded.data.conversations.find(item=>item.id===fixture.conversation.id).jobs.find(item=>item.id===second.id);
  assert.deepEqual(record.historySelection.mainContext,second.historySelection.mainContext);
  assert.deepEqual(record.historySelection.candidateInput,preview.candidateInput);
});

test('Mock 模式跳過歷史篩選並在預覽與任務標示未送入 LLM',async t=>{
  const fixture=await serve(t,{env:{CDA_MODEL_MODE:'mock'}});
  const preview=await fixture.request('/api/conversation-memory/preview',{question:'測試 Mock',autoMemory:false});
  assert.equal(preview.available,false);assert.match(preview.reason,/real 模式/);
  const job=await fixture.send('查詢訂單');
  assert.equal(job.historySelection.status,'mock');assert.equal(job.historySelection.candidateInput,null);assert.equal(job.historySelection.mainContext,null);
});

test('歷史篩選逾時時只保留本次需求與固定內容',async t=>{
  const fixture=await serve(t,{env:{CDA_MODEL_MODE:'real',CDA_AI_MODEL:'test-model',CDA_AI_KEY:'FAKE_NOT_REAL'},config:{timeoutMs:100,overallTimeoutMs:1000,maxRetries:0},fetchImpl:async(url,options)=>{
    const body=JSON.parse(options.body),system=body.input?.[0]?.content||'';
    if(system.includes('一般專案對話歷史篩選器'))return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}));
    return body.tools?finished():completed('摘要');
  }});
  fixture.instance.workspace.roots.find(item=>item.id==='demo').permissions.ai=true;
  const first=await fixture.send('藍色按鈕需求');
  await fixture.request('/api/conversation-memory/confirm',{jobId:first.id});
  const second=await fixture.send('逾時後繼續');
  assert.equal(second.historySelection.status,'fallback');
  assert.equal(second.historySelection.code,'AI_TIMEOUT');
  assert.deepEqual(second.historySelection.mainContext.recent,[]);
  assert(second.historySelection.mainContext.confirmed.includes('藍色按鈕需求'));
});

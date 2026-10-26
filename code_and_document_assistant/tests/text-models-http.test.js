const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createApp}=require('../server');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5n8AAAAASUVORK5CYII=','base64');

test('每次文字操作固定模型快照：跨對話、輔助請求、停用及圖片 API 相互隔離',async t=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'cda-model-http-')),calls=[];let release;
  const gate=new Promise(resolve=>{release=resolve;});
  const instance=await createApp({runtime:path.join(base,'runtime'),imageProjectRoot:path.join(base,'images'),adminToken:'abcdef',aiOptions:{env:{CDA_MODEL_MODE:'real',CDA_AI_MODEL:'model-a',CDA_AI_KEY:'FAKE'},fetchImpl:async(url,options)=>{
    const body=JSON.parse(options.body);calls.push({url,body});
    if(!url.endsWith('/responses'))return Response.json({data:[{b64_json:png.toString('base64')}]});
    if(body.tools){
      if(JSON.stringify(body).includes('slow-A'))await gate;
      if(JSON.stringify(body).includes('建立文件待確認'))return Response.json({status:'completed',output:[{type:'function_call',call_id:'new-file',name:'propose_new_files',arguments:JSON.stringify({files:[{path:'docs/model-note.md',purpose:'模型測試文件',content:'# Note'}]})}],usage:{input_tokens:10,output_tokens:5}});
      const image=body.tools.some(tool=>tool.name==='finish_image_discussion'),name=image?'finish_image_discussion':'finish';
      const args={status:'completed',answer:'完成 '+body.model,steps:[],conclusions:['已完成文字回覆'],facts:[],inferences:[],unknown:[],...(image?{agentUnderstanding:'文字構圖',discussion:'依文字整理',prompt:'一張清楚的流程圖'}:{})};
      return Response.json({status:'completed',output:[{type:'function_call',call_id:'one',name,arguments:JSON.stringify(args)}],usage:{input_tokens:10,output_tokens:5}});
    }
    const system=body.input[0].content,input=JSON.parse(body.input[1].content);let text='已整理實際結果。';
    if(system.includes('歷史篩選器'))text=JSON.stringify({selectedJobIds:[],reason:'本次不需要舊紀錄',reasons:Object.fromEntries((input.candidates||[]).map(item=>[item.id,'本次不需要']))});
    else if(system.includes('對話記憶整理器'))text=JSON.stringify({goals:[],decisions:[],constraints:[],completed:[],pending:[]});
    else if(system.includes('圖片專案記憶整理器'))text=JSON.stringify({projectSummary:'共用風格',seriesSummary:'流程圖方向'});
    else if(system.includes('圖片創作提示詞整合器'))text=JSON.stringify({prompt:'保留流程圖，只換配色',decisions:['沿用流程圖'],conflicts:[],unverified:[]});
    return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text}]}],usage:{input_tokens:10,output_tokens:5}});
  }}});
  instance.workspace.roots.find(root=>root.id==='demo').permissions.ai=true;
  const server=instance.app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(async()=>{release();await Promise.all([...instance.engine.jobs.values()].map(job=>job.finished));await new Promise(resolve=>server.close(resolve));await instance.saved.queue;await fs.rm(base,{recursive:true,force:true});});
  const origin='http://127.0.0.1:'+server.address().port,session=await fetch(origin+'/api/session'),data=await session.json();
  const headers={cookie:session.headers.get('set-cookie').split(';')[0],'x-cda-token':data.csrf,'content-type':'application/json'};
  const request=async(endpoint,body,conversation)=>{const response=await fetch(origin+endpoint,{method:body===undefined?'GET':'POST',headers:{...headers,...(conversation?{'x-cda-conversation':conversation}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,data:await response.json()};};
  const wait=async predicate=>{for(let n=0;n<150;n++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,20));}throw new Error('等待模型測試結果逾時');};
  const c1=(await request('/api/conversations')).data.id,c2=(await request('/api/conversations',{})).data.id,c3=(await request('/api/conversations',{})).data.id;
  let settings=(await request('/api/text-models')).data;const a=settings.models[0],b={...a,id:'b',modelId:'model-b',displayName:'B',sendReasoning:false},c={...a,id:'c',modelId:'model-c',displayName:'C'};
  settings=(await request('/api/text-models',{...settings,models:[a,b,c]})).data;
  assert.equal((await request('/api/text-model-selection',{profileId:c.id,effort:'high'},c2)).status,200);
  const slow=await request('/api/jobs',{question:'slow-A',fileIds:[]},c1);assert.equal(slow.status,202,slow.data.error);
  await wait(()=>calls.some(call=>call.body.tools&&call.body.model==='model-a'));
  await request('/api/text-model-selection',{profileId:b.id,effort:'medium'},c1);
  settings.models[0].enabled=false;settings.defaultModelId=b.id;settings=(await request('/api/text-models',settings)).data;
  const count=calls.length,denied=await request('/api/jobs',{question:'禁止的新請求',fileIds:[]},c3);assert.equal(denied.status,400);assert.match(denied.data.error,/停用/);assert.equal(calls.length,count);
  const fast=await request('/api/jobs',{question:'C 對話第一次',fileIds:[],autoMemory:true},c2);assert.equal(fast.status,202,fast.data.error);
  await wait(()=>instance.engine.jobs.get(fast.data.id).activitySummary?.status==='completed');release();
  await wait(()=>instance.engine.jobs.get(slow.data.id).activitySummary?.status==='completed');
  const oldJob=instance.engine.jobs.get(slow.data.id);assert.equal(oldJob.modelSelection.modelId,'model-a');assert.equal(oldJob.ai.model,'model-a','切換及停用不會改變執行中任務');
  const summaryA=calls.find(call=>!call.body.tools&&call.body.model==='model-a');assert.ok(summaryA);assert.equal(summaryA.body.reasoning.effort,'medium');
  const offset=calls.length,next=await request('/api/jobs',{question:'C 對話第二次',fileIds:[],autoMemory:true},c2);assert.equal(next.status,202,next.data.error);await wait(()=>instance.engine.jobs.get(next.data.id).activitySummary?.status==='completed'&&!instance.engine.jobs.get(next.data.id).memoryUpdating);
  const follow=calls.slice(offset);assert.ok(follow.some(call=>call.body.input?.[0]?.content?.includes('歷史篩選器')));assert.ok(follow.some(call=>call.body.input?.[0]?.content?.includes('對話記憶整理器')));assert(follow.every(call=>call.body.model==='model-c'&&call.body.reasoning.effort==='high'));
  const noDepthOffset=calls.length,noDepth=await request('/api/jobs',{question:'B 不傳深度',fileIds:[]},c1);await wait(()=>instance.engine.jobs.get(noDepth.data.id).activitySummary?.status==='completed');assert(calls.slice(noDepthOffset).every(call=>call.body.model==='model-b'&&!call.body.reasoning&&!call.body.reasoning_effort));
  const pending=await request('/api/jobs',{question:'建立文件待確認',fileIds:[],allowEdits:true},c2);assert.equal(pending.status,202,pending.data.error);await wait(()=>instance.engine.jobs.get(pending.data.id).status==='awaiting_approval');
  await request('/api/text-model-selection',{profileId:b.id,effort:'medium'},c2);settings.models.find(profile=>profile.id===c.id).enabled=false;settings=(await request('/api/text-models',settings)).data;
  const beforeConfirmation=calls.length,item=instance.engine.jobs.get(pending.data.id).creations[0];const skipped=await request('/api/jobs/'+pending.data.id+'/new-files/'+item.id,{decision:'skip',adminToken:'abcdef'},c2);assert.equal(skipped.status,200,skipped.data.error);
  await wait(()=>instance.engine.jobs.get(pending.data.id).activitySummary?.status==='completed');assert(calls.slice(beforeConfirmation).some(call=>call.body.model==='model-c'&&call.body.reasoning.effort==='high'),'跨確認請求的完工整理仍用原模型快照');
  settings.models.find(profile=>profile.id===c.id).enabled=true;settings=(await request('/api/text-models',settings)).data;await request('/api/text-model-selection',{profileId:c.id,effort:'high'},c2);
  const imageOffset=calls.length,imageId='12345678-1234-4123-8123-abcdef123456';assert.equal((await request('/api/image-projects',{id:imageId},c2)).status,201);
  const series=(await request('/api/image-projects/'+imageId+'/series',{name:'流程圖'},c2)).data.series;
  for(let index=0;index<2;index++){const chat=await request('/api/image-project-chat',{imageProjectId:imageId,seriesId:series.id,question:'圖片文字討論 '+index,imageIds:[],includeLatestImage:false},c2);assert.equal(chat.status,202,chat.data.error);await wait(()=>!instance.engine.jobs.get(chat.data.id).imageDraftUpdating);assert.equal(instance.engine.jobs.get(chat.data.id).ai.model,'model-c');}
  const candidate=await request('/api/image-projects/'+imageId+'/series/'+series.id+'/summary-candidate',{},c2);assert.equal(candidate.status,200,candidate.data.error);assert.equal(candidate.data.candidate.modelSelection.modelId,'model-c');
  const generation=await request('/api/image-project-generation',{imageProjectId:imageId,seriesId:series.id,prompt:'流程圖',currentRequest:'建立流程圖',adminToken:'abcdef'},c2);assert.equal(generation.status,202,generation.data.error);await wait(()=>instance.creations.jobs.get(generation.data.id)?.status==='completed');
  const generated=calls.find(call=>call.url.endsWith('/generations'));assert.ok(generated);assert.notEqual(generated.body.model,'model-c');assert.equal(generated.body.reasoning,undefined);
  const composed=await request('/api/image-project-prompt-compositions',{imageProjectId:imageId,seriesId:series.id,previousJobId:generation.data.id,currentRequest:'只換配色'},c2);assert.equal(composed.status,200,composed.data.error);
  const trace=instance.saved.data.imagePromptCompositions.find(item=>item.id===composed.data.id);assert.equal(trace.modelSelection.modelId,'model-c');
  const textCalls=calls.slice(imageOffset).filter(call=>call.url.endsWith('/responses'));assert(textCalls.length>0);assert(textCalls.every(call=>call.body.model==='model-c'&&call.body.reasoning.effort==='high'));
  const restored=(await request('/api/conversations',undefined,c2)).data;assert.equal(restored.modelPreferences.selection.modelId,'model-c');assert.equal(restored.modelPreferences.selection.effort,'high');
  assert.equal(JSON.stringify((await request('/api/text-models')).data).includes('FAKE'),false,'模型管理不回傳金鑰');
});

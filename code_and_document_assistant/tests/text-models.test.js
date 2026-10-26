const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {TextModels}=require('../src/text-models');
const {AIClient}=require('../src/ai-client');
const {AppState}=require('../src/app-state');

test('使用者模型管理、對話預設與選擇持久化，停用不改動既有快照',async t=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'cda-text-models-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));
  const saved=await new AppState(base).init(),client={mode:'real',config:{model:'actual-startup',omitModel:false}},models=new TextModels(saved,client);
  const initial=models.public('owner');assert.equal(initial.models.length,1);assert.equal(initial.models[0].modelId,'actual-startup');assert.equal(initial.models[0].defaultEffort,'medium');
  const first=saved.conversation('owner','demo'),firstSnapshot=models.resolve('owner',first),profile=initial.models[0];
  const next={...profile,id:'second',modelId:'actual-second',displayName:'短名稱',depths:[...profile.depths,{value:'xhigh',label:'極高',enabled:true}]};
  await models.save('owner',{...initial,models:[profile,next],defaultModelId:next.id});
  const second={id:'other-conversation'},selected=models.resolve('owner',second);assert.equal(selected.modelId,'actual-second');assert.equal(selected.effort,'medium');
  assert.equal(models.resolve('owner',first).modelId,'actual-startup','更新預設不改既有對話');
  await models.choose('owner',first,{profileId:next.id,effort:'xhigh'});assert.equal(models.resolve('owner',first).effortLabel,'極高');
  const snapshot=models.resolve('owner',first),settings=models.public('owner');settings.models[1].enabled=false;settings.defaultModelId=profile.id;await models.save('owner',settings);
  assert.equal(models.selection('owner',first).valid,false);assert.throws(()=>models.resolve('owner',first),/停用/);assert.equal(snapshot.modelId,'actual-second');assert.equal(firstSnapshot.modelId,'actual-startup');
  assert.equal(models.public('other-owner').models.length,1,'不同使用者不共享模型清單');
  await saved.save();const reloaded=await new AppState(base).init(),restored=new TextModels(reloaded,client);assert.equal(restored.selection('owner',reloaded.data.conversations[0]).valid,false);assert.equal(restored.public('owner').models[1].displayName,'短名稱');
  const removing=models.public('owner');removing.models=removing.models.filter(item=>item.id!==next.id);await models.save('owner',removing);assert.match(models.selection('owner',first).reason,/刪除/);
});

test('先前使用 Mock 的使用者進入 real 模式時，以啟動模型初始化',()=>{
  const saved={data:{},save:async()=>{}},client={mode:'mock'},models=new TextModels(saved,client);assert.equal(models.public('owner').models.length,0);client.mode='real';client.config={model:'configured-api-id'};assert.equal(models.public('owner').models[0].modelId,'configured-api-id');
});

test('設定驗證拒絕重複 ID、無效深度、未啟用預設與過期修改',async()=>{
  const saved={data:{},save:async()=>{}},models=new TextModels(saved,{mode:'real',config:{model:'startup'}}),initial=models.public('me');
  await assert.rejects(models.save('me',{...initial,models:[initial.models[0],initial.models[0]]}),/不可重複/);
  const invalid=structuredClone(initial);invalid.models[0].depths[0].value='bad value';await assert.rejects(models.save('me',invalid),/格式不符/);
  const disabled=structuredClone(initial);disabled.models[0].enabled=false;await assert.rejects(models.save('me',disabled),/已啟用/);
  await models.save('me',initial);await assert.rejects(models.save('me',initial),/已更新/);
  await assert.rejects(models.choose('me',{}, {profileId:initial.models[0].id,effort:'unknown'}),/深度/);
});

for(const protocol of ['responses','chat-completions'])test(protocol+'：不同非同步操作隔離模型與深度，不傳深度的模型不帶欄位',async t=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'cda-model-protocol-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));
  const config=path.join(base,'config.json');await fs.writeFile(config,JSON.stringify({provider:'openai-compatible',protocol,endpoint:'http://127.0.0.1:9999/test',model:'startup'}));
  const calls=[],client=new AIClient({env:{CDA_AI_CONFIG:config,CDA_AI_KEY:'FAKE'},fetchImpl:async(url,options)=>{calls.push(JSON.parse(options.body));return Response.json(protocol==='responses'?{status:'completed',output:[{type:'message',content:[{type:'output_text',text:'done'}]}]}:{choices:[{message:{content:'done'},finish_reason:'stop'}]});}});
  let release;const waiting=new Promise(resolve=>{release=resolve;});
  const first=client.withSelection({modelId:'model-a',omitModel:false,sendReasoning:true,effort:'high'},async()=>{await waiting;return client.finalAnswer([{role:'user',content:'A'}]);});
  const second=client.withSelection({modelId:'model-b',omitModel:false,sendReasoning:false,effort:'low'},async()=>{await client.finalAnswer([{role:'user',content:'B'}]);release();});
  await Promise.all([first,second]);assert.deepEqual(calls.map(call=>call.model),['model-b','model-a']);assert.equal(calls[0].reasoning,undefined);assert.equal(calls[0].reasoning_effort,undefined);
  assert.equal(protocol==='responses'?calls[1].reasoning.effort:calls[1].reasoning_effort,'high');assert.equal(client.config.model,'startup');assert.equal(client.activeSelection(),null);
});

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {AppState}=require('../src/app-state.js');

test('單筆刪除清除各版本及衍生記憶，保留後續任務並可重新載入',async t=>{
  const dir=await fs.mkdtemp(path.join(__dirname,'delete-task-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const saved=await new AppState(dir).init(),c=saved.conversation('user','project');
  c.jobs=[{id:'a',question:'原始需求',status:'completed'},{id:'b2',taskId:'b1',question:'刪除內容',status:'completed',versions:[{id:'b1',question:'舊版本'}]},{id:'c',question:'保留的後續需求',status:'completed',historySelection:{candidateInput:{candidates:[{id:'b2',question:'刪除內容'}]},mainContext:{summary:'刪除內容'}}}];
  Object.assign(c.memory,{confirmed:[{id:'r1',sourceJobId:'a',text:'原始需求',status:'superseded'},{id:'r2',sourceJobId:'b1',text:'刪除內容',status:'active',replaces:['r1']}],structured:{constraints:[{text:'刪除內容',sourceJobIds:['b2']}]},summary:'刪除內容',sources:[{id:'b2'}],updates:[{summary:'刪除內容'}]});
  await saved.save();await saved.deleteTask('user','project',c.id,'b1');
  const reloaded=await new AppState(dir).init(),after=reloaded.conversation('user','project',c.id);
  assert.deepEqual(after.jobs.map(j=>j.id),['a','c']);assert.equal(after.memory.confirmed[0].status,'active');assert.equal(after.memory.confirmed.length,1);
  assert.equal(after.jobs[1].historySelection.redacted,true);assert.deepEqual(after.jobs[1].historySelection.candidateInput.candidates,[]);assert.equal(after.jobs[1].historySelection.mainContext.summary,undefined);assert.deepEqual(after.memory.structured.constraints,[]);
  assert.equal(JSON.stringify(after).includes('刪除內容'),false);
});

test('刪除只移除受影響或來源不明的摘要，保留可追溯項目及快照',async t=>{
  const dir=await fs.mkdtemp(path.join(__dirname,'delete-task-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const saved=await new AppState(dir).init(),c=saved.conversation('user','project');
  c.jobs=[{id:'a',question:'保留資料',status:'completed'},{id:'b',question:'移除資料',status:'completed'},{id:'c',question:'後續資料',status:'completed',historySelection:{status:'completed',candidateInput:{fixed:{confirmed:['移除資料']},candidates:[{id:'a',question:'保留資料'},{id:'b',question:'移除資料'}]},candidateJobIds:['a','b'],selectedJobIds:['a','b'],decisions:[{id:'a',reason:'可能混合內容'},{id:'b',reason:'移除資料'}],mainContext:{confirmed:['移除資料'],recent:[{id:'a',question:'保留資料'},{id:'b',question:'移除資料'}]}}}];
  c.memory.structured={goals:[{text:'保留摘要',sourceJobIds:['a']},{text:'混合摘要',sourceJobIds:['a','b']},{text:'來源不明'}],decisions:[],constraints:[],completed:[],pending:[]};
  c.memory.sources=[{id:'a'},{id:'b'}];c.memory.updates=[{version:1,structured:structuredClone(c.memory.structured),summary:'混合摘要',sourceJobIds:['a','b']}];
  await saved.deleteTask('user','project',c.id,'b');
  assert.deepEqual(c.memory.structured.goals.map(x=>x.text),['保留摘要']);assert.deepEqual(c.memory.updates[0].structured.goals.map(x=>x.text),['保留摘要']);
  const trace=c.jobs[1].historySelection;assert.equal(trace.redacted,true);assert.deepEqual(trace.candidateJobIds,['a']);assert.deepEqual(trace.mainContext.recent.map(x=>x.id),['a']);assert.equal(trace.candidateInput.fixed,undefined);assert.equal(trace.mainContext.confirmed,undefined);
});

test('刪除後仍有其他需求取代原需求時不恢復有效',async t=>{
  const dir=await fs.mkdtemp(path.join(__dirname,'delete-task-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const saved=await new AppState(dir).init(),c=saved.conversation('user','project');
  c.jobs=[{id:'a',question:'a'},{id:'b',question:'b'},{id:'c',question:'c'}];
  c.memory.confirmed=[{id:'r1',sourceJobId:'a',text:'a',status:'superseded'},{id:'r2',sourceJobId:'b',text:'b',status:'superseded',replaces:['r1']},{id:'r3',sourceJobId:'c',text:'c',status:'active',replaces:['r2']}];
  await saved.deleteTask('user','project',c.id,'b');assert.equal(c.memory.confirmed[0].status,'superseded');assert.deepEqual(c.memory.confirmed[1].replaces,['r1']);
});

test('保存失敗時恢復卡片與原始記憶',async t=>{
  const dir=await fs.mkdtemp(path.join(__dirname,'delete-task-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const saved=await new AppState(dir).init(),c=saved.conversation('user','project');
  c.jobs=[{id:'a',question:'需求',status:'completed'}];c.memory.confirmed=[{id:'r',sourceJobId:'a',text:'需求',status:'active'}];
  saved.save=async()=>{throw new Error('寫入失敗');};await assert.rejects(saved.deleteTask('user','project',c.id,'a'),/寫入失敗/);
  assert.equal(c.jobs[0].id,'a');assert.equal(c.memory.confirmed[0].text,'需求');
});

test('刪除 API 保護圖片專案任務並刪除一般任務',async t=>{
  const {createApp}=require('../server.js'),dir=await fs.mkdtemp(path.join(__dirname,'delete-task-http-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const instance=await createApp({runtime:path.join(dir,'runtime'),imageProjectRoot:path.join(dir,'images')});
  const server=instance.app.listen(0,'127.0.0.1');await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin='http://127.0.0.1:'+server.address().port;let sessionResponse;
  try{sessionResponse=await fetch(origin+'/api/session');}catch(error){if(error.cause?.code==='EACCES'){t.skip('環境不允許連線至本機伺服器');return;}throw error;}
  const session=await sessionResponse.json(),cookie=sessionResponse.headers.get('set-cookie').split(';')[0];
  const headers={cookie,'x-cda-token':session.csrf,'x-cda-project':'demo','content-type':'application/json'};
  const initial=await (await fetch(origin+'/api/conversations',{headers})).json();headers['x-cda-conversation']=initial.id;
  const owner=cookie.split('=')[1],conversation=instance.saved.conversation(owner,'demo',initial.id);
  conversation.jobs.push({id:'plain',taskId:'plain',question:'測試',status:'completed',projectId:'demo',conversationId:initial.id},{id:'image-project',question:'圖片',status:'completed',imageProjectChat:{projectId:'image-project'}});await instance.saved.save();
  const blocked=await fetch(origin+'/api/jobs/image-project',{method:'DELETE',headers});assert.equal(blocked.status,409);assert.equal(conversation.jobs.length,2);
  const deleted=await fetch(origin+'/api/jobs/plain',{method:'DELETE',headers});assert.equal(deleted.status,200);assert.deepEqual(conversation.jobs.map(j=>j.id),['image-project']);
});

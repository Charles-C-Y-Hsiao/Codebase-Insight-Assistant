const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {Workspace}=require('../src/workspace.js');
const {Engine}=require('../src/engine.js');
const {validate,registry}=require('../src/tools.js');
const {createApp}=require('../server.js');
const baseLimits=require('../config/example.json').limits;
async function fixture(t,overrides={}){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'cda-test-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const limits={...baseLimits,toolTimeoutMs:150,...overrides};
  const ws=new Workspace(root,limits);await ws.init(path.join(__dirname,'../examples'),[path.join(__dirname,'../docs/example_data')]);
  return {ws,engine:new Engine(ws,limits),root};
}
async function ask(engine,question,ids=[]){const j=engine.start(question,ids,'test');await engine.jobs.get(j.id).finished;return engine.jobs.get(j.id);}
test('一致：文件與三個唯讀工具有可追溯引用',async t=>{
  const {engine}=await fixture(t);const j=await ask(engine,'比較產品 A 2026 Q1 文件與資料');
  assert.equal(j.status,'completed');assert.match(j.result.conclusions[0],/一致/);assert.equal(j.tools.length,3);
  assert.ok(j.result.facts.length>=4);for(const f of j.result.facts)assert.ok(f.evidenceIds.every(id=>j.evidence.some(e=>e.id===id&&e.path&&e.location)));
});
test('衝突：顯示三個數值及程式計算差額',async t=>{
  const {engine}=await fixture(t);const j=await ask(engine,'比較產品 B 2026 Q1');
  assert.match(j.result.conclusions[0],/衝突/);const text=JSON.stringify(j.result);assert.match(text,/1,500,000/);assert.match(text,/1,280,000/);assert.match(text,/1,300,000/);assert.match(text,/-220,000/);
});
test('缺少產品或時間先追問，沒有查詢工具',async t=>{
  const {engine}=await fixture(t);for(const q of ['查詢訂單','產品 A 訂單','2026 Q1 訂單']){const j=await ask(engine,q);assert.equal(j.status,'needs_input');assert.equal(j.calls,0);}
});
test('缺少能力、白名單及 schema 拒絕任意 SQL',async t=>{
  const {engine}=await fixture(t);const j=await ask(engine,'查詢薪資');assert.match(j.result.conclusions[0],/能力不足/);assert.equal(j.calls,0);
  assert.throws(()=>validate('shell',{}));assert.throws(()=>validate('sqlserver.orders',{product:'A',period:'2026 Q1',sql:'DROP TABLE orders'}));
});
test('API 失敗或逾時有限重試，保留文件與 SQL 結果',async t=>{
  const {engine}=await fixture(t);for(const kind of ['失敗','逾時']){const j=await ask(engine,'產品 A 2026 Q1 API '+kind);assert.equal(j.status,'partial');assert.equal(j.tools.filter(x=>x.name==='api.orders').length,2);assert.ok(j.evidence.some(x=>x.path==='mock://sqlserver.orders'));assert.ok(j.result.unknown.some(x=>x.includes('api.orders')));}
});
test('文件內指令不影響權限或工具執行',async t=>{
  const {engine,ws}=await fixture(t);const ids=ws.files.filter(f=>['sales.md','untrusted.md'].includes(f.name)).map(f=>f.id);const j=await ask(engine,'產品 A 2026 Q1 文件核對',ids);assert.equal(j.status,'completed');assert.ok(j.evidence.some(e=>e.excerpt.includes('刪除所有')));assert.deepEqual([...new Set(j.tools.map(x=>x.name))],registry.map(t=>t.name));
});
test('取消與總時間/呼叫上限能停止流程',async t=>{
  const {engine}=await fixture(t);const started=engine.start('產品 A 2026 Q1 API 逾時',[],'test');engine.cancel(started.id,'test');await engine.jobs.get(started.id).finished;assert.equal(engine.jobs.get(started.id).status,'cancelled');
  const other=await fixture(t,{overallTimeoutMs:30});const timed=await ask(other.engine,'產品 A 2026 Q1');assert.equal(timed.status,'partial');assert.equal(timed.calls,0);
  const limited=await fixture(t,{maxCalls:1});const j=await ask(limited.engine,'產品 A 2026 Q1');assert.equal(j.status,'partial');assert.equal(j.calls,1);
});
test('修改必須經確認，備份與真實 Node 語法檢查',async t=>{
  const {engine,ws}=await fixture(t);const file=ws.files.find(f=>f.name==='discount.js');const before=await fs.readFile(file.path,'utf8');const j=await ask(engine,'修正折扣計算',[file.id]);assert.equal(j.status,'awaiting_approval');assert.equal(await fs.readFile(file.path,'utf8'),before);
  const result=await engine.apply(j.id,'test');assert.equal(result.applied.verification.status,'passed',result.applied.verification.message);assert.match(await fs.readFile(file.path,'utf8'),/amount \* \(1 - rate\)/);assert.equal(await fs.readFile(result.applied.backup,'utf8'),before);await assert.rejects(()=>engine.apply(j.id,'test'));
});
test('外部修改後拒絕舊差異，不覆蓋使用者內容',async t=>{
  const {engine,ws}=await fixture(t);const file=ws.files.find(f=>f.name==='discount.js');const j=await ask(engine,'修正折扣',[file.id]);await fs.appendFile(file.path,'\n// user edit');await assert.rejects(()=>engine.apply(j.id,'test'),/已變更/);assert.match(await fs.readFile(file.path,'utf8'),/user edit/);
});
test('索引新增修改刪除，解析失敗可見，來源內容變動拒絕讀取',async t=>{
  const {ws}=await fixture(t);const file=path.join(ws.demo,'new.txt');await fs.writeFile(file,'新增文件');await fs.writeFile(path.join(ws.demo,'legacy.doc'),'old');await ws.update();assert.ok(ws.files.some(f=>f.name==='new.txt'));assert.ok(ws.issues.some(i=>i.reason.includes('轉為')));
  const id=ws.files.find(f=>f.name==='new.txt').id;await fs.writeFile(file,'修改文件');await assert.rejects(()=>ws.read(id),/變更/);await ws.update();assert.equal((await ws.read(id)).content,'修改文件');await fs.unlink(file);await ws.update();assert.ok(!ws.files.some(f=>f.id===id));
});
test('Python 已可真實靜態檢查；HTML 有基本結構檢查',async t=>{
  const {ws,engine}=await fixture(t);for(const name of ['discount.py','page.html']){const f=ws.files.find(f=>f.name===name);const j=await ask(engine,'修改範例',[f.id]);const result=await engine.apply(j.id,'test');assert.equal(result.applied.verification.status,'passed',result.applied.verification.message);}
});
test('HTTP 工作階段隔離、跨來源阻擋、資料夾需管理碼',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'cda-http-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const {app,engine,workspace}=await createApp({runtime:path.join(root,'state'),adminToken:'test-admin'});const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
  const origin='http://127.0.0.1:'+server.address().port;
  async function session(){const r=await fetch(origin+'/api/session');return {cookie:r.headers.get('set-cookie').split(';')[0],'x-cda-token':(await r.json()).csrf,'content-type':'application/json'};}
  const headers=await session();const other=await session();assert.equal((await fetch(origin+'/api/files')).status,403);
  assert.equal((await fetch(origin+'/api/index',{method:'POST',headers:{...headers,origin:'http://evil.example'},body:'{}'})).status,403);
  const j=await (await fetch(origin+'/api/jobs',{method:'POST',headers,body:JSON.stringify({question:'產品 A 2026 Q1'})})).json();await engine.jobs.get(j.id).finished;
  assert.equal((await fetch(origin+'/api/jobs/'+j.id,{headers:other})).status,400);
  const extra=path.join(root,'extra');await fs.mkdir(extra);await fs.writeFile(path.join(extra,'test.txt'),'External document');
  const request=await (await fetch(origin+'/api/roots/request',{method:'POST',headers,body:JSON.stringify({path:extra})})).json();assert.ok(!workspace.files.some(f=>f.name==='test.txt'));
  assert.equal((await fetch(origin+'/api/roots/'+request.id+'/approve',{method:'POST',headers,body:JSON.stringify({adminToken:'wrong'})})).status,403);
  assert.equal((await fetch(origin+'/api/roots/'+request.id+'/approve',{method:'POST',headers,body:JSON.stringify({adminToken:'test-admin'})})).status,200);assert.equal(workspace.files.find(f=>f.name==='test.txt').writable,false);
});
test('模型或文件搜尋停滯仍受整體期限控制',async t=>{
  const {engine,ws}=await fixture(t,{overallTimeoutMs:180});
  ws.search=()=>new Promise(()=>{});
  const started=Date.now();const j=await ask(engine,'產品 A 2026 Q1');
  assert.equal(j.status,'partial');assert.match(j.result.unknown[0],/逾時/);assert.ok(Date.now()-started<2000);
});

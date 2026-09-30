const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const run=promisify(execFile);
const {parse,pythonPath}=require('../src/parsers.js');
const {Workspace}=require('../src/workspace.js');
const {Engine}=require('../src/engine.js');
const {createApp}=require('../server.js');
const limits=require('../config/example.json').limits;
let root,documents;
before(async()=>{
  const parent=require('node:os').tmpdir();root=await fs.mkdtemp(path.join(parent,'phase2-test-'));documents=path.join(root,'documents');
  assert.ok(pythonPath(),'需設定 CDA_PYTHON');
  await run(pythonPath(),['-I','-B',path.join(__dirname,'generate_fixtures.py'),documents],{windowsHide:true,timeout:30000});
});
after(async()=>{if(root&&path.dirname(root)===require('node:os').tmpdir()&&path.basename(root).startsWith('phase2-test-'))await fs.rm(root,{recursive:true,force:true});});
const document=async name=>parse(await fs.readFile(path.join(documents,name)),path.extname(name));
async function setup(t){const folder=await fs.mkdtemp(path.join(root,'workspace-'));const ws=new Workspace(folder,limits);await ws.init(path.resolve(__dirname,'../examples'),[path.resolve(__dirname,'../docs/example_data')]);return ws;}
test('PDF 文字實際解析，來源頁碼正確；空白頁明示 OCR 需求',async()=>{
  const result=await document('sample.pdf');assert.equal(result.segments.length,2);assert.equal(result.segments[1].locator.page,2);assert.match(result.segments[1].text,/Page two/);await assert.rejects(()=>document('blank.pdf'),/OCR/);
});
test('DOCX 保留標題、段落與完整表格表頭',async()=>{
  const r=await document('policy.docx');assert.ok(r.segments.some(s=>s.locator.heading==='測試政策'&&s.locator.paragraph===2));const table=r.segments.find(s=>s.locator.table===1);assert.match(table.text,/產品 \| 金額 TWD/);assert.match(table.text,/甲 \| 1234/);
});
test('PPTX 按 presentation 關聯次序保留投影片與表格',async()=>{
  const r=await document('slides.pptx');assert.equal(r.segments.length,2);assert.equal(r.segments[1].locator.slide,2);assert.match(r.segments[1].text,/Second slide/);assert.match(r.segments[1].text,/Product \| Amount TWD/);
});
test('XLSX 保留工作表、儲存格、候選表頭、日期、合併及公式缺快取',async()=>{
  const r=await document('sales.xlsx');const row=r.segments.find(s=>s.locator.row==='2');assert.equal(row.locator.sheet,'銷售');assert.ok(row.locator.cells.includes('D2'));assert.match(row.text,/金額 TWD/);assert.match(row.text,/2026-01-02/);assert.match(row.text,/缺少，未計算/);assert.ok(r.segments.some(s=>s.locator.merged?.includes('E1:F1')));assert.ok(r.warnings.some(s=>s.includes('未重新計算')));
});
test('損壞 Office 格式可見錯誤，不默默忽略',async()=>{await assert.rejects(()=>parse(Buffer.from('broken'),'.docx'),/zip/i);});
test('DTD / 外部 entity 被拒絕；已取消解析不繼續',async()=>{
  await assert.rejects(()=>document('entity.docx'),/DTD/);
  const ctrl=new AbortController();ctrl.abort();await assert.rejects(()=>parse(Buffer.from('broken'),'.docx',{signal:ctrl.signal}),/取消/);
});
test('真實索引、區段定位、原始位元組版本、授權過期／撤銷',async t=>{
  const ws=await setup(t);const grant=await ws.authorize(documents,{minutes:10});const matches=await ws.search('Second slide');assert.ok(matches.some(e=>e.mode==='real'&&e.locator.slide===2&&e.version.length===64));assert.ok(ws.issues.some(i=>i.path.endsWith('blank.pdf')&&i.reason.includes('OCR')));
  const f=ws.files.find(f=>f.name==='policy.docx');grant.expiresAt=Date.now()-1;await assert.rejects(()=>ws.read(f.id),/過期/);assert.ok(!ws.inventory().files.some(x=>x.id===f.id));
  await ws.authorize(documents,{minutes:10});await ws.revoke(grant.id);await assert.rejects(()=>ws.read(f.id),/找不到|過期/);
});
test('一般程式修改有權限、提案防篡改、備份，靜態驗證不執行程式',async t=>{
  const ws=await setup(t);const dir=path.join(root,'code');await fs.mkdir(dir);const file=path.join(dir,'utility.js');await fs.writeFile(file,'module.exports = 1;');
  await ws.authorize(dir);let f=ws.files.find(f=>f.name==='utility.js');await assert.rejects(()=>ws.createProposal(f.id,'module.exports = 2;'),/沒有修改/);
  await ws.authorize(dir,{write:true,verify:true});f=ws.files.find(f=>f.name==='utility.js');
  const sentinel=path.join(dir,'must-not-exist.txt');const code=`require('fs').writeFileSync(${JSON.stringify(sentinel)}, 'unsafe');\nmodule.exports = 2;`;
  const p=await ws.createProposal(f.id,code);assert.equal(await fs.readFile(file,'utf8'),'module.exports = 1;');await assert.rejects(()=>ws.apply({...p,after:'module.exports = 3;'}),/無效/);
  const result=await ws.apply(p);assert.equal(result.verification.status,'passed');assert.equal(await fs.readFile(result.backup,'utf8'),'module.exports = 1;');await assert.rejects(()=>fs.access(sentinel));assert.equal(await fs.readFile(file,'utf8'),code);
});
test('空白程式檔可作為初始檔修改，空白文件保留未索引提示且不成為搜尋證據',async t=>{
  const ws=await setup(t);const dir=path.join(root,'empty-initial');await fs.mkdir(dir);
  await fs.writeFile(path.join(dir,'index.html'),'');await fs.writeFile(path.join(dir,'notes.txt'),'');await ws.authorize(dir,{write:true,verify:true});
  const code=ws.files.find(f=>f.name==='index.html');assert.equal(code.emptyInitial,true);assert.equal(code.content,'');assert.equal(ws.inventory().files.some(f=>f.name==='notes.txt'),false);
  assert.ok(ws.issues.some(i=>i.path.endsWith('notes.txt')&&i.reason.includes('未取得可用')));assert.deepEqual(await ws.search('anything',[code.id]),[]);
  const proposal=await ws.createProposal(code.id,'<!doctype html><html lang="zh-Hant"><head><title>初始頁面</title></head><body>初始內容</body></html>');const result=await ws.apply(proposal);
  assert.equal(result.verification.status,'passed');assert.match(await fs.readFile(path.join(dir,'index.html'),'utf8'),/初始內容/);
});
test('Python compile 會抓出語法／scope 錯誤且不執行 import',async t=>{
  const ws=await setup(t);const good=await ws.verify('test.py','import missing_module\nraise RuntimeError("never execute")');assert.equal(good.status,'passed');const bad=await ws.verify('test.py','return 42');assert.equal(bad.status,'failed');
});
test('尚未授權驗證不啟動 profile，續期也使舊提案失效',async t=>{
  const ws=await setup(t);const dir=path.join(root,'no-verify');await fs.mkdir(dir);await fs.writeFile(path.join(dir,'work.py'),'x = 1');await ws.authorize(dir,{write:true});const f=ws.files.find(f=>f.name==='work.py');const p=await ws.createProposal(f.id,'x = 2');
  await ws.authorize(dir,{write:true});await assert.rejects(()=>ws.apply(p),/授權已變更/);const p2=await ws.createProposal(f.id,'x = 2');assert.equal((await ws.apply(p2)).verification.status,'not_run');
});
test('AI 未設定及惡意模型計畫不會回退或執行工具',async t=>{
  const ws=await setup(t);const {UnconfiguredModel}=require('../src/connections.js');for(const model of [new UnconfiguredModel(),{plan:async()=>({intent:'shell',command:'delete all'})}]){
    const engine=new Engine(ws,limits,model);const j=engine.start('產品 A 2026 Q1',[],'test');await engine.jobs.get(j.id).finished;const result=engine.jobs.get(j.id);assert.equal(result.status,'partial');assert.equal(result.calls,0);assert.match(result.result.unknown[0],/CONFIG_REQUIRED|schema/);
  }
});
test('要求 real 資料工具時不回傳 Mock 金額',async()=>{
  const script="require('./src/tools.js').execute('sqlserver.orders',{product:'A',period:'2026 Q1'}).then(()=>process.exit(2)).catch(e=>{if(e.code!=='CONFIG_REQUIRED')process.exit(3);console.log(e.code);})";
  const result=await run(process.execPath,['-e',script],{cwd:path.resolve(__dirname,'..'),env:{...process.env,CDA_DATA_MODE:'real'},windowsHide:true,timeout:5000});assert.match(result.stdout,/CONFIG_REQUIRED/);
});
test('HTTP 真實提案、套用與還原需主機管理碼與正確版本',async t=>{
  const runtime=await fs.mkdtemp(path.join(root,'http-'));const {app,workspace}=await createApp({runtime,adminToken:'local-test-admin'});const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
  const origin='http://127.0.0.1:'+server.address().port;const session=await fetch(origin+'/api/session');const headers={cookie:session.headers.get('set-cookie').split(';')[0],'x-cda-token':(await session.json()).csrf,'content-type':'application/json'};
  const post=(url,body)=>fetch(origin+url,{method:'POST',headers,body:JSON.stringify(body)});
  const dir=path.join(root,'http-code');await fs.mkdir(dir);await fs.writeFile(path.join(dir,'custom.js'),'module.exports=1;');await workspace.authorize(dir,{write:true,verify:true});const f=workspace.files.find(f=>f.name==='custom.js');
  const body={fileId:f.id,version:f.hash,after:'module.exports=2;'};
  headers['x-cda-project']=f.rootId;
  assert.equal((await post('/api/proposals',body)).status,403);
  const response=await post('/api/proposals',{...body,adminToken:'local-test-admin'});assert.equal(response.status,202);const job=await response.json();
  assert.equal((await post('/api/jobs/'+job.id+'/apply',{})).status,403);
  const applied=await post('/api/jobs/'+job.id+'/apply',{adminToken:'local-test-admin'});assert.equal(applied.status,200);assert.equal((await applied.json()).result.mock,false);
  assert.equal((await post('/api/jobs/'+job.id+'/restore',{adminToken:'local-test-admin'})).status,200);assert.equal(await fs.readFile(f.path,'utf8'),'module.exports=1;');
});

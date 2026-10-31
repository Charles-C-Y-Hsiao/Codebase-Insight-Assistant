const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {Workspace}=require('../src/workspace');
const {ProjectScope}=require('../src/project-scope');
const {Engine}=require('../src/engine');
const newFiles=require('../src/new-files');
const limits=require('../config/example.json').limits;
async function setup(t){
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'cda-new-files-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));
  const ws=new Workspace(path.join(base,'state'),limits);await ws.init(path.join(__dirname,'fixtures/code-edit'));
  const dir=path.join(base,'project');await fs.mkdir(dir);const root=await ws.authorize(dir,{write:true,ai:true,verify:true});
  return {ws,dir,root,scope:new ProjectScope(ws,root.id)};
}
const file=(name,content='const a=1;')=>({path:name,purpose:'測試用途',content});
test('新檔提案最多20份，沒有確認不寫入；路徑、格式、既有檔與連結受限',async t=>{
  const {ws,scope,dir}=await setup(t);
  const twenty=await newFiles.propose(scope,Array.from({length:20},(_,i)=>file(i+'.js')));
  assert.equal(twenty.length,20);assert.deepEqual(await fs.readdir(dir),[]);
  await assert.rejects(newFiles.propose(scope,Array.from({length:21},(_,i)=>file(i+'.js'))),/20/);
  for(const name of ['../outside.js','C:\\outside.js','/tmp/out.js','file.js:ads','con.js','.env.js','runtime/a.js','missing/a.js','bad.exe','a/../b.js'])await assert.rejects(newFiles.propose(scope,[file(name)]),undefined,name);
  await assert.rejects(newFiles.propose(scope,[file('same.js'),file('SAME.js')]),/重複/);
  await fs.writeFile(path.join(dir,'old.js'),'original');await assert.rejects(newFiles.propose(scope,[file('old.js')]),/已存在/);
  await fs.mkdir(path.join(dir,'existing'));const nested=(await newFiles.propose(scope,[file('existing/new.js')]))[0];
  await newFiles.apply(scope,nested);assert.equal(await fs.readFile(nested.path,'utf8'),'const a=1;');
  try{
    await fs.symlink(path.join(dir,'existing'),path.join(dir,'link'),process.platform==='win32'?'junction':'dir');
    await assert.rejects(newFiles.propose(scope,[file('link/linked.js')]),/連結/);
  }catch(error){if(error.code!=='EPERM')throw error;}
  const tampered={...twenty[0],content:'overwrite'};await assert.rejects(newFiles.apply(scope,tampered),/失效|變更/);
  await fs.writeFile(twenty[1].path,'other writer');await assert.rejects(newFiles.apply(scope,twenty[1]),/已存在/);
  assert.equal(await fs.readFile(twenty[1].path,'utf8'),'other writer');
  await ws.revoke(scope.targetProjectId);await assert.rejects(newFiles.apply(scope,twenty[2]),/失效|授權/);
});
test('逐檔確認、略過、不重複建立，驗證失敗保留檔案並繼續下一份',async t=>{
  const {ws,scope,dir}=await setup(t),engine=new Engine(ws,limits);
  const creations=await newFiles.propose(scope,[file('skip.js'),file('invalid.js','const = ;'),file('ok.js')]);
  const j={id:'new-job',owner:'owner',scope,allowEdits:true,status:'awaiting_approval',creations,events:[],tools:[],startedAt:Date.now()};engine.jobs.set(j.id,j);
  await assert.rejects(engine.decideNewFile(j.id,'owner',creations[1].id,'create'),/依序/);
  await assert.rejects(engine.decideNewFile(j.id,'other',creations[0].id,'create'),/找不到/);
  await engine.decideNewFile(j.id,'owner',creations[0].id,'skip');await assert.rejects(fs.access(path.join(dir,'skip.js')));
  await engine.decideNewFile(j.id,'owner',creations[1].id,'create');
  assert.equal(creations[1].status,'created');assert.equal(creations[1].result.verification.status,'failed');assert.equal(await fs.readFile(path.join(dir,'invalid.js'),'utf8'),'const = ;');assert.equal(j.status,'awaiting_approval');
  await assert.rejects(engine.decideNewFile(j.id,'owner',creations[1].id,'create'),/依序/);
  await engine.decideNewFile(j.id,'owner',creations[2].id,'create');assert.equal(j.status,'partial');assert.equal(creations[2].result.verification.status,'passed');
  const pending=await newFiles.propose(scope,[file('cancelled.js')]);
  const cancelled={...j,id:'cancelled-job',creations:pending,status:'awaiting_approval',controller:new AbortController()};engine.jobs.set(cancelled.id,cancelled);
  engine.cancel(cancelled.id,'owner');assert.equal(pending[0].status,'cancelled');assert.equal(ws.proposals.has(pending[0].id),false);
  await assert.rejects(engine.decideNewFile(cancelled.id,'owner',pending[0].id,'create'));await assert.rejects(fs.access(path.join(dir,'cancelled.js')));
  assert.equal(await fs.readFile(path.join(dir,'ok.js'),'utf8'),'const a=1;');
});
test('Markdown 提案確認後才建立子資料夾，且既有文件可提出修改',async t=>{
  const {ws,scope,dir}=await setup(t),engine=new Engine(ws,limits);
  const [skip,create]=await newFiles.propose(scope,[file('unused/skip.md','# skip'),file('docs/guides/project.md','# 功能\n')]);
  assert.equal(await fs.stat(path.join(dir,'docs')).then(()=>true,()=>false),false);
  const job={id:'markdown-job',owner:'owner',scope,allowEdits:true,status:'awaiting_approval',creations:[skip,create],events:[],tools:[],startedAt:Date.now()};engine.jobs.set(job.id,job);
  await engine.decideNewFile(job.id,'owner',skip.id,'skip');
  assert.equal(await fs.stat(path.join(dir,'unused')).then(()=>true,()=>false),false);
  await engine.decideNewFile(job.id,'owner',create.id,'create');
  assert.equal(await fs.readFile(path.join(dir,'docs','guides','project.md'),'utf8'),'# 功能\n');
  await ws.update([scope.targetProjectId]);
  const document=scope.files.find(item=>item.name==='docs'+path.sep+'guides'+path.sep+'project.md');
  assert.ok(document);
  const proposal=await scope.createProposal(document.id,'# 功能\n\n- 更新\n');
  assert.equal(proposal.after.includes('更新'),true);
  assert.equal((await scope.apply(proposal)).verification.status,'not_run');
  assert.match(await fs.readFile(path.join(dir,'docs','guides','project.md'),'utf8'),/更新/);
});

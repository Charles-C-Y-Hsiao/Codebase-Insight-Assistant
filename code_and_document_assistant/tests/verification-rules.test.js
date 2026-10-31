const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {Workspace}=require('../src/workspace.js');
const {createApp}=require('../server.js');
const limits=require('../config/example.json').limits;

async function workspaceFixture(t){
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'cda-rules-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));
  const workspace=new Workspace(path.join(base,'runtime'),limits);await workspace.init(path.join(__dirname,'fixtures/code-edit'));
  return {base,workspace};
}

test('驗證規則預設啟用、可持久停用，CSS 基本檢查不執行程式',async t=>{
  const {base,workspace}=await workspaceFixture(t);
  assert.deepEqual(workspace.verificationRules().filter(rule=>rule.enabled).map(rule=>rule.id),['node-syntax','python-compile','html-static','json-parse','css-basic']);
  const broken=await workspace.verify('theme.css','body { color: red; /* missing');assert.equal(broken.status,'failed');assert.equal(broken.profile,'css-basic');
  assert.equal((await workspace.verify('theme.css','body { color red; }')).status,'failed');assert.equal((await workspace.verify('theme.css','body { color: red; }')).status,'passed');
  await workspace.setVerificationRule('css-basic',false);assert.equal((await workspace.verify('theme.css','body {')).status,'not_run');
  const next=new Workspace(path.join(base,'runtime'),limits);await next.init(path.join(__dirname,'fixtures/code-edit'));assert.equal(next.verificationRules().find(rule=>rule.id==='css-basic').enabled,false);
  await assert.rejects(()=>workspace.setVerificationRule('powershell',true),/不合法/);
});

test('驗證規則管理 API 僅接受本機管理碼，且只切換已登錄規則',async t=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'cda-rules-http-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));
  const {app,workspace}=await createApp({runtime:path.join(base,'runtime'),adminToken:'abcdef'});const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin='http://127.0.0.1:'+server.address().port,session=await fetch(origin+'/api/session'),headers={cookie:session.headers.get('set-cookie').split(';')[0],'x-cda-token':(await session.json()).csrf,'content-type':'application/json'};
  const initial=await (await fetch(origin+'/api/verification-rules',{headers})).json();assert.equal(initial.scope,'service');assert.equal(initial.rules.find(rule=>rule.id==='css-basic').enabled,true);
  const denied=await fetch(origin+'/api/verification-rules/css-basic',{method:'POST',headers,body:JSON.stringify({adminToken:'wrong',enabled:false})});assert.equal(denied.status,403);
  const updated=await (await fetch(origin+'/api/verification-rules/css-basic',{method:'POST',headers,body:JSON.stringify({adminToken:'abcdef',enabled:false})})).json();assert.equal(updated.rule.enabled,false);assert.equal(workspace.verificationRules().find(rule=>rule.id==='css-basic').enabled,false);
  const unknown=await fetch(origin+'/api/verification-rules/anything',{method:'POST',headers,body:JSON.stringify({adminToken:'abcdef',enabled:true})});assert.equal(unknown.status,400);
});

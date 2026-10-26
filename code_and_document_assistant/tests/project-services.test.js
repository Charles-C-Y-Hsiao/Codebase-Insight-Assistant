const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const net=require('node:net');
const {Workspace}=require('../src/workspace.js');
const {ProjectScope}=require('../src/project-scope.js');
const {ProjectServices,portOpen,expectedPort,verificationRequest}=require('../src/project-services.js');
const limits=require('../config/example.json').limits;

test('服務候選需確認後才啟動，依指定 Port 於 127.0.0.1 驗證並可停止',async t=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'cda-service-'));
  t.after(()=>fs.rm(base,{recursive:true,force:true}));
  const project=path.join(base,'project'),external=path.join(base,'external');
  await fs.mkdir(project);await fs.mkdir(external);
  await fs.writeFile(path.join(project,'api.js'),"const http=require('node:http');const port=Number(process.env.PORT)||3000;http.createServer((req,res)=>res.end('ok')).listen(port,'127.0.0.1');");
  const workspace=new Workspace(path.join(base,'state'),limits);await workspace.init(path.join(__dirname,'../examples'));
  const root=await workspace.authorize(project,{write:true,ai:true}),scope=new ProjectScope(workspace,root.id),services=new ProjectServices(workspace);
  const candidates=await services.candidates(scope);
  assert.deepEqual(candidates.map(item=>item.entry),['api.js']);assert.equal(candidates[0].port,3000);
  assert.equal(expectedPort('const port = Number(process.env.PORT) || 3015;'),3015);
  const modules=path.join(external,'node_modules');
  assert.deepEqual((await services.dependencies(scope,modules)).missing,[]);
  const listener=net.createServer();listener.listen(0,'127.0.0.1');await new Promise(resolve=>listener.once('listening',resolve));const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
  assert.equal(await portOpen(port),false);
  const service=await services.start(scope,'owner','job',{entry:'api.js',port,moduleDirectory:modules});
  t.after(()=>services.stop('owner',root.id,service.id));
  assert.equal(service.status,'running',service.output);assert.equal(await portOpen(port),true);
  assert.equal(service.initialMonitor.status,'monitoring');assert.equal(service.initialMonitor.intervalMs,30000);assert.equal(service.initialMonitor.checks[0].portOpen,true);
  assert.equal((await services.list('owner',root.id)).length,1);
  await services.stop('owner',root.id,service.id);
  assert.equal((await services.list('owner',root.id))[0].initialMonitor.status,'stopped');
  for(let i=0;i<20&&await portOpen(port);i++)await new Promise(resolve=>setTimeout(resolve,100));
  assert.equal(await portOpen(port),false);
});

test('從已選服務入口追蹤被修改的 Express 字串路由與本機掛載路由',async t=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'cda-service-routes-'));
  t.after(()=>fs.rm(base,{recursive:true,force:true}));
  const project=path.join(base,'project');await fs.mkdir(path.join(project,'routes'),{recursive:true});
  const entry=path.join(project,'server.js'),route=path.join(project,'routes','api.js');
  await fs.writeFile(entry,"const express=require('express');const api=require('./routes/api');const app=express();app.use('/api',api);app.listen(3000);");
  await fs.writeFile(route,"const express=require('express');const router=express.Router();router.get('/items/:id',(req,res)=>res.json({id:req.params.id}));router.post('/items',(req,res)=>res.json({name:req.body.name,active:req.body.active}));module.exports=router;");
  const workspace=new Workspace(path.join(base,'state'),limits);await workspace.init(path.join(__dirname,'../examples'));
  const root=await workspace.authorize(project,{write:true,ai:true}),scope=new ProjectScope(workspace,root.id),services=new ProjectServices(workspace);
  const result=await services.scanChangedRoutes(scope,'server.js',[route]);
  assert.equal(result.routes.length,2);
  assert.deepEqual(result.routes.map(item=>`${item.method} ${item.path}`),['GET /api/items/:id','POST /api/items']);
  assert.deepEqual(result.routes[0].params,['id']);
  assert.deepEqual(result.routes[1].bodySchema,{name:'',active:''});
  assert.equal(result.routes.every(item=>item.changed),true);
});

test('修改服務入口時掃描其匯入模組中的 Express 路由',async t=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'cda-service-entry-routes-'));
  t.after(()=>fs.rm(base,{recursive:true,force:true}));
  const project=path.join(base,'project');await fs.mkdir(path.join(project,'routes'),{recursive:true});
  const entry=path.join(project,'server.js'),route=path.join(project,'routes','health.js');
  await fs.writeFile(entry,"import {health as healthRoutes} from './routes/health';const app=require('express')();app.use('/health',healthRoutes);app.listen(3000);");
  await fs.writeFile(route,"const router=require('express').Router();router.get('/ready',(req,res)=>res.json({ready:true}));module.exports=router;");
  const workspace=new Workspace(path.join(base,'state'),limits);await workspace.init(path.join(__dirname,'../examples'));
  const root=await workspace.authorize(project,{write:true,ai:true}),scope=new ProjectScope(workspace,root.id),services=new ProjectServices(workspace);
  const result=await services.scanChangedRoutes(scope,'server.js',[entry]);
  assert.deepEqual(result.routes.map(item=>`${item.method} ${item.path}`),['GET /health/ready']);
});

test('外部依賴分開列出正式與開發套件，專案內路徑不可用',async t=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'cda-service-deps-'));
  t.after(()=>fs.rm(base,{recursive:true,force:true}));
  const project=path.join(base,'project'),external=path.join(base,'external');
  await fs.mkdir(project);await fs.mkdir(external);
  await fs.writeFile(path.join(project,'package.json'),JSON.stringify({dependencies:{express:'^4.0.0'},devDependencies:{nodemon:'^3.0.0'}}));
  const workspace=new Workspace(path.join(base,'state'),limits);await workspace.init(path.join(__dirname,'../examples'));
  const root=await workspace.authorize(project,{write:true,ai:true}),scope=new ProjectScope(workspace,root.id),services=new ProjectServices(workspace);
  const modules=path.join(external,'node_modules');
  assert.deepEqual((await services.dependencies(scope,modules)).missing,[{name:'express',version:'^4.0.0'}]);
  assert.deepEqual((await services.dependencies(scope,modules,{includeDev:true})).missing,[{name:'nodemon',version:'^3.0.0'}]);
  await assert.rejects(services.dependencies(scope,path.join(project,'node_modules')),/專案與助手資料夾外/);
  assert.equal(await fs.stat(modules).catch(error=>error.code==='ENOENT'?null:Promise.reject(error)),null);
});

test('package.json 的單一 Node 入口可委派監聽程式',async t=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'cda-service-entry-'));
  t.after(()=>fs.rm(base,{recursive:true,force:true}));
  const project=path.join(base,'project');await fs.mkdir(project);
  await fs.writeFile(path.join(project,'package.json'),JSON.stringify({scripts:{start:'node app.js'}}));
  await fs.writeFile(path.join(project,'app.js'),"require('./listener.js');");
  await fs.writeFile(path.join(project,'listener.js'),"require('node:http').createServer((req,res)=>res.end('ok')).listen(3015);");
  const workspace=new Workspace(path.join(base,'state'),limits);await workspace.init(path.join(__dirname,'../examples'));
  const root=await workspace.authorize(project,{write:true,ai:true}),scope=new ProjectScope(workspace,root.id),services=new ProjectServices(workspace);
  assert.ok((await services.candidates(scope)).some(item=>item.entry==='app.js'&&item.command==='node app.js'));
});

test('API 驗證只接受本站路徑，限制請求大小與比較條件',()=>{
  const valid=verificationRequest({method:'GET',path:'/api/test?token=private',expectedStatus:200,jsonPath:'data.status',jsonExpected:'"ok"'},3000);
  assert.equal(valid.url.origin,'http://127.0.0.1:3000');assert.equal(valid.displayPath,'/api/test');
  assert.throws(()=>verificationRequest({method:'GET',path:'//example.com/api'},3000),/本站/);
  assert.throws(()=>verificationRequest({method:'GET',path:'/api/test',body:'write'},3000),/Body/);
  assert.throws(()=>verificationRequest({method:'POST',path:'/api/test',headers:{Host:'other.example'}},3000),/標頭/);
  assert.throws(()=>verificationRequest({path:'/api/test',jsonPath:'data.status',jsonExpected:'no-json'},3000),/合法 JSON/);
  const publicItem=new ProjectServices({}).public({owner:'private',child:null,redactions:['secret-token'],output:'received secret-token'});
  assert.equal(publicItem.output,'received [遮罩]');assert.equal(publicItem.redactions,undefined);
});

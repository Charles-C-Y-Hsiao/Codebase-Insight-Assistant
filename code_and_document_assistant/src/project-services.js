const fs=require('node:fs/promises');
const path=require('node:path');
const net=require('node:net');
const crypto=require('node:crypto');
const {isDeepStrictEqual}=require('node:util');
const {spawn}=require('node:child_process');
const {within,excluded}=require('./path-policy.js');

const live=new Set();
process.once('exit',()=>{for(const child of live)try{child.kill();}catch{}});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function verificationRequest(value,port){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('請填寫 API 驗證設定');
  const method=String(value.method||'GET').toUpperCase(),relative=String(value.path||'');
  if(!['GET','HEAD','POST','PUT','PATCH','DELETE'].includes(method))throw new Error('API 驗證方法不支援');
  if(!relative.startsWith('/')||relative.startsWith('//')||relative.length>1024||/[\\\x00-\x1f#]/.test(relative))throw new Error('API 驗證路徑須為本站的 / 開頭路徑，可包含查詢參數');
  const url=new URL(relative,`http://127.0.0.1:${port}`);
  if(url.origin!==`http://127.0.0.1:${port}`)throw new Error('API 驗證只允許目前服務的 127.0.0.1 Port');
  const headers=value.headers??{};
  if(typeof headers!=='object'||Array.isArray(headers)||headers===null||Object.keys(headers).length>20)throw new Error('標頭須為 JSON 物件且不超過 20 項');
  for(const [key,entry] of Object.entries(headers))if(!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(key)||['host','connection','content-length','transfer-encoding'].includes(key.toLowerCase())||typeof entry!=='string'||entry.length>2048||/[\r\n]/.test(entry))throw new Error('API 驗證標頭不合法');
  const body=value.body??'';
  if(typeof body!=='string'||Buffer.byteLength(body)>8192||(['GET','HEAD'].includes(method)&&body))throw new Error('GET/HEAD 不可帶 Body，其他方法的 Body 最多 8 KiB');
  const expectedStatus=value.expectedStatus===undefined?200:Number(value.expectedStatus);
  if(!Number.isInteger(expectedStatus)||expectedStatus<100||expectedStatus>599)throw new Error('預期 HTTP 狀態碼不合法');
  const contains=value.contains??'';
  if(typeof contains!=='string'||contains.length>2048)throw new Error('文字包含條件最多 2048 字');
  const jsonPath=value.jsonPath??'';
  if(typeof jsonPath!=='string'||(jsonPath&&!/^[A-Za-z_$][\w$]*(?:\.(?:[A-Za-z_$][\w$]*|\d+))*$/.test(jsonPath)))throw new Error('JSON 欄位請使用 data.status 或 items.0.id 形式');
  if(jsonPath&&typeof value.jsonExpected!=='string')throw new Error('請填寫 JSON 預期值');
  let jsonExpected;
  if(jsonPath){try{jsonExpected=JSON.parse(value.jsonExpected);}catch{throw new Error('JSON 預期值必須是合法 JSON，例如 true、123 或 "ok"');}}
  return {method,path:url.pathname+url.search,displayPath:url.pathname,hadQuery:!!url.search,url,headers,body,expectedStatus,contains,jsonPath,jsonExpected};
}
function verificationRedactions(request){
  return [request.body,...Object.values(request.headers),...request.url.searchParams.values(),request.contains,request.jsonPath?JSON.stringify(request.jsonExpected):''].filter(value=>typeof value==='string'&&value.length>0);
}
async function readBounded(response){
  if(!response.body)return '';
  const reader=response.body.getReader();let size=0;const chunks=[];
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>65536)throw new Error('回應超過 64 KiB，無法安全比對');chunks.push(value);}}
  finally{reader.cancel().catch(()=>{});}
  return Buffer.concat(chunks).toString('utf8');
}
async function runVerification(request){
  const result={checkedAt:new Date().toISOString(),method:request.method,path:request.displayPath,hadQuery:request.hadQuery,expectedStatus:request.expectedStatus,hasTextCondition:!!request.contains,hasJsonCondition:!!request.jsonPath,jsonPath:request.jsonPath||undefined,passed:false};
  try{
    const response=await fetch(request.url,{method:request.method,headers:request.headers,body:request.body||undefined,redirect:'manual',signal:AbortSignal.timeout(5000)});
    result.actualStatus=response.status;result.statusMatched=response.status===request.expectedStatus;
    const raw=await readBounded(response);
    result.textMatched=!request.contains||raw.includes(request.contains);
    if(request.jsonPath){
      try{let value=JSON.parse(raw);for(const segment of request.jsonPath.split('.'))value=value?.[segment];result.jsonMatched=value!==undefined&&isDeepStrictEqual(value,request.jsonExpected);}
      catch{result.jsonMatched=false;}
    }
    result.passed=result.statusMatched&&result.textMatched&&result.jsonMatched!==false;
  }catch(error){result.error=error.name==='TimeoutError'?'API 驗證逾時':error.message==='回應超過 64 KiB，無法安全比對'?error.message:'API 連線或讀取失敗';}
  return result;
}
function portOpen(port){return new Promise(resolve=>{
  const socket=net.connect({host:'127.0.0.1',port});let settled=false;
  const finish=value=>{if(settled)return;settled=true;socket.destroy();resolve(value);};
  socket.setTimeout(700);socket.once('connect',()=>finish(true));socket.once('error',()=>finish(false));socket.once('timeout',()=>finish(false));
});}
function expectedPort(source){
  for(const pattern of [/\b(?:port|PORT)\s*=\s*(?:Number\(process\.env\.[A-Z_]+\)\s*\|\|\s*)?(\d{2,5})\b/i,/\b(?:port|PORT)\s*=\s*[^;\n]*?\|\|\s*(\d{2,5})\b/i,/\.listen\(\s*(\d{2,5})\b/]){
    const value=Number(source.match(pattern)?.[1]);if(value>=1&&value<=65535)return value;
  }
  return null;
}
async function entryFile(scope,relative){
  const root=scope.root(scope.targetProjectId),parts=String(relative||'').split(/[\\/]/);
  if(parts.length>4||parts.some(part=>!part||part==='.'||part==='..'||/[. ]$/.test(part)))throw new Error('服務入口路徑不合法');
  const full=path.resolve(root.path,...parts);
  if(!within(root.path,full)||excluded(root,full,scope.workspace)||!['.js','.cjs','.mjs'].includes(path.extname(full).toLowerCase()))throw new Error('服務入口必須是目前專案內的 Node 檔案');
  await scope.workspace.safePath({rootId:root.id,path:full});
  if(!(await fs.stat(full)).isFile())throw new Error('服務入口不是檔案');
  return {root,full,relativePath:parts.join('/')};
}
async function modulesPath(scope,value){
  if(typeof value!=='string'||!path.isAbsolute(value)||path.basename(path.resolve(value)).toLowerCase()!=='node_modules')throw new Error('請指定專案外的 node_modules 絕對路徑');
  const root=scope.root(scope.targetProjectId),full=path.resolve(value),parent=path.dirname(full);
  if(within(root.path,full)||within(full,root.path)||within(path.resolve(scope.workspace.base),full)||within(path.resolve(__dirname,'..'),full))throw new Error('依賴目錄必須位於專案與助手資料夾外');
  const parentStat=await fs.lstat(parent);
  if(!parentStat.isDirectory()||parentStat.isSymbolicLink())throw new Error('外部依賴的父資料夾須為已存在的真實資料夾');
  const canonical=await fs.realpath(parent);
  if((process.platform==='win32'?canonical.toLowerCase():canonical)!==(process.platform==='win32'?parent.toLowerCase():parent))throw new Error('外部依賴的父路徑不能經過連結');
  const stat=await fs.lstat(full).catch(error=>error.code==='ENOENT'?null:Promise.reject(error));
  if(stat&&(!stat.isDirectory()||stat.isSymbolicLink()))throw new Error('外部 node_modules 不是一般資料夾');
  return {full,parent,exists:!!stat};
}
class ProjectServices {
  constructor(workspace){this.workspace=workspace;this.items=new Map();this.monitorTimers=new Map();this.outputListeners=new Map();}
  scheduleInitialMonitor(id){
    const timer=setTimeout(()=>this.checkInitialMonitor(id).catch(()=>{}),30000);
    timer.unref?.();this.monitorTimers.set(id,timer);
  }
  async checkInitialMonitor(id){
    const service=this.items.get(id),monitor=service?.initialMonitor;
    if(!service||service.status!=='running'||monitor?.status!=='monitoring'){this.monitorTimers.delete(id);return;}
    const processAlive=service.child.exitCode===null,portOpenNow=processAlive&&await portOpen(service.port),checkedAt=new Date().toISOString();
    const current=this.items.get(id),currentMonitor=current?.initialMonitor;
    if(!current||currentMonitor?.status!=='monitoring'){this.monitorTimers.delete(id);return;}
    const check={checkedAt,processAlive,portOpen:portOpenNow};
    if(!processAlive)check.error='服務程序已結束';else if(!portOpenNow)check.error=`127.0.0.1:${current.port} 無法連線`;
    currentMonitor.checks.push(check);if(check.error)currentMonitor.errors.push({checkedAt,message:check.error});
    if(Date.now()>=Date.parse(currentMonitor.endsAt)){
      currentMonitor.status=currentMonitor.errors.length?'completed_with_errors':'completed';currentMonitor.completedAt=checkedAt;this.monitorTimers.delete(id);this.stopOutputCapture(id);
    }
    this.onChange?.(current,{type:'initial-monitor-check'});
    if(currentMonitor.status==='monitoring')this.scheduleInitialMonitor(id);
  }
  stopInitialMonitor(id,status='stopped'){
    const timer=this.monitorTimers.get(id);if(timer)clearTimeout(timer);this.monitorTimers.delete(id);
    const monitor=this.items.get(id)?.initialMonitor;
    if(monitor?.status==='monitoring'){monitor.status=status;monitor.completedAt=new Date().toISOString();}
    this.stopOutputCapture(id);
  }
  stopOutputCapture(id){
    const streams=this.outputListeners.get(id);if(!streams)return;
    streams.stdout.off('data',streams.listener);streams.stderr.off('data',streams.listener);this.outputListeners.delete(id);
  }
  async candidates(scope){
    const root=scope.root(scope.targetProjectId);
    if(!root.permissions.write)throw new Error('啟動服務需要目前專案的修改授權及逐次確認');
    const candidates=new Map();
    const add=async(relative,{fromManifest=false}={})=>{
      try{
        const {full,relativePath}=await entryFile(scope,relative),source=await fs.readFile(full,'utf8');
        if(source.length>65536||(!fromManifest&&!/(\.listen\s*\(|createServer\s*\()/i.test(source)))return;
        candidates.set(relativePath.toLowerCase(),{entry:relativePath,port:expectedPort(source),command:`node ${relativePath}`});
      }catch{}
    };
    const manifest=path.join(root.path,'package.json');
    try{
      const data=JSON.parse(await fs.readFile(manifest,'utf8'));
      const match=String(data.scripts?.start||'').trim().match(/^node\s+(?:"([^"]+)"|'([^']+)'|([^\s]+))$/i);
      if(match)await add(match[1]||match[2]||match[3],{fromManifest:true});
    }catch{}
    let scanned=0;
    const scan=async(relative='',depth=0)=>{
      if(depth>3||scanned>=120)return;
      const directory=path.join(root.path,relative);
      for(const item of await fs.readdir(directory,{withFileTypes:true})){
        if(++scanned>120)break;
        const name=relative?path.join(relative,item.name):item.name,full=path.join(root.path,name);
        if(excluded(root,full,scope.workspace)||item.isSymbolicLink())continue;
        if(item.isDirectory()){if(depth<3)await scan(name,depth+1);continue;}
        if(item.isFile()&&/\.(?:js|cjs|mjs)$/i.test(item.name))await add(name);
      }
    };
    await scan();
    return [...candidates.values()].sort((a,b)=>Number(b.entry==='server.js')-Number(a.entry==='server.js')||a.entry.localeCompare(b.entry));
  }
  async scanChangedRoutes(scope,entry,changedPaths){
    const {root}=await entryFile(scope,entry),changed=new Set((changedPaths||[]).map(value=>path.resolve(value).toLowerCase())),visited=new Set(),routes=[],warnings=[];let inspected=0;
    const resolveImport=async(from,specifier)=>{
      const base=path.resolve(path.dirname(from),specifier),options=[base,...['.js','.cjs','.mjs'].map(ext=>base+ext),...['index.js','index.cjs','index.mjs'].map(name=>path.join(base,name))];
      for(const candidate of options){if(!within(root.path,candidate)||excluded(root,candidate,scope.workspace))continue;try{if((await fs.stat(candidate)).isFile())return candidate;}catch{}}
      return null;
    };
    const join=(prefix,suffix)=>{const value=[prefix.replace(/\/$/,''),suffix.startsWith('/')?suffix:'/'+suffix].filter(Boolean).join('');return value.startsWith('/')?value:'/'+value;};
    const walk=async(full,prefix='',ancestorChanged=false,depth=0)=>{
      if(depth>8||visited.has(full.toLowerCase())||inspected>=160){if(depth>8||inspected>=160)warnings.push('路由模組追蹤達到深度或檔案數上限');return;}
      visited.add(full.toLowerCase());inspected++;
      let source;try{source=await fs.readFile(full,'utf8');}catch(error){warnings.push(`無法讀取路由模組 ${path.relative(root.path,full)}`);return;}
      if(source.length>256*1024){warnings.push(`路由模組超過 256 KiB，未掃描 ${path.relative(root.path,full)}`);return;}
      const clean=source.replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm,'');
      const registrations=[...clean.matchAll(/\b([A-Za-z_$][\w$]*)\s*\.\s*(get|post|put|patch|delete|head|options)\s*\(\s*(['"`])([^'"`]+)\3/gim)];
      const fileChanged=ancestorChanged||changed.has(full.toLowerCase());
      if(fileChanged)for(let index=0;index<registrations.length;index++){
        const match=registrations[index],method=match[2].toUpperCase(),routePath=match[4].trim();
        if(!routePath.startsWith('/')||routePath.startsWith('//')||routePath.includes('${')){warnings.push(`無法靜態判讀字串路由 ${path.relative(root.path,full)}:${match[1]}.${method}`);continue;}
        const end=registrations[index+1]?.index??clean.length,body=clean.slice(match.index,end),bodyFields=[...new Set([
          ...[...body.matchAll(/\breq\s*\.\s*body\s*\.\s*([A-Za-z_$][\w$]*)/g)].map(item=>item[1]),
          ...[...body.matchAll(/\breq\s*\.\s*body\s*\[\s*(['"])([^'"]+)\1\s*\]/g)].map(item=>item[2]),
          ...[...body.matchAll(/\{([^}]+)\}\s*=\s*req\s*\.\s*body/g)].flatMap(item=>item[1].split(',').map(value=>value.trim().split(/\s*:\s*/)[0]).filter(value=>/^[A-Za-z_$][\w$]*$/.test(value)))
        ])];
        routes.push({method,path:join(prefix,routePath),source:path.relative(root.path,full).split(path.sep).join('/'),router:match[1],params:[...routePath.matchAll(/:([A-Za-z_$][\w$]*)/g)].map(item=>item[1]),bodySchema:bodyFields.length?Object.fromEntries(bodyFields.map(key=>[key,''])):null,changed:true});
      }
      const imports=[];
      for(const match of clean.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*require\(\s*(['"])(\.\.?\/[^'"]+)\2\s*\)|\bimport\s+([\s\S]*?)\s+from\s*(['"])(\.\.?\/[^'"]+)\5/g)){
        const clause=match[4]||'',specifier=match[3]||match[6];if(!specifier)continue;
        const variables=match[1]?[match[1]]:clause.startsWith('{')?[...clause.matchAll(/\b[A-Za-z_$][\w$]*(?:\s+as\s+([A-Za-z_$][\w$]*))?/g)].map(item=>item[1]||item[0]):[clause.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/)?.[1]||clause.match(/^\s*([A-Za-z_$][\w$]*)/)?.[1]||''];
        const imported=await resolveImport(full,specifier);if(imported)for(const variable of variables.filter(Boolean))imports.push({variable,full:imported});else warnings.push(`未解析本機路由模組 ${specifier}`);
      }
      const mounts=[...clean.matchAll(/\b[A-Za-z_$][\w$]*\s*\.\s*use\s*\(\s*(?:(['"`])([^'"`]+)\1\s*,\s*)?([A-Za-z_$][\w$]*)\s*\)/g)];
      for(const item of imports){
        const mount=mounts.find(match=>match[3]===item.variable),nextPrefix=mount?.[2]?join(prefix,mount[2]):prefix;
        await walk(item.full,nextPrefix,fileChanged||changed.has(item.full.toLowerCase()),depth+1);
      }
      for(const mount of mounts)if(!imports.some(item=>item.variable===mount[3])&&mount[3]!=='app'&&mount[3]!=='router')warnings.push(`無法連結掛載路由 ${mount[3]}（${path.relative(root.path,full)}）`);
    };
    const entryInfo=await entryFile(scope,entry);
    await walk(entryInfo.full,'',changed.has(entryInfo.full.toLowerCase()));
    const unique=new Map(routes.map(route=>[`${route.method} ${route.path} ${route.source}`,route]));
    return {entry,changedFiles:[...changedPaths],routes:[...unique.values()],warnings:[...new Set(warnings)],inspectedFiles:inspected};
  }
  async dependencies(scope,moduleDirectory,{includeDev=false}={}){
    const location=await modulesPath(scope,moduleDirectory),root=scope.root(scope.targetProjectId);
    let manifest={};try{manifest=JSON.parse(await fs.readFile(path.join(root.path,'package.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw new Error('package.json 無法解析：'+error.message);}
    const packages=[];
    for(const [name,version] of Object.entries(includeDev?manifest.devDependencies||{}:manifest.dependencies||{})){
      if(!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(name)||typeof version!=='string'||!/^\s*[~^*<>=0-9A-Za-z.\s|-]+\s*$/.test(version))throw new Error('套件名稱或版本不支援自動安裝：'+name);
      const parts=name.split('/'),target=path.join(location.full,...parts,'package.json');
      try{if(!(await fs.stat(target)).isFile())packages.push({name,version});}catch(error){if(error.code==='ENOENT')packages.push({name,version});else throw error;}
    }
    return {directory:location.full,parent:location.parent,missing:packages,category:includeDev?'devDependencies':'dependencies',devDependencies:Object.keys(manifest.devDependencies||{})};
  }
  async install(scope,moduleDirectory,{includeDev=false}={}){
    const plan=await this.dependencies(scope,moduleDirectory,{includeDev});
    if(!plan.missing.length)return {...plan,output:'所有 dependencies 已存在'};
    const npmCli=path.join(path.dirname(process.execPath),'node_modules','npm','bin','npm-cli.js');
    if(!(await fs.stat(npmCli).catch(()=>null))?.isFile())throw new Error('找不到本機 npm CLI，請手動在專案外安裝相依套件');
    const args=[npmCli,'install','--prefix',plan.parent,'--no-save','--package-lock=false','--ignore-scripts','--no-audit','--no-fund',...plan.missing.map(item=>item.name+'@'+item.version)];
    const output=await new Promise((resolve,reject)=>{
      const child=spawn(process.execPath,args,{cwd:plan.parent,shell:false,windowsHide:true,env:{...process.env,npm_config_cache:path.join(plan.parent,'.npm-cache')}});
      let log='';const collect=bytes=>{log=(log+bytes.toString()).slice(-12000);};child.stdout.on('data',collect);child.stderr.on('data',collect);
      child.once('error',reject);child.once('close',code=>code===0?resolve(log):reject(new Error('外部依賴安裝失敗：'+log.slice(-2000))));
    });
    await this.workspace.audit('install-external-dependencies',{rootId:scope.targetProjectId,directory:plan.directory,packages:plan.missing.map(item=>item.name)});
    return {...plan,output};
  }
  async start(scope,owner,jobId,{entry,port,moduleDirectory,verification}){
    const candidates=await this.candidates(scope);
    if(!candidates.some(item=>item.entry===entry))throw new Error('入口不在目前候選清單，請重新提出啟動計畫');
    if(!Number.isInteger(port)||port<1||port>65535)throw new Error('請指定 1–65535 的預期 Port');
    const request=verification?verificationRequest(verification,port):null;
    const {root,full}=await entryFile(scope,entry),deps=await this.dependencies(scope,moduleDirectory);
    if(deps.missing.length)throw new Error('外部依賴尚未安裝：'+deps.missing.map(item=>item.name).join('、'));
    if(await portOpen(port))throw new Error('127.0.0.1:'+port+' 已有服務監聽，請停止既有服務或改埠');
    const env={...process.env,NODE_PATH:deps.directory,PORT:String(port)};
    for(const key of Object.keys(env))if(/^(?:CDA_AI_|OPENAI_API_KEY|ANTHROPIC_API_KEY|AZURE_OPENAI_API_KEY)/i.test(key))delete env[key];
    const child=spawn(process.execPath,[full],{cwd:root.path,shell:false,windowsHide:true,env});live.add(child);
    const item={id:crypto.randomUUID(),owner,projectId:root.id,jobId,entry,port,directory:deps.directory,pid:child.pid,status:'starting',startedAt:new Date().toISOString(),output:'',redactions:request?verificationRedactions(request):[]};
    this.items.set(item.id,{...item,child});
    const append=bytes=>{item.output=(item.output+bytes.toString()).slice(-12000);this.items.get(item.id).output=item.output;};
    child.stdout.on('data',append);child.stderr.on('data',append);
    this.outputListeners.set(item.id,{stdout:child.stdout,stderr:child.stderr,listener:append});
    child.once('error',error=>{item.status='failed';item.output=(item.output+'\n'+error.message).slice(-12000);Object.assign(this.items.get(item.id),item);live.delete(child);});
    child.once('close',(code,signal)=>{const current=this.items.get(item.id);const priorStatus=current.status;current.status=['stopped','failed'].includes(priorStatus)?priorStatus:'exited';current.exitCode=code;current.signal=signal;live.delete(child);if(current.initialMonitor?.status==='monitoring'){this.stopInitialMonitor(item.id,current.status==='stopped'?'stopped':'ended_early');if(current.status==='exited'){const checkedAt=new Date().toISOString(),message=`服務程序提早結束（exit ${code??'未知'}${signal?`, ${signal}`:''}）`;current.initialMonitor.checks.push({checkedAt,processAlive:false,portOpen:false,error:message});current.initialMonitor.errors.push({checkedAt,message});}}else this.stopInitialMonitor(item.id);this.onChange?.(current,{type:current.status==='stopped'?'stopped':'process-ended'});});
    for(let attempt=0;attempt<16;attempt++){
      if(item.status==='failed'||item.status==='exited')break;
      if(await portOpen(port)){item.status='running';Object.assign(this.items.get(item.id),item);break;}
      await pause(500);
    }
    if(item.status!=='running'){if(child.exitCode===null)child.kill();item.status='failed';Object.assign(this.items.get(item.id),item);}
    if(item.status==='running'){
      try{const response=await fetch(`http://127.0.0.1:${port}/`,{signal:AbortSignal.timeout(1500)});item.http={path:'/',status:response.status};}
      catch(error){item.http={path:'/',error:error.message};}
      if(request){item.apiVerification=await runVerification(request);item.apiVerificationHistory=[item.apiVerification];item.verificationSetup={method:request.method,path:request.displayPath,hadQuery:request.hadQuery,expectedStatus:request.expectedStatus,hasTextCondition:!!request.contains,jsonPath:request.jsonPath||''};}
      const current=this.items.get(item.id);current.http=item.http;if(request){current.apiVerification=item.apiVerification;current.apiVerificationHistory=item.apiVerificationHistory;current.verificationSetup=item.verificationSetup;}
      const checkedAt=new Date().toISOString();
      if(current.status==='running'){
        current.initialMonitor={status:'monitoring',startedAt:checkedAt,endsAt:new Date(Date.now()+300000).toISOString(),intervalMs:30000,checks:[{checkedAt,processAlive:true,portOpen:true,httpStatus:item.http?.status??null}],errors:[]};this.scheduleInitialMonitor(item.id);
      }else{
        const message='服務在初始監測開始前已結束';current.initialMonitor={status:'ended_early',startedAt:checkedAt,completedAt:checkedAt,intervalMs:30000,checks:[{checkedAt,processAlive:false,portOpen:false,error:message}],errors:[{checkedAt,message}]};
      }
    }else{
      const checkedAt=new Date().toISOString(),message=`服務未能在預期時間內監聽 127.0.0.1:${port}`;
      this.items.get(item.id).initialMonitor={status:'failed',startedAt:item.startedAt,completedAt:checkedAt,intervalMs:30000,checks:[{checkedAt,processAlive:child.exitCode===null,portOpen:false,error:message}],errors:[{checkedAt,message}]};
    }
    await this.workspace.audit('project-service-start',{rootId:root.id,entry,port,status:item.status,pid:item.pid});
    return this.public(this.items.get(item.id));
  }
  public(item){const {child,owner,redactions,...view}=item;view.output=String(view.output||'');for(const secret of [...(redactions||[])].sort((a,b)=>b.length-a.length))view.output=view.output.replaceAll(secret,'[遮罩]');return view;}
  list(owner,projectId){return [...this.items.values()].filter(item=>item.owner===owner&&item.projectId===projectId).map(item=>this.public(item));}
  projectLocked(projectId){return [...this.items.values()].some(item=>item.projectId===projectId&&['starting','running'].includes(item.status));}
  async verify(owner,projectId,id,verification){
    const item=this.items.get(id);
    if(!item||item.owner!==owner||item.projectId!==projectId)throw new Error('找不到目前專案的服務');
    if(item.status!=='running')throw new Error('服務目前未執行，無法驗證 API');
    const request=verificationRequest(verification,item.port);
    item.redactions.push(...verificationRedactions(request));
    item.apiVerification=await runVerification(request);
    item.apiVerificationHistory=[...(item.apiVerificationHistory||[]),item.apiVerification].slice(-30);
    item.verificationSetup={method:request.method,path:request.displayPath,hadQuery:request.hadQuery,expectedStatus:request.expectedStatus,hasTextCondition:!!request.contains,jsonPath:request.jsonPath||''};
    await this.workspace.audit('project-service-api-verify',{rootId:projectId,serviceId:id,method:request.method,path:request.displayPath,passed:item.apiVerification.passed});
    return this.public(item);
  }
  async stop(owner,projectId,id){
    const item=this.items.get(id);
    if(!item||item.owner!==owner||item.projectId!==projectId)throw new Error('找不到目前專案的服務');
    if(item.status!=='running'&&item.status!=='starting')return this.public(item);
    item.status='stopped';this.stopInitialMonitor(id);item.child.kill();live.delete(item.child);item.stoppedAt=new Date().toISOString();
    for(let attempt=0;attempt<10&&await portOpen(item.port);attempt++)await pause(200);
    await this.workspace.audit('project-service-stop',{rootId:projectId,serviceId:id,port:item.port});
    return this.public(item);
  }
}
module.exports={ProjectServices,expectedPort,portOpen,verificationRequest};

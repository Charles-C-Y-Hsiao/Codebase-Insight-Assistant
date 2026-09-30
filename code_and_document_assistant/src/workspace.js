const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawn} = require('node:child_process');
const parsers = require('./parsers.js');
const {excluded,within}=require('./path-policy.js');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const editable = new Map([
  ['discount.js', ['return amount - rate;', 'return amount * (1 - rate);']],
  ['discount.py', ['return amount - rate', 'return amount * (1 - rate)']],
  ['page.html', ['lang="en"', 'lang="zh-Hant"']]
]);
const codeExtensions=new Set(['.js','.cjs','.mjs','.py','.html','.css','.json']);
class Workspace {
  constructor(base,limits) { this.base=base; this.limits=limits; this.roots=[]; this.files=[]; this.issues=[]; this.updatedAt=null; this.indexing=false; this.proposals=new Map(); this.writing=false; }
  async init(examples, extraExamples=[]) {
    await fs.mkdir(this.base,{recursive:true});
    this.demo=path.join(this.base,'demo');
    await fs.mkdir(this.demo,{recursive:true});
    for (const source of [examples,...extraExamples]) {
      for (const file of await fs.readdir(source)) {
        try { await fs.copyFile(path.join(source,file),path.join(this.demo,file),require('node:fs').constants.COPYFILE_EXCL); }
        catch(e) { if(e.code!=='EEXIST') throw e; }
      }
    }
    this.roots=[{id:'demo',path:await fs.realpath(this.demo),label:'範例工作區',writable:true,permissions:{read:true,write:true,verify:true,ai:false},expiresAt:null,generation:1}];
    await this.update();
  }
  async createDirectory(folder) {
    if(!path.isAbsolute(folder)) throw new Error('請提供主機上的絕對資料夾路徑');
    const requested=path.resolve(folder),parent=path.dirname(requested);
    if(parent===requested) throw new Error('不能建立磁碟根目錄');
    let parentResolved;
    try { parentResolved=await fs.realpath(parent); }
    catch { throw new Error('建立資料夾前，父資料夾必須已存在'); }
    if(!(await fs.stat(parentResolved)).isDirectory()) throw new Error('父路徑不是資料夾');
    const target=path.join(parentResolved,path.basename(requested));
    const stateRel=path.relative(path.join(this.base,'assistant-state'),target);
    if(stateRel===''||(!stateRel.startsWith('..')&&!path.isAbsolute(stateRel)))throw new Error('助手內部狀態不能建立為專案');
    try { await fs.lstat(target);throw new Error('目標資料夾已存在；取消建立選項後可授權既有資料夾'); }
    catch(e) { if(e.code!=='ENOENT') throw e; }
    try { await fs.mkdir(target); }
    catch(e) { if(e.code==='EEXIST')throw new Error('目標資料夾已存在；取消建立選項後可授權既有資料夾');throw e; }
    return await fs.realpath(target);
  }
  async authorize(folder,options={}) {
    if(!path.isAbsolute(folder)) throw new Error('請提供主機上的絕對資料夾路徑');
    const resolved=await fs.realpath(folder);
    const stateRel=path.relative(path.join(this.base,'assistant-state'),resolved);
    if(stateRel===''||(!stateRel.startsWith('..')&&!path.isAbsolute(stateRel)))throw new Error('助手內部狀態不能登錄為專案');
    if(!(await fs.stat(resolved)).isDirectory()) throw new Error('不是資料夾');
    const kind=options.kind||'project';
    if(!['project','global-reference'].includes(kind))throw new Error('授權類型不合法');
    if(kind==='global-reference'&&(options.write||options.verify))throw new Error('全域參考只允許唯讀');
    if(excluded({path:resolved},resolved,this))throw new Error('此位置屬於排除範圍');
    const permissions={read:true,write:kind==='project'&&options.write===true,verify:kind==='project'&&options.verify===true,ai:options.ai===true};
    const minutes=options.minutes===undefined?60:options.minutes;
    if(!Number.isInteger(minutes)||minutes<1||minutes>1440)throw new Error('授權有效期必須是 1–1440 分鐘');
    const canonical=value=>process.platform==='win32'?value.toLowerCase():value;
    let root=this.roots.find(r=>canonical(r.path)===canonical(resolved));
    if(root?.id==='demo')throw new Error('demo 權限由系統固定管理');
    if(root&&(root.kind||'project')!==kind)throw new Error('相同路徑已登錄為另一種授權類型');
    if(!root){root={id:'project-'+hash(process.platform==='win32'?resolved.toLowerCase():resolved).slice(0,24),path:resolved,label:path.basename(resolved),generation:0};this.roots.push(root);}
    Object.assign(root,{kind,path:resolved,permissions,writable:permissions.write,expiresAt:Date.now()+minutes*60000,generation:root.generation+1});
    await this.audit('grant',{rootId:root.id,path:resolved,permissions,expiresAt:root.expiresAt});
    await this.update([root.id]);
    return root;
  }
  active(root){return root&&(!root.expiresAt||root.expiresAt>Date.now())&&root.permissions.read;}
  async audit(action,data){await fs.appendFile(path.join(this.base,'audit.jsonl'),JSON.stringify({time:new Date().toISOString(),action,...data})+'\n');}
  async revoke(id){const root=this.roots.find(r=>r.id===id);if(!root||id==='demo')throw new Error('無法撤銷此範圍');root.expiresAt=1;root.generation++;this.files=this.files.filter(f=>f.rootId!==id);await this.audit('revoke',{rootId:id});}
  async safePath(file) {
    const root=this.roots.find(r=>r.id===file.rootId);
    if(!this.active(root)) throw new Error('檔案未授權或授權已過期');
    const resolved=await fs.realpath(file.path);
    const rel=path.relative(root.path,resolved);
    if(rel.startsWith('..')||path.isAbsolute(rel)) throw new Error('檔案超出授權範圍');
    if(excluded(root,file.path,this)||excluded(root,resolved,this))throw new Error('檔案屬於排除範圍');
    let current=file.path;
    while(within(root.path,current)){if((await fs.lstat(current)).isSymbolicLink())throw new Error('不支援符號連結');if(current===root.path)break;current=path.dirname(current);}
    if((await fs.lstat(file.path)).isSymbolicLink()) throw new Error('不支援符號連結');
    return resolved;
  }
  async update(rootIds=null) {
    if(this.indexing) throw new Error('索引更新中，請稍後');
    this.indexing=true;
    const files=[],issues=[]; let bytes=0, visited=0; const deadline=Date.now()+(this.limits.indexTimeoutMs||30000);
    const walk=async(root,folder,depth=0)=>{
      if(depth>12) {issues.push({path:folder,reason:'超過目錄深度上限'});return;}
      let entries;
      try { entries=await fs.readdir(folder,{withFileTypes:true}); } catch(e) {issues.push({path:folder,reason:e.code});return;}
      for(const ent of entries) {
        if(Date.now()>=deadline){issues.push({path:folder,reason:'達到索引時間上限，部分文件未處理'});return;}
        const full=path.join(folder,ent.name);
        if(excluded(root,full,this)){issues.push({path:full,reason:'排除助手、依賴、版本、備份、執行狀態或機密資料'});continue;}
        if(++visited>2000) {issues.push({path:folder,reason:'超過掃描項目上限 2000'});return;}
        if(ent.isSymbolicLink()) {issues.push({path:full,reason:'不索引連結'});continue;}
        if(ent.isDirectory()) {
          if(['node_modules','.git','.env','runtime','.venv','assistant-state'].includes(ent.name)) {issues.push({path:full,reason:'排除依賴、版本控制或執行資料目錄'});continue;}
          await walk(root,full,depth+1);continue;
        }
        if(!ent.isFile()) continue;
        if(/(^\.env|secret|credential|\.pem$|\.key$)/i.test(ent.name)) {issues.push({path:full,reason:'疑似機密設定，排除索引'});continue;}
        const ext=path.extname(ent.name).toLowerCase();
        if(!parsers.supported.includes(ext)) {
          issues.push({path:full,reason:['.doc','.ppt','.xls'].includes(ext)?'需要先轉為 DOCX / PPTX / XLSX':'尚未提供此格式解析器'});continue;
        }
        try {
          const stat=await fs.stat(full);
          if(stat.size>this.limits.maxFileBytes||files.length>=this.limits.maxFiles||bytes+stat.size>this.limits.maxIndexBytes) {issues.push({path:full,reason:'超過檔案大小、數量或總索引上限'});continue;}
          const probe={rootId:root.id,path:full}; await this.safePath(probe);
          const buffer=await fs.readFile(full,{signal:AbortSignal.timeout(Math.max(1,Math.min(5000,deadline-Date.now())))});const version=hash(buffer);
          const cached=this.files.find(f=>f.path===full&&f.hash===version&&f.rootId===root.id);
          const emptyInitial=buffer.length===0&&codeExtensions.has(ext);
          const parsed=cached?{segments:cached.segments,warnings:cached.warnings}:emptyInitial?{segments:[],warnings:[]}:await parsers.parse(buffer,ext,{timeoutMs:Math.max(1,Math.min(10000,deadline-Date.now()))});
          const content=['.pdf','.docx','.pptx','.xlsx'].includes(ext)?parsed.segments.map(s=>s.text).join('\n'):buffer.toString('utf8');
          const parsedBytes=Buffer.byteLength(content)+Buffer.byteLength(JSON.stringify(parsed));
          if(bytes+parsedBytes>this.limits.maxIndexBytes){issues.push({path:full,reason:'解析文字超過總索引上限'});continue;}
          bytes+=parsedBytes;
          for(const warning of parsed.warnings)issues.push({path:full,reason:warning,severity:'warning'});
          files.push({id:hash(root.id+full).slice(0,20),rootId:root.id,path:full,name:path.relative(root.path,full),mtime:stat.mtime.toISOString(),hash:version,content,segments:parsed.segments,warnings:parsed.warnings,emptyInitial,writable:root.writable,mode:root.id==='demo'?'mock':'real'});
        } catch(e) {issues.push({path:full,reason:e.code||e.message});}
      }
    };
    try {
      for(const root of [...this.roots].sort((a,b)=>Number(a.kind==='global-reference')-Number(b.kind==='global-reference'))) if(this.active(root)&&(!rootIds||rootIds.includes(root.id))) {
        const start=issues.length;await walk(root,root.path);for(let i=start;i<issues.length;i++)issues[i].rootId=root.id;
      }
      this.files=[...(rootIds?this.files.filter(f=>!rootIds.includes(f.rootId)):[]),...files];
      this.issues=[...(rootIds?this.issues.filter(i=>!rootIds.includes(i.rootId)):[]),...issues];this.updatedAt=new Date().toISOString();
    }
    finally {this.indexing=false;}
    return this.inventory();
  }
  inventory() {return {files:this.files.filter(f=>this.active(this.roots.find(r=>r.id===f.rootId))).map(({content,segments,...f})=>f),roots:this.roots.map(r=>({...r,active:this.active(r)})),issues:this.issues,updatedAt:this.updatedAt};}
  async read(id) {
    const file=this.files.find(f=>f.id===id); if(!file) throw new Error('找不到已索引檔案');
    const full=await this.safePath(file); const stat=await fs.stat(full);
    if(stat.size>this.limits.maxFileBytes) throw new Error('檔案過大');
    const buffer=await fs.readFile(full);
    if(hash(buffer)!==file.hash) throw new Error('檔案已變更，請更新索引');
    return {...file};
  }
  async search(question,ids=[]) {
    const ranked=require('./search.js').rank(question,this.files.filter(f=>this.active(this.roots.find(r=>r.id===f.rootId))&&!f.emptyInitial),ids);
    const results=[];
    const checked=new Set();
    for(const {f,segment,index} of ranked) {if(!checked.has(f.id)){await this.read(f.id);checked.add(f.id);}results.push({id:'DOC-'+(results.length+1),kind:'document',fileId:f.id,segmentIndex:index,path:f.path,location:segment.location,locator:segment.locator,mtime:f.mtime,version:f.hash,excerpt:segment.text, mock:f.rootId==='demo',mode:f.mode});}
    return results;
  }
  async proposal(ids) {
    if(ids.length!==1) throw new Error('修改展示請用 @file 選取一個範例程式檔');
    const file=await this.read(ids[0]);
    const replacement=editable.get(file.name);
    if(file.rootId!=='demo'||!file.writable||!replacement) throw new Error('Mock 模型只提供 demo 固定修改；一般程式請使用人工修改提案，或補充公司 AI 設定');
    if(!file.content.includes(replacement[0])) throw new Error('範例已修正或內容不同，無法套用固定 Mock 修改');
    return this.createProposal(file.id,file.content.replace(replacement[0],replacement[1]),'mock');
  }
  async createProposal(fileId,after,source='manual') {
    const file=await this.read(fileId);const root=this.roots.find(r=>r.id===file.rootId);
    if(!root.permissions.write)throw new Error('此資料夾沒有修改授權');
    if(!codeExtensions.has(path.extname(file.path).toLowerCase()))throw new Error('只支援程式文字檔修改');
    if(typeof after!=='string'||after.includes('\0')||Buffer.byteLength(after)>262144)throw new Error('新內容不合法或超過 256 KiB');
    if(file.content===after)throw new Error('沒有內容差異');
    for(const [id,p] of this.proposals)if(p.expiresAt<Date.now())this.proposals.delete(id);
    if(this.proposals.size>=100)throw new Error('待確認修改達上限');
    const p={id:crypto.randomUUID(),fileId,path:file.path,version:file.hash,before:file.content,after,mock:source==='mock',source,rootId:root.id,grantVersion:root.generation,expiresAt:Date.now()+15*60000};
    this.proposals.set(p.id,structuredClone(p));return p;
  }
  async nextVersionId() {
    const now=new Date(), pad=n=>String(n).padStart(2,'0');
    const stamp=`${pad(now.getMonth()+1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}`;
    const dir=path.join(this.base,'backups');let max=0;
    try { for(const name of await fs.readdir(dir)){const m=name.match(new RegExp(`-${stamp}_(\\d+)(?:\\.[^.]+)?$`));if(m)max=Math.max(max,Number(m[1]));} }
    catch(e){if(e.code!=='ENOENT')throw e;}
    return `${stamp}_${String(max+1).padStart(2,'0')}`;
  }
  async apply(proposal) {
    if(this.writing)throw new Error('另一項修改正在執行');this.writing=true;
    try {
    const saved=this.proposals.get(proposal.id);
    if(!saved||saved.expiresAt<Date.now()||JSON.stringify(saved)!==JSON.stringify(proposal))throw new Error('修改提案無效、已使用、被更動或已過期');
    const file=await this.read(proposal.fileId);
    const root=this.roots.find(r=>r.id===file.rootId);
    if(root.generation!==saved.grantVersion||!root.permissions.write)throw new Error('修改授權已變更，請重新規劃');
    if(!file.writable||file.hash!==proposal.version) throw new Error('檔案已變更或沒有寫入權限，請重新規劃');
    const full=await this.safePath(file);
    await fs.mkdir(path.join(this.base,'backups'),{recursive:true});
    const versionId=await this.nextVersionId();
    const safeName=path.basename(file.path).replace(/[^a-zA-Z0-9._-]+/g,'_');
    const backup=path.join(this.base,'backups',`${safeName}-${versionId}.txt`);
    await fs.writeFile(backup,file.content,{flag:'wx'});
    const temp=path.join(path.dirname(full),'.cda-'+crypto.randomUUID()+'.tmp');
    try {
      await fs.writeFile(temp,proposal.after,{encoding:'utf8',flag:'wx',mode:(await fs.stat(full)).mode});
      await this.read(file.id); // 寫入前再次確認版本與授權。
      await fs.rename(temp,full);
    } finally {await fs.unlink(temp).catch(()=>{});}
    this.proposals.delete(proposal.id);
    const verification=root.permissions.verify?await this.verify(full,proposal.after):{status:'not_run',kind:'靜態檢查',message:'尚未授權驗證'};
    await this.audit('apply',{versionId,fileId:file.id,rootId:root.id,path:file.path,beforeHash:file.hash,afterHash:hash(proposal.after),backup,verification:verification.status});
    await this.update([root.id]);
    return {backup,versionId,verification,message:`已套用修改（${versionId}），原始內容已備份；未宣稱通過功能測試`};
    } finally {this.writing=false;}
  }
  async listVersions() {
    const auditPath=path.join(this.base,'audit.jsonl'),records=[];
    try { for(const line of (await fs.readFile(auditPath,'utf8')).split(/\r?\n/)){if(!line.trim())continue;let item;try{item=JSON.parse(line);}catch{continue;}if(item.action==='apply'&&item.versionId)records.push({id:item.versionId,versionId:item.versionId,time:item.time,path:item.path||null,backup:item.backup,backupExists:false});} }
    catch(e){if(e.code!=='ENOENT')throw e;}
    const seen=new Set();for(const item of records){seen.add(item.backup);try{await fs.access(item.backup);item.backupExists=true;}catch{}}
    const dir=path.join(this.base,'backups');try { for(const name of await fs.readdir(dir)){const full=path.join(dir,name);if(seen.has(full))continue;const m=name.match(/-(\d{8}_\d{2})\.txt$/);if(m)records.push({id:'orphan-'+m[1]+'-'+name,versionId:m[1],time:null,path:null,backup:full,backupExists:true,orphan:true});} } catch(e){if(e.code!=='ENOENT')throw e;}
    return records.sort((a,b)=>(b.time||'').localeCompare(a.time||''));
  }
  async removeVersions(ids) {
    const wanted=new Set(Array.isArray(ids)?ids.filter(x=>typeof x==='string'):[]);if(!wanted.size)throw new Error('請至少選取一個版本');
    const auditPath=path.join(this.base,'audit.jsonl'),kept=[],removed=[];
    try { for(const line of (await fs.readFile(auditPath,'utf8')).split(/\r?\n/)){if(!line.trim())continue;let item;try{item=JSON.parse(line);}catch{kept.push(line);continue;}if(item.action==='apply'&&wanted.has(item.versionId)){if(item.backup&&path.dirname(path.resolve(item.backup))===path.resolve(path.join(this.base,'backups')))await fs.unlink(item.backup).catch(()=>{});removed.push(item.versionId);continue;}kept.push(line);}await fs.writeFile(auditPath,kept.join('\n')+'\n',{encoding:'utf8'}); }
    catch(e){if(e.code!=='ENOENT')throw e;}
    const files=await fs.readdir(path.join(this.base,'backups')).catch(()=>[]);for(const id of wanted)for(const name of files)if(name.endsWith(`-${id}.txt`)){await fs.unlink(path.join(this.base,'backups',name)).catch(()=>{});removed.push(id);}
    return {removed:[...new Set(removed)],message:`已清除 ${new Set(removed).size} 個版本記錄與備份檔`};
  }
  async verify(full,content) {
    if(/\.(js|cjs|mjs)$/.test(full)) return new Promise(resolve=>{
      const child=spawn(process.execPath,['--check','--input-type='+ (full.endsWith('.mjs')?'module':'commonjs')],{shell:false,windowsHide:true,timeout:3000,env:{SystemRoot:process.env.SystemRoot||'',PATH:path.dirname(process.execPath)}});
      let output=''; child.stderr.on('data',d=>{output=(output+d).slice(0,2000);});
      child.stdin.on('error',()=>{});child.stdin.end(content);
      child.on('error',()=>resolve({status:'failed',kind:'語法檢查',message:'無法啟動 Node 驗證器'}));
      child.on('close',code=>resolve({status:code===0?'passed':'failed',kind:'Node.js 語法檢查',profile:'node-syntax',command:[process.execPath,'--check','--input-type='+(full.endsWith('.mjs')?'module':'commonjs')],input:'stdin',output,exitCode:code,message:code===0?'node --check 通過；未執行使用者程式或功能測試':output}));
    });
    if(full.endsWith('.py')) {try {const result=await parsers.worker('verify-python',Buffer.from(content),{timeoutMs:3000});return {...result,kind:'Python 靜態語法',profile:'python-compile',exitCode:0};}catch(e){return {status:parsers.pythonPath()?'failed':'not_run',kind:'Python 靜態語法',profile:'python-compile',message:e.message};}}
    if(full.endsWith('.json')) {try{JSON.parse(content);return {status:'passed',profile:'json-parse',message:'JSON 語法有效'};}catch{return {status:'failed',profile:'json-parse',message:'JSON 語法錯誤'};}}
    if(full.endsWith('.css'))return {status:'not_run',profile:'css',message:'尚無已核准 CSS 驗證器'};
    if(full.endsWith('.html')){try{return {...await parsers.worker('verify-html',Buffer.from(content),{timeoutMs:3000}),kind:'HTML 基本結構',profile:'html-static'};}catch(e){return {status:'not_run',kind:'HTML 基本結構',message:e.message};}}
    return {status:'not_run',message:'未提供此格式驗證 profile'};
  }
}
module.exports={Workspace,hash};

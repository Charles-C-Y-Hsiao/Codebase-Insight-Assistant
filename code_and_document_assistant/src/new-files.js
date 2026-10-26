const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {within,excluded}=require('./path-policy.js');
const extensions=new Set(['.html','.css','.js','.mjs','.cjs','.json','.py','.md']);
async function destination(scope,relativePath){
  const root=scope.root(scope.targetProjectId),ws=scope.workspace;
  if(!root.permissions.write||!root.permissions.ai)throw new Error('新增檔案需要目前專案的修改與 AI 外送授權');
  if(typeof relativePath!=='string'||relativePath.length>240||/[\x00-\x1f<>:"|?*]/.test(relativePath)||path.isAbsolute(relativePath)||path.win32.isAbsolute(relativePath))throw new Error('新檔路徑必須是專案內的相對路徑');
  const parts=relativePath.split(/[\\/]/);
  if(parts.some(p=>!p||p==='.'||p==='..'||/[. ]$/.test(p)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)))throw new Error('新檔路徑包含不允許的名稱');
  const full=path.resolve(root.path,...parts);
  if(!within(root.path,full)||excluded(root,full,ws)||!extensions.has(path.extname(full).toLowerCase()))throw new Error('新檔路徑或程式格式不在允許範圍');
  const parent=path.dirname(full),missingDirectories=[];
  let current=root.path,missing=false;
  for(const part of parts.slice(0,-1)){
    current=path.join(current,part);
    if(missing){missingDirectories.push(current);continue;}
    try{
      const stat=await fs.lstat(current);
      if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('父資料夾不能是檔案或連結');
      await ws.safePath({rootId:root.id,path:current});
    }catch(error){
      if(error.code!=='ENOENT')throw error;
      if(path.extname(full).toLowerCase()!=='.md')throw new Error('父資料夾必須已存在且不能是連結；不會自動建立資料夾');
      missing=true;missingDirectories.push(current);
    }
  }
  if(missingDirectories.length>12)throw new Error('新增資料夾層數超過上限');
  try{await fs.lstat(full);throw new Error('檔案已存在，請使用修改檔案流程');}catch(e){if(e.code!=='ENOENT')throw e;}
  return {root,full,relativePath:parts.join('/'),missingDirectories};
}
async function propose(scope,files){
  if(!Array.isArray(files)||!files.length||files.length>20)throw new Error('每次最多提出 20 份新檔案');
  const ws=scope.workspace,seen=new Set(),items=[];let total=0;
  for(const file of files){
    if(typeof file.content!=='string'||file.content.includes('\0')||Buffer.byteLength(file.content)>32768||typeof file.purpose!=='string'||file.purpose.length>1000)throw new Error('新檔內容或用途格式不合法（每檔最多 32 KiB）');
    total+=Buffer.byteLength(file.content);if(total>256*1024)throw new Error('新檔提案總內容超過 256 KiB');
    const {root,full,relativePath}=await destination(scope,file.path),key=full.toLowerCase();
    if(seen.has(key))throw new Error('新檔提案中有重複路徑');seen.add(key);
    items.push({id:crypto.randomUUID(),kind:'create',rootId:root.id,grantVersion:root.generation,path:full,relativePath,purpose:file.purpose,content:file.content,expiresAt:Date.now()+60*60000,status:'pending'});
  }
  for(const [id,p] of ws.proposals)if(p.expiresAt<Date.now())ws.proposals.delete(id);
  if(ws.proposals.size+items.length>100)throw new Error('待確認提案已達上限');
  for(const item of items)ws.proposals.set(item.id,structuredClone(item));
  return items;
}
async function apply(scope,item){
  const ws=scope.workspace;if(ws.writing)throw new Error('另一項修改正在執行');ws.writing=true;
  try{
    const saved=ws.proposals.get(item.id);
    if(!saved||saved.kind!=='create'||saved.expiresAt<Date.now()||JSON.stringify(saved)!==JSON.stringify(item))throw new Error('新增提案已失效或內容已變更，請重新提出');
    const {root,full,missingDirectories}=await destination(scope,item.relativePath);
    scope.root(root.id);
    if(root.id!==item.rootId||root.generation!==item.grantVersion||full!==item.path)throw new Error('授權已變更，請重新提出新增提案');
    // Create only the confirmed Markdown file's missing parents. Every step is
    // rechecked against the authorized root before the next step is created.
    for(const directory of missingDirectories){
      try{await fs.mkdir(directory);}catch(error){if(error.code!=='EEXIST')throw error;}
      const stat=await fs.lstat(directory);
      if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('父資料夾已被替換');
      await ws.safePath({rootId:root.id,path:directory});
    }
    // Exclusive creation also rejects a file introduced after the path check.
    const handle=await fs.open(full,'wx');
    try{await handle.writeFile(item.content,'utf8');}catch(e){item.status='created';item.error='檔案已建立但內容寫入失敗，請檢查檔案';throw e;}finally{await handle.close();}
    ws.proposals.delete(item.id);item.status='created';
    let verification;
    try{verification=root.permissions.verify?await ws.verify(full,item.content):{status:'not_run',message:'尚未授權靜態驗證'};}catch(e){verification={status:'failed',message:e.message};}
    const warnings=[];
    try{await ws.audit('create-file',{rootId:root.id,path:full,verification:verification.status});}catch{warnings.push('稽核紀錄保存失敗');}
    try{await ws.update([root.id]);}catch{warnings.push('索引更新失敗，請手動更新');}
    return {path:full,verification,warnings,message:'已建立檔案；驗證失敗也會保留內容'};
  }finally{ws.writing=false;}
}
module.exports={propose,apply,destination};

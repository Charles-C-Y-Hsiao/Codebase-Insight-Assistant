const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {hash} = require('./workspace.js');

// Only this reviewed template can be created or executed in the preview.
class Projects {
  constructor(workspace) { this.workspace=workspace; this.proposals=new Map(); }
  async root(id, generation) {
    const root=this.workspace.roots.find(r=>r.id===id);
    if(!this.workspace.active(root)||!root.permissions.write)throw new Error('需要有效的父資料夾修改授權');
    if(generation!==undefined&&root.generation!==generation)throw new Error('授權已變更，請重新提出專案');
    if(await fs.realpath(root.path)!==root.path||(await fs.lstat(root.path)).isSymbolicLink())throw new Error('父資料夾路徑已變更或為連結');
    return root;
  }
  get(id,owner) {
    const p=this.proposals.get(id);
    if(!p||p.owner!==owner)throw new Error('找不到此工作階段的專案提案');
    return p;
  }
  view(p) { const {owner,...result}=p; return structuredClone(result); }
  async propose({rootId,name,template},owner) {
    if(template!=='select2-products')throw new Error('僅支援 Select2 產品選單固定 Mock 範本');
    if(typeof name!=='string'||!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(name)||/^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(name))throw new Error('專案名稱需英文字母開頭，限英數、底線、連字號，最多 64 字；不得使用系統保留名稱');
    const root=await this.root(rootId);
    const folder=path.join(root.path,name);
    try {await fs.lstat(folder);throw new Error('目標資料夾已存在，請換名稱；不覆蓋現有專案');}catch(e){if(e.code!=='ENOENT')throw e;}
    for(const [id,p] of this.proposals)if(p.expiresAt<Date.now()&&p.status!=='applying')this.proposals.delete(id);
    if(this.proposals.size>=100)throw new Error('專案提案達到上限');
    const after=await fs.readFile(path.join(__dirname,'../templates/select2/index.html'),'utf8');
    const stat=await fs.stat(root.path);
    const p={id:crypto.randomUUID(),owner,rootId,grantVersion:root.generation,parentIdentity:`${stat.dev}:${stat.ino}`,name,path:folder,template,mode:'mock',status:'awaiting_approval',expiresAt:Date.now()+900000,
      plan:['使用已授權父資料夾','產生固定 Select2 產品多選範本','預覽新增檔案，主機確認後建立','更新索引與執行已授權靜態檢查','開啟隔離的固定範本預覽，確認 CDN 與操作'],
      files:[{name:'index.html',before:null,after,hash:hash(after)}]};
    this.proposals.set(p.id,p);return this.view(p);
  }
  cancel(id,owner) {const p=this.get(id,owner);if(p.status!=='awaiting_approval')throw new Error('此狀態無法取消');p.status='cancelled';return this.view(p);}
  async apply(id,owner) {
    const p=this.get(id,owner),ws=this.workspace;
    if(p.status!=='awaiting_approval'||p.expiresAt<Date.now())throw new Error('提案已取消、已使用或已過期');
    if(ws.writing)throw new Error('另一項寫入正在執行');
    ws.writing=true;
    let created=false;
    try {
      const root=await this.root(p.rootId,p.grantVersion),stat=await fs.stat(root.path);
      if(`${stat.dev}:${stat.ino}`!==p.parentIdentity)throw new Error('父資料夾已被替換');
      p.status='applying';
      await fs.mkdir(p.path);created=true;
      for(const file of p.files) {
        await this.root(p.rootId,p.grantVersion);
        if(await fs.realpath(p.path)!==p.path||(await fs.lstat(p.path)).isSymbolicLink())throw new Error('新專案路徑被替換');
        await fs.writeFile(path.join(p.path,file.name),file.after,{encoding:'utf8',flag:'wx'});
      }
      const archive=path.join(ws.base,'backups',p.id+'-project.json');
      await fs.mkdir(path.dirname(archive),{recursive:true});
      await fs.writeFile(archive,JSON.stringify({path:p.path,mode:'mock',files:p.files},null,2),{flag:'wx'});
      const verification=root.permissions.verify?await ws.verify(path.join(p.path,'index.html'),p.files[0].after):{status:'not_run',message:'未授權靜態驗證'};
      await ws.update([root.id]);
      const indexed=ws.files.filter(f=>path.dirname(f.path)===p.path).map(f=>({id:f.id,name:f.name,version:f.hash}));
      p.status='completed';p.result={archive,verification,indexed,previewUrl:'/project-preview/'+p.id,message:'已建立真實檔案；內容由固定 Mock 範本提供。封存為新增內容快照，沒有被覆蓋的原檔。預覽需網路載入 CDN，瀏覽器功能需另外核對。'};
      await ws.audit('project-create',{proposalId:p.id,path:p.path,mode:'mock',files:p.files.map(f=>({name:f.name,hash:f.hash})),verification:verification.status});
      return this.view(p);
    } catch(e) {p.status=created?'partial':'failed';p.error=created?'部分檔案可能已建立，已保留供人工確認：'+e.message:e.message;throw new Error(p.error);}
    finally {ws.writing=false;}
  }
  async preview(id,owner) {
    const p=this.get(id,owner);
    if(p.status!=='completed')throw new Error('專案尚未建立完成');
    await this.root(p.rootId,p.grantVersion);
    for(const file of p.files) {
      const full=await this.workspace.safePath({rootId:p.rootId,path:path.join(p.path,file.name)});
      if((await fs.stat(full)).size>262144||hash(await fs.readFile(full))!==file.hash)throw new Error('檔案已修改；固定範本預覽已停用，請使用核准方式驗證修改後程式');
    }
    return p.files[0].after;
  }
}
module.exports={Projects};

const path = require('node:path');
// Task-local capability boundary. Root grants remain the underlying authority.
class ProjectScope {
  constructor(workspace, targetProjectId, referenceProjectIds = []) {
    if (typeof targetProjectId !== 'string' || !Array.isArray(referenceProjectIds) || referenceProjectIds.length>20 || referenceProjectIds.some(id => typeof id !== 'string')) throw new Error('專案範圍格式錯誤（最多 20 個參考專案）');
    this.workspace = workspace;
    this.targetProjectId = targetProjectId;
    if(workspace.roots.find(r=>r.id===targetProjectId)?.kind==='global-reference')throw new Error('全域參考不能作為修改目標');
    this.referenceProjectIds = Object.freeze([...new Set([...referenceProjectIds,...workspace.roots.filter(r=>r.kind==='global-reference'&&workspace.active(r)).map(r=>r.id)].filter(id => id !== targetProjectId))]);
    for (const id of [targetProjectId, ...this.referenceProjectIds]) this.root(id);
    Object.freeze(this);
  }
  root(id) {
    const root = this.workspace.roots.find(r => r.id === id);
    if (!this.workspace.active(root)) throw new Error('專案不存在或授權已失效');
    const within = (a,b) => { const rel = path.relative(a,b); return rel === '' || (!rel.startsWith('..'+path.sep) && rel !== '..' && !path.isAbsolute(rel)); };
    if (this.workspace.roots.some(other => other.id !== id && this.workspace.active(other) && root.kind!=='global-reference'&&other.kind!=='global-reference' && (within(root.path,other.path) || within(other.path,root.path)))) throw new Error('專案根目錄重疊，請先調整授權範圍');
    return root;
  }
  check(file, write = false) {
    if (!file || (file.rootId !== this.targetProjectId && !this.referenceProjectIds.includes(file.rootId))) throw new Error('檔案不在本任務專案範圍');
    const root = this.root(file.rootId);
    if (write && (file.rootId !== this.targetProjectId || !root.permissions.write)) throw new Error('只能修改本任務目標專案，參考專案唯讀');
    return file;
  }
  get files() {
    const result=new Map();
    for(const id of [this.targetProjectId,...this.referenceProjectIds]){
      if(!this.workspace.active(this.workspace.roots.find(r=>r.id===id)))continue;
      for(const f of this.workspace.files.filter(f=>f.rootId===id)){
        const key=process.platform==='win32'?f.path.toLowerCase():f.path;
        if(!result.has(key))result.set(key,{...f,projectId:f.rootId,writable:f.rootId===this.targetProjectId&&this.root(f.rootId).permissions.write});
      }
    }
    return [...result.values()];
  }
  async read(id) {
    this.check(this.workspace.files.find(f => f.id === id));
    const file = await this.workspace.read(id);
    this.check(file);
    return {...file, projectId:file.rootId, writable:file.rootId === this.targetProjectId && this.root(file.rootId).permissions.write};
  }
  async search(question, ids = []) {
    for (const id of ids) this.check(this.workspace.files.find(f => f.id === id));
    const files = this.files;
    // Empty allowed inventory must not become the unscoped search's "all files".
    if (!files.length) return [];
    const result = await this.workspace.search(question, ids.length ? ids : files.map(f => f.id));
    return result.map(e => {
      const file = this.check(this.workspace.files.find(f => f.id === e.fileId));
      return {...e, projectId:file.rootId};
    });
  }
  async createProposal(fileId, after, source = 'manual') {
    this.check(this.workspace.files.find(f => f.id === fileId), true);
    return this.workspace.createProposal(fileId, after, source);
  }
  async proposal(ids) {
    for(const id of ids)this.check(this.workspace.files.find(f=>f.id===id),true);
    return this.workspace.proposal(ids);
  }
  async apply(proposal) {
    this.check(this.workspace.files.find(f => f.id === proposal.fileId), true);
    if (proposal.rootId !== this.targetProjectId) throw new Error('修改提案的專案不符');
    return this.workspace.apply(proposal);
  }
}
module.exports = {ProjectScope};

const path=require('node:path');
const within=(parent,child)=>{const rel=path.relative(parent,child);return rel===''||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel));};
const excludedNames=new Set(['node_modules','.git','.venv','runtime','backups','backup','assistant-state','code_and_document_assistant','.codex','.agents','.cda']);
function excluded(root,full,workspace){
  if(full.split(path.sep).some(name=>name.toLowerCase()==='.cda'))return true;
  if(root.id==='demo')return false;
  if(within(path.resolve(__dirname,'..'),full)||within(path.resolve(workspace.base),full))return true;
  return full.split(path.sep).some(name=>excludedNames.has(name.toLowerCase())||/(^\.env|secret|credential|\.pem$|\.key$|^\.npmrc$|^\.cda-)/i.test(name));
}
module.exports={within,excluded};

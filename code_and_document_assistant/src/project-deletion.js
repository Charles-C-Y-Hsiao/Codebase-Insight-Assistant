const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');

const canonical=value=>process.platform==='win32'?path.resolve(value).toLowerCase():path.resolve(value);

async function configuredProjectRemoval(file,projectPath){
  if(!file)return null;
  const full=path.resolve(file),stat=await fs.lstat(full);
  if(!stat.isFile()||stat.isSymbolicLink()||canonical(await fs.realpath(full))!==canonical(full))throw new Error('專案設定檔不是安全的一般檔案，請先手動移除設定');
  const original=await fs.readFile(full,'utf8'),value=JSON.parse(original);
  if(!Array.isArray(value.projects))throw new Error('專案設定檔缺少 projects 陣列');
  const matching=value.projects.filter(item=>typeof item?.path==='string'&&canonical(item.path)===canonical(projectPath));
  if(!matching.length)return null;
  const {W_OK}=require('node:fs').constants;await fs.access(full,W_OK);await fs.access(path.dirname(full),W_OK);
  const updated={...value,projects:value.projects.filter(item=>!matching.includes(item))};
  return {file:full,original,updated:JSON.stringify(updated,null,2)+'\n',removed:matching.length};
}

async function writeConfiguredProjectRemoval(plan,content=plan?.updated){
  if(!plan)return;
  const stat=await fs.lstat(plan.file);
  if(!stat.isFile()||stat.isSymbolicLink())throw new Error('專案設定檔已被替換，停止刪除');
  const current=await fs.readFile(plan.file,'utf8');
  const expected=content===plan.updated?plan.original:plan.updated;
  if(current!==expected)throw new Error('專案設定檔已變更，停止刪除以免覆蓋其他修改');
  const temp=plan.file+'.'+crypto.randomUUID()+'.tmp';
  try{await fs.writeFile(temp,content,{flag:'wx',mode:stat.mode});await fs.rename(temp,plan.file);}
  finally{await fs.unlink(temp).catch(()=>{});}
}

async function archiveImageProjectJob(job,creations,imageProjects){
  const image=job.imageCreation,seriesId=image?.seriesId;
  if(!image||!image.imageProject?.id||!/^[0-9a-f-]{36}$/i.test(seriesId||''))throw new Error('圖片創作任務缺少可安全封存的系列 ID');
  const copy={...job,imageCreation:{...image,projectStorage:{kind:'project',relativeDirectory:path.join('.cda','image-generations',job.owner,job.conversationId,seriesId)},taskRecordFileName:job.id+'.task.json'}};
  const directory=await creations.directoryFor(copy,{create:true});
  if(image.fileName){
    let bytes;
    try{bytes=await creations.readImage(job);}
    catch(error){
      if(error.code!=='ENOENT'||!image.outputFileName)throw error;
      const source=imageProjects.find(image.imageProject.id),directoryStat=await fs.lstat(source.directory);
      if(!directoryStat.isDirectory()||directoryStat.isSymbolicLink()||canonical(await fs.realpath(source.directory))!==canonical(source.directory))throw new Error('圖片創作專案目錄不安全');
      const file=path.resolve(source.directory,image.outputFileName);
      if(path.dirname(file).toLowerCase()!==source.directory.toLowerCase())throw new Error('圖片創作專案輸出路徑不安全');
      const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink())throw new Error('圖片創作專案輸出檔案不安全');
      bytes=await fs.readFile(file);
    }
    const destination=path.join(directory,image.fileName);
    try{await fs.writeFile(destination,bytes,{flag:'wx',mode:0o600});}
    catch(error){if(error.code!=='EEXIST')throw error;const stat=await fs.lstat(destination);if(!stat.isFile()||stat.isSymbolicLink())throw new Error('專案內既有圖片路徑不安全');const existing=await fs.readFile(destination);if(!existing.equals(bytes))throw new Error('專案內已存在不同內容的圖片，停止刪除');}
    const metadata=path.join(directory,image.fileName.replace(/\.png$/i,'.json')),content=JSON.stringify(copy.imageCreation,null,2);
    try{await fs.writeFile(metadata,content,{flag:'wx',mode:0o600});}
    catch(error){if(error.code!=='EEXIST')throw error;const stat=await fs.lstat(metadata);if(!stat.isFile()||stat.isSymbolicLink())throw new Error('專案內既有圖片中繼資料路徑不安全');const existing=JSON.parse(await fs.readFile(metadata,'utf8'));if(existing.fileName!==image.fileName||existing.prompt!==image.prompt)throw new Error('專案內已存在不同的圖片中繼資料，停止刪除');}
  }
  await creations.writeTaskArchive(copy);
}

async function archiveImageDiscussionJob(job,creations){
  const seriesId=job.imageProjectChat?.seriesId;
  if(!/^[0-9a-f-]{36}$/i.test(seriesId||'')||!/^[0-9a-f-]{36}$/i.test(job.id||''))throw new Error('圖片討論任務缺少可安全封存的識別碼');
  const location={...job,imageCreation:{seriesId,projectStorage:{kind:'project',relativeDirectory:path.join('.cda','image-generations',job.owner,job.conversationId,seriesId)}}};
  const directory=await creations.directoryFor(location,{create:true}),file=path.join(directory,job.id+'.discussion.json');
  const content=JSON.stringify({schemaVersion:1,archiveType:'project-image-discussion',archivedAt:new Date().toISOString(),job},null,2);
  try{await fs.writeFile(file,content,{flag:'wx',mode:0o600});}
  catch(error){if(error.code!=='EEXIST')throw error;const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink())throw new Error('專案內既有圖片討論紀錄路徑不安全');const existing=JSON.parse(await fs.readFile(file,'utf8'));if(existing.archiveType!=='project-image-discussion'||existing.job?.id!==job.id)throw new Error('專案內已存在不同的圖片討論紀錄，停止刪除');}
}

function pruneMemorySources(memory,removedIds){
  if(!memory)return;
  const affected=(memory.sourceJobIds||[]).some(id=>removedIds.has(id))||(memory.versions||[]).some(version=>(version.sourceJobIds||[]).some(id=>removedIds.has(id)));
  memory.sourceJobIds=(memory.sourceJobIds||[]).filter(id=>!removedIds.has(id));
  if(removedIds.has(memory.lastAppliedJobId))memory.lastAppliedJobId=null;
  for(const version of memory.versions||[])version.sourceJobIds=(version.sourceJobIds||[]).filter(id=>!removedIds.has(id));
  if(affected)memory.sourceRemovedAt=new Date().toISOString();
}

function pruneImageProjectIndexes(imageProjects,removedIds){
  for(const project of imageProjects){
    pruneMemorySources(project.memory,removedIds);
    for(const series of project.series||[]){
      pruneMemorySources(series.memory,removedIds);
      if(removedIds.has(series.initialJobId))series.initialJobId=null;
      series.imports=(series.imports||[]).filter(item=>!removedIds.has(item.importedJobId)).map(item=>removedIds.has(item.sourceJobId)?{...item,sourceJobId:null,sourceArchivedAt:new Date().toISOString()}:item);
    }
  }
}

module.exports={configuredProjectRemoval,writeConfiguredProjectRemoval,archiveImageProjectJob,archiveImageDiscussionJob,pruneImageProjectIndexes};

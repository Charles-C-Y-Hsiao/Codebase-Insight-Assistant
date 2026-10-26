const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {formatState}=require('./conversation-memory.js');

const belongsTo=(job,projectId)=>job?.imageProjectChat?.projectId===projectId||job?.imageCreation?.imageProject?.id===projectId;
const allIds=job=>[job.id,job.taskId,...(job.versions||[]).flatMap(version=>[version.id,version.taskId])].filter(Boolean);

function planImageProjectDeletion(data,projectId){
  const records=data.conversations.flatMap(conversation=>(conversation.jobs||[]).filter(job=>belongsTo(job,projectId)).map(job=>({conversation,job})));
  const jobs=records.map(({conversation,job})=>({owner:conversation.owner,projectId:conversation.projectId,conversationId:conversation.id,job}));
  const ids=new Set(records.flatMap(({job})=>allIds(job)));
  const compositions=data.imagePromptCompositions.filter(item=>item.projectId===projectId);
  const blockers=[];
  for(const conversation of data.conversations)for(const job of conversation.jobs||[]){
    if(belongsTo(job,projectId))continue;
    const image=job.imageCreation||{};
    if(ids.has(image.previousJobId)||ids.has(image.draftJobId)||(image.referenceJobIds||[]).some(id=>ids.has(id)))blockers.push('其他圖片專案仍直接引用此專案的圖片版本，請先解除版本關聯');
  }
  if(data.imagePromptCompositions.some(item=>item.projectId!==projectId&&(ids.has(item.selectedJobId)||ids.has(item.usedJobId))))blockers.push('其他圖片專案的提示詞整合紀錄仍引用此專案版本');
  return {records,jobs,ids,compositions,blockers:[...new Set(blockers)]};
}

async function verifiedDirectory(directory,root){
  const resolved=path.resolve(directory),rootResolved=path.resolve(root);
  if(path.dirname(resolved).toLowerCase()!==rootResolved.toLowerCase())throw new Error('圖片專案路徑不合法');
  const stat=await fs.lstat(resolved).catch(error=>error.code==='ENOENT'?null:Promise.reject(error));
  if(!stat||!stat.isDirectory()||stat.isSymbolicLink())throw new Error('圖片專案資料夾不存在或已被替換，已保留登錄');
  if((await fs.realpath(resolved)).toLowerCase()!==resolved.toLowerCase())throw new Error('圖片專案資料夾已被替換，已保留登錄');
  return resolved;
}

async function archiveImageProjectDeletion({project,root,plan}){
  const directory=await verifiedDirectory(project.directory,root);
  const cda=path.join(directory,'.cda'),archiveRoot=path.join(cda,'deletion-archive');
  for(const location of [cda,archiveRoot]){
    const stat=await fs.lstat(location).catch(error=>error.code==='ENOENT'?null:Promise.reject(error));
    if(stat&&(!stat.isDirectory()||stat.isSymbolicLink()))throw new Error('刪除封存路徑不安全，已保留登錄');
    if(!stat)await fs.mkdir(location);
  }
  const stamp=new Date().toISOString().replace(/[:.]/g,'-'),name=stamp+'-'+crypto.randomUUID(),stage=path.join(archiveRoot,'.'+name+'.tmp'),final=path.join(archiveRoot,name);
  await fs.mkdir(stage);
  const write=async(file,value)=>fs.writeFile(path.join(stage,file),JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
  try{
    const files=await fs.readdir(directory,{withFileTypes:true});
    const outputFiles=files.filter(item=>item.isFile()).map(item=>item.name).sort();
    for(const {job} of plan.jobs)if(job.imageCreation?.outputFileName&&!outputFiles.includes(job.imageCreation.outputFileName))throw new Error('產出圖片未保存在圖片專案資料夾，已保留登錄：'+job.imageCreation.outputFileName);
    const manifest={format:1,projectId:project.id,folderName:project.folderName,archivedAt:new Date().toISOString(),jobCount:plan.jobs.length,compositionCount:plan.compositions.length,outputFiles};
    await write('manifest.json',manifest);await write('project.json',project);
    await write('summaries.json',{project:project.memory,series:(project.series||[]).map(item=>({id:item.id,name:item.name,memory:item.memory}))});
    await write('jobs.json',plan.jobs);await write('prompt-compositions.json',plan.compositions);
    await verifiedDirectory(directory,root);
    await fs.rename(stage,final);
    return {directory:final,manifest};
  }catch(error){
    if(path.dirname(path.resolve(stage)).toLowerCase()===path.resolve(archiveRoot).toLowerCase())await fs.rm(stage,{recursive:true,force:true}).catch(()=>{});
    throw error;
  }
}

function removeImageProjectRecords(data,projectId,plan){
  const removed=plan.ids,now=new Date().toISOString();
  data.imageProjects=data.imageProjects.filter(project=>project.id!==projectId);
  data.imagePromptCompositions=data.imagePromptCompositions.filter(item=>item.projectId!==projectId);
  for(const project of data.imageProjects)for(const series of project.series||[]){
    series.imports=(series.imports||[]).map(item=>item.sourceProjectId===projectId?{...item,sourceJobId:null,sourceRemovedAt:now}:item);
  }
  for(const conversation of data.conversations){
    const count=conversation.jobs.length;
    conversation.jobs=conversation.jobs.filter(job=>!belongsTo(job,projectId));
    for(const job of conversation.jobs)for(const version of [job,...(job.versions||[])])if(version.imageCreation?.importedFrom?.projectId===projectId)version.imageCreation.importedFrom={...version.imageCreation.importedFrom,jobId:null,sourceRemovedAt:now};
    const memory=conversation.memory;
    const memoryAffected=count!==conversation.jobs.length||Boolean(memory&&(memory.confirmed||[]).some(item=>removed.has(item.sourceJobId))||(memory?.sources||[]).some(item=>removed.has(item.id)));
    if(!memoryAffected)continue;
    if(memory){
      const removedConfirmed=new Set((memory.confirmed||[]).filter(item=>removed.has(item.sourceJobId)).map(item=>item.id));
      memory.confirmed=(memory.confirmed||[]).filter(item=>!removed.has(item.sourceJobId));
      for(const item of memory.confirmed)if(Array.isArray(item.replaces))item.replaces=item.replaces.filter(id=>!removedConfirmed.has(id));
      memory.sources=(memory.sources||[]).filter(item=>!removed.has(item.id));
      memory.sourceJobCount=memory.sources.length;
      const fields=['goals','decisions','constraints','completed','pending'];
      const cleanStructured=value=>value&&typeof value==='object'?Object.fromEntries(fields.map(field=>[field,(Array.isArray(value[field])?value[field]:[]).filter(item=>item&&Array.isArray(item.sourceJobIds)&&item.sourceJobIds.length&&item.sourceJobIds.every(id=>!removed.has(id)))])):null;
      memory.structured=cleanStructured(memory.structured);memory.summary=memory.structured?formatState(memory.structured):'';
      memory.updates=(memory.updates||[]).map(update=>{const structured=cleanStructured(update.structured);return {...update,structured,summary:structured?formatState(structured):'',sourceJobIds:(update.sourceJobIds||[]).filter(id=>!removed.has(id)),redacted:true};});
      memory.lastUpdate={status:'redacted',reason:'圖片專案刪除後，來源不明的摘要已移除，待下次整理'};
      memory.confirmedFingerprint=null;memory.rebuildAfterDeletion=true;
    }
    for(const job of conversation.jobs){
      for(const version of [job,...(job.versions||[])]){
        if(version.historySelection)version.historySelection={redacted:true,warning:'圖片專案刪除後，歷史篩選快照已移除'};
        if(version.imageProjectChat?.historySelection)version.imageProjectChat.historySelection={redacted:true,warning:'圖片專案刪除後，歷史篩選快照已移除'};
      }
    }
    conversation.updatedAt=now;
  }
}

module.exports={belongsTo,planImageProjectDeletion,archiveImageProjectDeletion,removeImageProjectRecords};

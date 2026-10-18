const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {AppState}=require('../src/app-state');
const {ImageCreationService}=require('../src/image-creation');

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5n8AAAAASUVORK5CYII=','base64');

test('一般生圖歸檔到專案、刪除對話後可列出與還原，並安全搬移舊中央資料',async t=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'cda-project-image-archive-'));
  const runtime=path.join(base,'runtime'),project=path.join(base,'project');await fs.mkdir(project);
  const saved=await new AppState(runtime).init(),owner='owner-test',projectId='project-test',projectRootForId=id=>id===projectId?project:null;
  const service=new ImageCreationService({runtime,saved,projectRootForId,model:{config:{provider:'openai',imageGenerationModel:'gpt-image-1',authPrefix:'Bearer '},imageKey:()=> 'fake'},fetchImpl:async()=>Response.json({data:[{b64_json:png.toString('base64')}]})});
  t.after(()=>fs.rm(base,{recursive:true,force:true}));

  const conversation=saved.conversation(owner,projectId),job=service.start({owner,projectId,conversationId:conversation.id,prompt:'一張示範圖',storeInProject:true});
  await saved.record(service.jobs.get(job.id));service.launch(service.jobs.get(job.id),null);await service.jobs.get(job.id).finished;
  const record=conversation.jobs.find(item=>item.id===job.id),relative=record.imageCreation.projectStorage.relativeDirectory,archiveDirectory=path.join(project,relative);
  assert.equal(record.status,'completed');assert.deepEqual((await fs.readdir(archiveDirectory)).sort(),[job.id+'.task.json','示範圖-v1.json','示範圖-v1.png'].sort());
  const taskArchive=JSON.parse(await fs.readFile(path.join(archiveDirectory,job.id+'.task.json'),'utf8'));assert.equal(taskArchive.job.imageCreation.prompt,'一張示範圖');assert.equal(taskArchive.job.status,'completed');
  assert.deepEqual(await service.readImage(record),png);
  await saved.deleteConversation(owner,projectId,conversation.id);
  const archiveList=await service.listProjectArchive(projectId,project,owner);assert.deepEqual(archiveList.map(item=>item.id),[job.id]);
  const archivedJob=await service.readProjectArchive(projectId,project,owner,job.id),restored=saved.restoreConversation(owner,projectId,archivedJob.conversationId);await saved.record(archivedJob);
  assert(restored.jobs.some(item=>item.id===job.id));assert.deepEqual(await service.readImage(restored.jobs.find(item=>item.id===job.id)),png);

  const legacyConversation=saved.conversation(owner,projectId),legacySeries=crypto.randomUUID(),legacyId=crypto.randomUUID(),legacyName='old-v1.png',legacyDirectory=path.join(service.base,projectId,legacyConversation.id,legacySeries),legacyImage={seriesId:legacySeries,slug:'old',version:1,model:'gpt-image-1',prompt:'舊版提示詞',fileName:legacyName,mime:'image/png'};
  await fs.mkdir(legacyDirectory,{recursive:true});await fs.writeFile(path.join(legacyDirectory,legacyName),png);await fs.writeFile(path.join(legacyDirectory,'old-v1.json'),JSON.stringify(legacyImage));
  const legacyJob={id:legacyId,kind:'image',owner,projectId,conversationId:legacyConversation.id,question:legacyImage.prompt,status:'completed',progress:'圖片創作完成',startedAt:Date.now(),finishedAt:Date.now(),result:{conclusions:['舊圖'],facts:[],inferences:[],unknown:[]},ai:{provider:'openai',model:'gpt-image-1',requests:1,usage:[]},imageCreation:legacyImage};
  await saved.record(legacyJob);assert.equal(await service.migrateProjectImages(projectId,project),1);
  const migrated=legacyConversation.jobs.find(item=>item.id===legacyId),migratedDirectory=path.join(project,migrated.imageCreation.projectStorage.relativeDirectory);
  assert.deepEqual((await fs.readdir(migratedDirectory)).sort(),[legacyId+'.task.json','old-v1.json','old-v1.png'].sort());await assert.rejects(fs.access(legacyDirectory));assert.deepEqual(await service.readImage(migrated),png);
});

function activityTime(value){const time=typeof value==='number'?value:Date.parse(value);return Number.isFinite(time)&&time>0?time:0;}
function jobActivityTime(job){return Math.max(0,...[job.updatedAt,job.startedAt,job.finishedAt,job.imageCreation?.createdAt,job.imageProjectDraft?.createdAt,...(job.events||[]).map(event=>event.time)].map(activityTime));}
function projectActivity(conversations,owner){
  const projects=new Map(),images=new Map();
  const update=(map,id,time)=>{if(id)map.set(id,Math.max(map.get(id)||0,time));};
  for(const conversation of conversations){
    if(conversation.owner!==owner)continue;
    const jobs=conversation.jobs||[],imageId=job=>job.imageProjectChat?.projectId||job.imageCreation?.imageProject?.id;
    // Image jobs share a storage conversation; their updates belong to the image project.
    const mixed=jobs.some(imageId);
    update(projects,conversation.projectId,Math.max(activityTime(conversation.createdAt),mixed?0:activityTime(conversation.updatedAt)));
    for(const job of jobs){const id=imageId(job);update(id?images:projects,id||conversation.projectId,Math.max(jobActivityTime(job),...(job.versions||[]).map(jobActivityTime)));}
  }
  const date=(map,id)=>map.get(id)?new Date(map.get(id)).toISOString():null;
  return {project:id=>date(projects,id),image:id=>date(images,id)};
}
module.exports={activityTime,jobActivityTime,projectActivity};

function imagePromptLineage(jobs,projectId,seriesId,selectedId){
  const byId=new Map(jobs.map(job=>[job.id,job]));
  const seen=new Set(),reversed=[];
  let id=selectedId;
  while(id){
    if(seen.has(id))throw new Error('圖片版本關聯形成循環，無法整理提示詞');
    if(reversed.length>=100)throw new Error('圖片版本鏈超過 100 筆，無法可靠整理');
    seen.add(id);
    const job=byId.get(id),image=job?.imageCreation;
    if(!job||job.kind!=='image'||job.status!=='completed'||!image?.fileName||image.imageProject?.id!==projectId||image.seriesId!==seriesId)throw new Error('圖片版本鏈缺少可驗證的上一版，請檢查系列紀錄');
    reversed.push(job);id=image.previousJobId||null;
  }
  const chain=reversed.reverse();
  return chain.map((job,index)=>{
    const image=job.imageCreation,parent=chain[index-1]?.imageCreation;
    const originalPrompt=typeof image.prompt==='string'?image.prompt:'';
    const parentPrompt=typeof parent?.prompt==='string'?parent.prompt:'';
    const occurrence=parentPrompt?originalPrompt.indexOf(parentPrompt):-1;
    const inheritedExact=occurrence>=0;
    const uniquePrompt=inheritedExact?originalPrompt.split(parentPrompt).join('').trim():originalPrompt;
    return {jobId:job.id,version:image.version,previousJobId:image.previousJobId||null,currentRequest:image.currentRequest||job.question||'',originalPrompt,uniquePrompt,inheritedExact,projectSummary:image.projectSummary||'',projectSummaryVersion:image.projectSummaryVersion||0,seriesSummary:image.seriesSummary||'',seriesSummaryVersion:image.seriesSummaryVersion||0,draftJobId:image.draftJobId||null};
  });
}
module.exports={imagePromptLineage};

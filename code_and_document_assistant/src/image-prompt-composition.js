const {imagePromptLineage}=require('./image-prompt-lineage.js');

const MAX_PART=9000;
const MAX_BATCH=14000;
function sourceParts(chain,projectSummary,seriesSummary,currentRequest){
  const parts=[];
  const add=(type,label,text,jobId=null)=>{
    if(!text?.trim())return;
    const count=Math.ceil(text.length/MAX_PART);
    for(let index=0;index<count;index++)parts.push({type,label,jobId,part:index+1,parts:count,text:text.slice(index*MAX_PART,(index+1)*MAX_PART)});
  };
  for(const item of chain){
    add('version-prompt',`圖片 v${item.version} 的${item.inheritedExact?'非繼承':'完整'}提示詞`,item.uniquePrompt,item.jobId);
    add('version-request',`圖片 v${item.version} 的本次要求`,item.currentRequest,item.jobId);
    // Old summary snapshots are retained in the trace. Their effective text is already
    // represented by saved prompts; current summaries are supplied once at the end.
  }
  add('project-summary','目前專案摘要',projectSummary);
  add('series-summary','目前系列摘要',seriesSummary);
  add('current-request','本次新增要求',currentRequest);
  return parts;
}
function batches(parts){
  const result=[];let batch=[],size=0;
  for(const part of parts){
    const length=JSON.stringify(part).length;
    if(length>MAX_BATCH)throw new Error('提示詞來源單段過長，無法安全分批');
    if(batch.length&&size+length>MAX_BATCH){result.push(batch);batch=[];size=0;}
    batch.push(part);size+=length;
  }
  if(batch.length)result.push(batch);
  return result;
}
async function composeImagePrompt({jobs,project,series,previousJobId,currentRequest,imageTextOnlyMode=false,model,checkPermission,trace,onProgress=async()=>{}}){
  const chain=imagePromptLineage(jobs,project.id,series.id,previousJobId);
  const parts=sourceParts(chain,project.memory.summary||'',series.memory.summary||'',currentRequest);
  const groups=batches(parts);
  trace.chain=chain;
  trace.parts=parts;
  trace.batches=[];
  trace.projectSummary=project.memory.summary||'';
  trace.projectSummaryVersion=project.memory.version||0;
  trace.seriesSummary=series.memory.summary||'';
  trace.seriesSummaryVersion=series.memory.version||0;
  trace.currentRequest=currentRequest;
  trace.imageTextOnlyMode=imageTextOnlyMode;
  await onProgress();
  let priorPrompt='',decisions=[],conflicts=[],unverified=[];
  const signal=AbortSignal.timeout(model.config.overallTimeoutMs*Math.max(1,groups.length+1));
  for(let index=0;index<groups.length;index++){
    const input={batch:index+1,batchCount:groups.length,imageTextOnlyMode,priority:'本次新增要求 > 目前專案與系列摘要 > 祖先鏈（新版本優先）',priorPrompt,parts:groups[index]};
    const entry={index:index+1,input,status:'running',startedAt:new Date().toISOString()};trace.batches.push(entry);await onProgress();
    try{
      const result=await model.composeImagePrompt(input,signal,checkPermission);
      Object.assign(entry,{status:'completed',result,finishedAt:new Date().toISOString()});
      priorPrompt=result.prompt;decisions=[...decisions,...result.decisions];conflicts=[...conflicts,...result.conflicts];unverified=[...unverified,...result.unverified];await onProgress();
    }catch(error){Object.assign(entry,{status:'failed',error:{code:error.code||'AI_ERROR',message:error.message,usage:error.usage||null,rawOutput:error.rawOutput||null},finishedAt:new Date().toISOString()});await onProgress();throw error;}
  }
  if(!priorPrompt)throw new Error('提示詞整合沒有產生結果');
  if(priorPrompt.length>15000){
    const input={batch:'compression',imageTextOnlyMode,priority:'保留所有仍有效的需求、構圖、文字與限制；不編造圖片內容',priorPrompt,maxChars:14000};
    const entry={index:'compression',input,status:'running',startedAt:new Date().toISOString()};trace.batches.push(entry);await onProgress();
    try{const result=await model.composeImagePrompt(input,signal,checkPermission);Object.assign(entry,{status:'completed',result,finishedAt:new Date().toISOString()});priorPrompt=result.prompt;decisions.push(...result.decisions);conflicts.push(...result.conflicts);unverified.push(...result.unverified);await onProgress();}catch(error){Object.assign(entry,{status:'failed',error:{code:error.code||'AI_ERROR',message:error.message,usage:error.usage||null,rawOutput:error.rawOutput||null},finishedAt:new Date().toISOString()});await onProgress();throw error;}
  }
  if(priorPrompt.length>15000)throw new Error('整合後提示詞仍超過 15000 字，請手動縮短後重新檢查');
  return {prompt:priorPrompt,decisions:[...new Set(decisions)],conflicts:[...new Set(conflicts)],unverified:[...new Set(unverified)],usage:{requests:trace.batches.length,inputTokens:trace.batches.reduce((n,b)=>n+(b.result?.usage?.inputTokens||b.error?.usage?.inputTokens||0),0),outputTokens:trace.batches.reduce((n,b)=>n+(b.result?.usage?.outputTokens||b.error?.usage?.outputTokens||0),0)}};
}
module.exports={composeImagePrompt,sourceParts,batches};

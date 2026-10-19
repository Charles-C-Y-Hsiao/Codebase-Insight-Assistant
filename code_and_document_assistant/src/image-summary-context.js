const BATCH_SIZE=6;

function excerpt(value,limit){
  const text=String(value||'').trim();
  if(text.length<=limit)return text;
  const marker='\n[…中段省略，僅保留前後摘錄…]\n';
  const head=Math.floor((limit-marker.length)/3),tail=limit-marker.length-head;
  return text.slice(0,head)+marker+text.slice(-tail);
}

function summaryTurn(job){
  const creation=job.imageCreation;
  return {
    id:job.id,
    type:creation?'generation':'chat',
    request:excerpt(creation?.currentRequest||job.question,600),
    response:excerpt(job.result?.answer||job.result?.conclusions?.join('；'),600),
    fullPrompt:creation?excerpt(creation.prompt,800):''
  };
}

function orderedSummaryJobs(jobs){
  const timestamp=value=>Number(value)||Date.parse(value)||0;
  return [...jobs].sort((a,b)=>timestamp(a.startedAt)-timestamp(b.startedAt));
}

function summaryBatches(jobs){
  const ordered=orderedSummaryJobs(jobs);
  const batches=[];
  for(let index=0;index<ordered.length;index+=BATCH_SIZE)batches.push(ordered.slice(index,index+BATCH_SIZE));
  return batches;
}

module.exports={excerpt,summaryTurn,orderedSummaryJobs,summaryBatches};

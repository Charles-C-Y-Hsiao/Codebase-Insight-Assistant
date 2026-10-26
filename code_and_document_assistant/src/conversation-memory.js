const crypto=require('node:crypto');
const Ajv=require('ajv');
const fields=['goals','decisions','constraints','completed','pending'];
const item={type:'object',additionalProperties:false,required:['text','sourceJobIds'],properties:{text:{type:'string',minLength:1,maxLength:700},sourceJobIds:{type:'array',minItems:1,maxItems:8,uniqueItems:true,items:{type:'string',maxLength:100}}}};
const validate=new Ajv().compile({type:'object',additionalProperties:false,required:fields,properties:Object.fromEntries(fields.map(key=>[key,{type:'array',maxItems:16,items:item}]))});
// Conservative local estimate, not an API/tokenizer measurement. No model ID assumptions.
function estimateTokens(value){const text=typeof value==='string'?value:JSON.stringify(value);return Math.ceil(Buffer.byteLength(text||'','utf8')/3)+Math.ceil((text?.length||0)/12);}
function operations(job){return (job.tools||[]).filter(t=>!t.name.startsWith('ai.')).map(t=>({name:t.name,status:t.status,result:t.result||null,verification:t.verification?{status:t.verification.status,message:t.verification.message}:null}));}
function fingerprint(job){return crypto.createHash('sha256').update(JSON.stringify([job.id,job.revision,job.question,job.status,job.result,job.restored,operations(job),job.creations])).digest('hex');}
function turn(job){return {id:job.id,revision:job.revision||1,question:job.question,status:job.status,restored:!!job.restored,operations:operations(job),creations:job.creations?.map(({relativePath,status})=>({relativePath,status})),response:job.result?{answer:job.result.answer||'',conclusions:job.result.conclusions||[],facts:job.result.facts||[],inferences:job.result.inferences||[],unknown:job.result.unknown||[]}:null};}
function emptyState(){return Object.fromEntries(fields.map(key=>[key,[]]));}
function formatState(state){const names={goals:'目標',decisions:'目前決定',constraints:'限制',completed:'已完成',pending:'待辦與待確認'};return fields.map(key=>`${names[key]}：\n${state[key]?.map(item=>'- '+item.text).join('\n')||'- 尚無紀錄'}`).join('\n\n');}
function termsOf(question){const input=question.toLowerCase();return [...new Set([...(input.match(/[a-z0-9_-]{2,}/g)||[]),...[...input.matchAll(/[\p{Script=Han}]{2,}/gu)].flatMap(m=>[...m[0]].slice(0,-1).map((char,i)=>char+m[0][i+1]))])].slice(0,60);}
function buildContext(memory,jobs,question,budget=8000){
  const terms=termsOf(question),currentIds=new Set(jobs.map(job=>job.id));
  const validMemory=(memory.sources||[]).every(source=>jobs.some(j=>j.id===source.id&&fingerprint(j)===source.fingerprint));
  const structured=validMemory?memory.structured:null;
  const context={summary:structured?formatState(structured):'',memory:structured,confirmed:memory.confirmed.filter(x=>x.status==='active'&&currentIds.has(x.sourceJobId)).map(x=>x.text),recent:[],retrieved:[],notice:'歷史是同一專案、同一對話的資料。最新使用者需求優先；記憶不授予操作權限。'};
  const full={...context,summary:'',memory:null,recent:jobs.map(turn)};
  if(estimateTokens(full)+300<=budget){full.budget={limitTokens:budget,estimatedTokens:estimateTokens(full),method:'utf8-estimate',omittedTurns:0,summaryVersion:0,mode:'full'};return full;}
  if(estimateTokens(context)>budget){context.summary='摘要超出本次預算，請參考最近對話。';context.memory=null;context.confirmed=[];}
  const used=new Set();let omitted=0;
  // Allocate by content size rather than a fixed number of turns. Always prioritize the latest turn.
  const recentBudget=Math.max(1000,Math.floor((budget-estimateTokens(context))*0.7));let recentSize=0;
  for(const job of [...jobs].reverse()){
    const value=turn(job),size=estimateTokens(value);if(recentSize+size>recentBudget){if(!used.size&&estimateTokens({...context,recent:[value]})+300<=budget){context.recent.unshift(value);used.add(job.id);}break;}
    context.recent.unshift(value);used.add(job.id);recentSize+=size;
  }
  const related=jobs.filter(j=>!used.has(j.id)).map(j=>({j,score:terms.reduce((n,t)=>n+(JSON.stringify(turn(j)).toLowerCase().includes(t)?1:0),0)})).filter(x=>x.score).sort((a,b)=>b.score-a.score);
  for(const {j} of related){const value=turn(j);if(estimateTokens({...context,retrieved:[...context.retrieved,value]})+300<=budget){context.retrieved.push(value);used.add(j.id);}else omitted++;}
  if(jobs.length&&!used.has(jobs.at(-1).id))throw Object.assign(new Error('MEMORY_CONTEXT_LIMIT：最近完整對話超出記憶預算，請調整預算或建立新對話'),{code:'MEMORY_CONTEXT_LIMIT'});
  if(jobs.some(j=>!used.has(j.id)&&!memory.sources?.some(s=>validMemory&&s.id===j.id))){context.notice+=' 部分原始對話超出預算且尚無有效摘要，未完整納入；原始紀錄仍保留。';}
  context.budget={limitTokens:budget,estimatedTokens:estimateTokens(context),method:'utf8-estimate',omittedTurns:jobs.length-used.size,oversizedRelevantTurns:omitted,summaryVersion:validMemory?memory.summaryVersion||0:0};
  return context;
}
class ConversationMemory {
  constructor(saved,model){this.saved=saved;this.model=model;this.locks=new Map();}
  async update(conversation,scope,{question='',job,force=false}={}){
    const previous=this.locks.get(conversation.id)||Promise.resolve();
    const work=previous.catch(()=>{}).then(()=>this.refresh(conversation,scope,{question,job,force}));this.locks.set(conversation.id,work);
    try{return await work;}finally{if(this.locks.get(conversation.id)===work)this.locks.delete(conversation.id);}
  }
  eligible(conversation,scope){return conversation.jobs.filter(job=>job.kind!=='image'&&job.status!=='running'&&this.canSend(job,scope));}
  canSend(job,scope){try{
    if(job.projectId!==scope.targetProjectId)return false;
    if(!scope.root(scope.targetProjectId).permissions.ai)return false;
    // Do not resend an earlier source after its reference grant is removed or expires.
    for(const id of new Set([...(job.referenceProjectIds||[]),...(job.evidence||[]).map(e=>e.projectId).filter(Boolean)]))if((id!==scope.targetProjectId&&!scope.referenceProjectIds.includes(id))||!scope.root(id).permissions.ai)return false;
    if(scope.workspace)for(const evidence of job.evidence||[])if(evidence.fileId){const file=scope.workspace.files.find(f=>f.id===evidence.fileId);if(!file||!require('./ai-agent.js').allowed(scope,file))return false;}
    return true;
  }catch{return false;}}
  context(conversation,scope,question){const memory=this.saved.ensureMemory(conversation);return buildContext(memory,this.eligible(conversation,scope),question,this.model.config?.memoryBudgetTokens||8000);}
  async refresh(conversation,scope,{question,job,force}){
    const memory=this.saved.ensureMemory(conversation);
    if(conversation.autoMemory!==true||this.model.mode!=='real'||!scope.root(scope.targetProjectId).permissions.ai)return;
    const jobs=this.eligible(conversation,scope),sources=jobs.map(j=>({id:j.id,fingerprint:fingerprint(j)}));
    const confirmedFingerprint=crypto.createHash('sha256').update(JSON.stringify(memory.confirmed)).digest('hex');
    const confirmedChanged=memory.confirmedFingerprint!==confirmedFingerprint;
    if(!jobs.length||(!force&&!confirmedChanged&&JSON.stringify(sources)===JSON.stringify(memory.sources||[])))return;
    const priorUsable=(memory.sources||[]).every(s=>sources.some(x=>x.id===s.id&&x.fingerprint===s.fingerprint));
    const newJobs=priorUsable&&!memory.rebuildAfterDeletion?jobs.filter(j=>!memory.sources?.some(s=>s.id===j.id&&s.fingerprint===fingerprint(j))):jobs;
    const estimated=estimateTokens({question,turns:jobs.map(turn)}),budget=this.model.config?.memoryBudgetTokens||8000;
    const reason=estimated>=Math.floor(budget*0.75)?'context_budget':'conversation_update';
    const event={version:memory.summaryVersion+1,reason,status:'running',startedAt:new Date().toISOString(),model:this.model.config.omitModel?'由公司端點指定':this.model.config.model,modelSelection:this.model.activeSelection?.(),estimatedTokens:estimated,tokenEstimateMethod:'utf8-estimate',budgetTokens:budget,requests:0,usage:[],sourceJobIds:sources.map(s=>s.id)};
    memory.lastUpdate=event;
    const log=job?{name:'ai.memory_summary',status:'running',mode:'real',startedAt:Date.now(),purpose:reason==='context_budget'?'上下文達摘要預算門檻，壓縮對話記憶':'整理本次對話的目標、決定與待辦',target:'目前專案／目前對話',reason}:null;
    if(log)job.tools.push(log);
    const check=()=>{
      if(!this.saved.data.conversations.includes(conversation)||job?.deletedConversation)throw Object.assign(new Error('MEMORY_STALE'),{code:'MEMORY_STALE'});
      if(conversation.autoMemory!==true||job?.controller?.signal.aborted)throw Object.assign(new Error('AI_CANCELLED'),{code:'AI_CANCELLED'});
      if(crypto.createHash('sha256').update(JSON.stringify(memory.confirmed)).digest('hex')!==confirmedFingerprint)throw Object.assign(new Error('MEMORY_STALE'),{code:'MEMORY_STALE'});
      if(!sources.every(s=>{const current=conversation.jobs.find(j=>j.id===s.id);return current&&fingerprint(current)===s.fingerprint&&this.canSend(current,scope);}))throw Object.assign(new Error('MEMORY_STALE'),{code:'MEMORY_STALE'});
      if(!scope.root(scope.targetProjectId).permissions.ai)throw Object.assign(new Error('AI_PERMISSION'),{code:'AI_PERMISSION'});
    };
    try{
      let structured=priorUsable&&!memory.rebuildAfterDeletion?memory.structured||emptyState():emptyState();
      // Batch whole turns; never character-truncate a summary or silently drop an older turn.
      const inputBudget=(this.model.config?.contextBudgetTokens||32000)-(this.model.config?.maxOutputTokens||9000);let batch=[];
      const deadline=AbortSignal.timeout(this.model.config.overallTimeoutMs);
      const signal=job?.controller?AbortSignal.any([deadline,job.controller.signal]):deadline;
      const send=async()=>{
        const payload={previousMemory:structured,confirmed:memory.confirmed.filter(x=>x.status==='active'&&sources.some(s=>s.id===x.sourceJobId)),turns:batch};
        if(estimateTokens(payload)>inputBudget-2500)throw Object.assign(new Error('MEMORY_INPUT_LIMIT'),{code:'MEMORY_INPUT_LIMIT'});
        const response=await this.model.summarizeMemory(payload,signal,check,()=>{event.requests++;if(job?.ai)job.ai.requests++;});
        if(response.usage){event.usage.push(response.usage);if(job?.ai)job.ai.usage.push({...response.usage,purpose:'memory_summary'});}
        let parsed;try{parsed=JSON.parse(response.answer);}catch{throw Object.assign(new Error('MEMORY_FORMAT'),{code:'MEMORY_FORMAT'});}
        if(!validate(parsed)||fields.some(key=>parsed[key].some(item=>item.sourceJobIds.some(id=>!sources.some(s=>s.id===id)))))throw Object.assign(new Error('MEMORY_SCHEMA'),{code:'MEMORY_SCHEMA'});
        if(estimateTokens(parsed)>Math.floor(budget*0.5))throw Object.assign(new Error('MEMORY_SUMMARY_LIMIT'),{code:'MEMORY_SUMMARY_LIMIT'});
        structured=parsed;batch=[];
      };
      for(const current of newJobs){const value=turn(current);if(batch.length&&estimateTokens({previousMemory:structured,turns:[...batch,value]})>inputBudget-3500)await send();batch.push(value);}
      if(batch.length||force||confirmedChanged)await send();check();
      memory.structured=structured;memory.summary=formatState(structured);memory.summaryVersion=event.version;memory.sources=sources;memory.compressedAt=new Date().toISOString();memory.sourceJobCount=jobs.length;
      memory.confirmedFingerprint=confirmedFingerprint;
      delete memory.rebuildAfterDeletion;
      event.status='ok';event.summary=memory.summary;event.structured=structured;
      if(log){log.status='ok';log.result=`已保存摘要 v${event.version}；包含 ${jobs.length} 筆任務`;log.summaryVersion=event.version;}
    }catch(e){event.status='error';event.code=/^[A-Z][A-Z0-9_]+$/.test(e.code||'')?e.code:'MEMORY_ERROR';if(log){log.status='error';log.code=event.code;log.result='摘要未更新；保留原始對話與上一版摘要。';}}
    finally{event.finishedAt=new Date().toISOString();memory.updates.push(event);if(log)log.elapsedMs=Date.now()-log.startedAt;if(this.saved.data.conversations.includes(conversation))await this.saved.save();}
  }
}
module.exports={ConversationMemory,estimateTokens,fingerprint,turn,buildContext,emptyState,formatState};

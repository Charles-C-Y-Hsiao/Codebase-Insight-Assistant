const crypto=require('node:crypto');
const path=require('node:path');
const {MockModel,validatePlan}=require('./model.js');
const tools=require('./tools.js');
function bounded(promise,signal) {
  return new Promise((resolve,reject)=>{
    const abort=()=>reject(new Error('任務取消或整體逾時'));
    signal.addEventListener('abort',abort,{once:true});
    promise.then(value=>{signal.removeEventListener('abort',abort);resolve(value);},error=>{signal.removeEventListener('abort',abort);reject(error);});
    if(signal.aborted) {signal.removeEventListener('abort',abort);abort();}
  });
}
class Engine {
  constructor(workspace,limits,model=require('./connections.js').createModel()) {this.workspace=workspace;this.limits=limits;this.model=model;this.jobs=new Map();this.applying=false;}
  async manual(fileId,after,owner,scope=this.workspace,context={}){
    const startedAt=Date.now();
    if(this.jobs.size>=200)throw new Error('任務容量已滿');
    const proposal=await scope.createProposal(fileId,after,'manual');
    const job={id:crypto.randomUUID(),owner,question:'檢視使用者提供的程式修改',fileIds:[fileId],status:'awaiting_approval',progress:'等待主機確認修改',events:[],plan:['讀取授權檔案與版本','預覽使用者提供的修改內容','主機確認後核對版本並套用','依驗證授權執行靜態 profile'],evidence:await scope.search('',[fileId]),tools:[],calls:0,controller:new AbortController(),proposal,result:{...this.result('已建立實際檔案修改提案',[],['此修改由使用者提供，未使用 AI 生成']),mock:false}};
    Object.assign(job,context,{scope,startedAt,allowEdits:true});this.event(job,'已建立人工修改提案，等待確認');this.jobs.set(job.id,job);return this.public(job);
  }
  start(question,fileIds,owner,scope=this.workspace,context={}) {
    if(this.jobs.size>=200) {for(const [id,j] of this.jobs) if(!['running','awaiting_approval'].includes(j.status)) this.jobs.delete(id);}
    if(this.jobs.size>=200||[...this.jobs.values()].filter(j=>j.status==='running').length>=8) throw new Error('任務容量已滿，請稍後再試');
    if(fileIds.some(id=>!scope.files.some(f=>f.id===id))) throw new Error('@file 不存在或未授權');
    const job={id:crypto.randomUUID(),owner,question,fileIds,status:'running',progress:'搜尋文件',events:[],iterations:[],plan:[],evidence:[],tools:[],calls:0,result:null,controller:new AbortController()};
    Object.assign(job,context,{scope,startedAt:Date.now()});this.event(job,'開始處理需求');this.jobs.set(job.id,job); job.finished=this.run(job); return this.public(job);
  }
  public(j) {const {controller,owner,finished,scope,imageInputs,historyContext,historyCheck,...result}=j;return result;}
  get(id,owner) {const j=this.jobs.get(id);if(!j||j.owner!==owner) throw new Error('找不到任務');return j;}
  cancel(id,owner) {const j=this.get(id,owner);if(['running','awaiting_approval'].includes(j.status)) {j.controller.abort();j.status='cancelled';j.finishedAt=Date.now();for(const item of j.creations||[])if(item.status==='pending'){item.status='cancelled';j.scope.workspace.proposals.delete(item.id);}this.event(j,'已取消');j.result={conclusions:[],facts:[],unknown:['使用者取消任務；已建立的檔案保留，其餘不再建立'],inferences:[]};}return this.public(j);}
  event(j,message) {j.progress=message;j.events.push({time:new Date().toISOString(),message});}
  async call(j,name,args,scenario) {
    const key=JSON.stringify([name,args]); j.seen ||= [];
    if(j.seen.includes(key)) throw new Error('已阻止重複查詢');j.seen.push(key);
    for(let attempt=0;attempt<=this.limits.maxRetries;attempt++) {
      if(j.controller.signal.aborted) throw new Error('任務取消或整體逾時');
      if(j.calls>=this.limits.maxCalls) throw new Error('達到工具呼叫上限');
      j.calls++;
      const ctrl=new AbortController(); const abort=()=>ctrl.abort();
      j.controller.signal.addEventListener('abort',abort,{once:true});
      let timedOut=false;const timer=setTimeout(()=>{timedOut=true;ctrl.abort();},this.limits.toolTimeoutMs);
      const started=Date.now();
      try {
        const rows=(await tools.execute(name,args,{signal:ctrl.signal,scenario})).slice(0,this.limits.maxRows);
        j.tools.push({name,args,startedAt:started,attempt:attempt+1,status:'ok',mode:'mock',rows:rows.length,elapsedMs:Date.now()-started,mock:true});
        return {id:'TOOL-'+j.evidence.length,kind:'tool',path:'mock://'+name,location:'回傳列 1',excerpt:JSON.stringify(rows,null,2),rows,mock:true,mode:'mock'};
      } catch(e) {
        j.tools.push({name,args,startedAt:started,attempt:attempt+1,status:'error',mode:'error',code:timedOut?'TIMEOUT':e.code||'ERROR',message:timedOut?'模擬 API 逾時':e.message,elapsedMs:Date.now()-started,mock:e.code!=='CONFIG_REQUIRED'});
        if(j.controller.signal.aborted||(!timedOut&&!e.retryable)||attempt===this.limits.maxRetries) throw new Error(timedOut?'模擬 API 逾時，重試已用盡':e.message);
      } finally {clearTimeout(timer);j.controller.signal.removeEventListener('abort',abort);}
    }
  }
  async run(j) {
    const real=!!this.model.mode;
    const timer=setTimeout(()=>{j.timedOut=true;j.controller.abort();},this.model.config?.overallTimeoutMs||this.limits.overallTimeoutMs);
    try {
      if(this.model.mode==='real'){await require('./ai-agent.js').runAgent(this,j);return;}
      const p=validatePlan(await bounded(this.model.plan({question:j.question,files:j.fileIds}),j.controller.signal));j.plan=p.steps;
      await tools.delay(100,j.controller.signal);
      j.evidence=await bounded(j.scope.search(j.question,j.fileIds),j.controller.signal);
      if(j.controller.signal.aborted) throw new Error('任務取消或整體逾時');
      if(p.intent==='missing') {j.status='completed';j.result=this.result('工具能力不足',[],['尚無此查詢或操作工具；不能產生任意 SQL、Shell 或網址']);return;}
      if(p.intent==='edit') {
        j.proposal=await bounded(j.scope.proposal(j.fileIds),j.controller.signal); j.status='awaiting_approval';
        this.event(j,'等待確認修改');j.result=this.result('已產生 Mock 修改建議，請檢視差異後套用',[],['規劃為固定範例規則；尚未寫入或驗證']);return;
      }
      if(p.intent==='read') {
        j.result=this.result(j.evidence.length?'已取得文件片段，請展開來源查看原文':'沒有符合關鍵字的文件片段',j.evidence.map(e=>({text:'取得 '+e.path+' / '+e.location+' 的原文',evidenceIds:[e.id]})),['Mock 不提供任意程式的真實語意分析；查無資料不代表沒有異常']);j.status='completed';return;
      }
      if(!p.product||!p.period) {j.status='needs_input';j.result=this.result('請補充'+(!p.product?'產品（A 或 B）':'')+(!p.product&&!p.period?'與':'')+(!p.period?'時間（2026 Q1）':''),[],['展示只支援 A / B 與 2026 Q1；請在下一題提供完整條件']);return;}
      this.event(j,'查詢資料');const errors=[];
      for(const name of ['sqlserver.orders','oracle.orders','api.orders']) {
        try {j.evidence.push(await this.call(j,name,{product:p.product,period:p.period},p.scenario));}
        catch(e) {errors.push(name+'：'+e.message);if(j.controller.signal.aborted||j.calls>=this.limits.maxCalls)break;}
      }
      this.event(j,'核對結果');
      j.result=this.summarize(j,p,errors);
      if(!j.controller.signal.aborted) j.result.modelReview=await bounded(this.model.assessEvidence(),j.controller.signal);
      if(j.status!=='cancelled') j.status=j.timedOut||errors.length?'partial':'completed';
    } catch(e) {
      if(j.status!=='cancelled') {j.status='partial';j.result={...this.result('流程未完成，保留已取得的證據',[],[e.message]),...(real?{mock:false,origin:'ai',unknown:[e.message,'未回退 Mock；來源片段可供人工核對。']}: {})};}
    } finally {
      delete j.imageInputs;
      for(const iteration of j.iterations||[])if(iteration.status==='running'){
        iteration.status='stop';iteration.next=j.status==='cancelled'?'任務已取消':'流程未完成，請查看錯誤與已取得結果';
        iteration.observation||=j.result?.unknown?.[0]||'本輪未取得工具結果';
      }
      j.finishedAt=j.status==='awaiting_approval'?null:Date.now();
      clearTimeout(timer);
      if(j.status==='cancelled') j.result={...this.result('使用者已取消任務',[],['僅保留已取得的證據；未繼續執行']),...(real?{mock:false,origin:'ai'}:{})};
      if(j.result) {
        // 所有重要事實引用必须指向本次真正取得的證據與非空位置。
        const valid=new Set(j.evidence.filter(e=>e.id&&e.location&&e.path&&e.excerpt).map(e=>e.id));
        j.result.facts=j.result.facts.filter(f=>f.evidenceIds.length&&f.evidenceIds.every(id=>valid.has(id)));
      }
      if(!['awaiting_approval','cancelled'].includes(j.status)) this.event(j,j.status==='needs_input'?'需要補充條件':j.status==='partial'?'部分完成':'完成');
    }
  }
  result(conclusion,facts=[],unknown=[]) {return {conclusions:[conclusion],facts,inferences:[],unknown,mock:true};}
  summarize(j,p,errors) {
    const facts=[],values=[];
    for(const e of j.evidence) {
      if(e.kind==='tool') {
        const r=e.rows[0];
        if(r.product!==p.product||r.period!==p.period||r.unit!=='TWD'||r.filters!=='全部地區、不含已取消訂單'||r.measure!=='含稅訂單金額') {errors.push(e.id+' 比較條件不一致');continue;}
        values.push({id:e.id,value:r.amount});facts.push({text:e.path+'：'+r.amount.toLocaleString('en-US')+' TWD',evidenceIds:[e.id]});
      } else {
        const row=e.excerpt.match(new RegExp('\\| '+p.product+' \\| '+p.period+' \\| (\\d+) \\|'));
        // 第一階段只解析受控範例的表格契約；一般文件只提供原文來源。
        if(row&&e.mock&&e.excerpt.includes('含稅訂單金額')&&e.excerpt.includes('不含已取消訂單')) {
          const amount=Number(row[1]);values.push({id:e.id,value:amount});facts.push({text:'文件記載：'+amount.toLocaleString('en-US')+' TWD',evidenceIds:[e.id]});
        }
      }
    }
    const doc=values.find(v=>v.id.startsWith('DOC'));
    if(!doc) errors.push('未取得符合範例表格契約的文件金額，無法完成文件交叉核對');
    if(values.length>1) for(const v of values.slice(1)) facts.push({text:'相較 '+values[0].id+'，'+v.id+' 差額為 '+(v.value-values[0].value).toLocaleString('en-US')+' TWD（程式計算）',evidenceIds:[values[0].id,v.id]});
    const conflict=new Set(values.map(v=>v.value)).size>1;
    return this.result(conflict?'來源數值有衝突，未設定優先規則，不能自行判定哪個正確':doc&&values.length>1?'已取得的文件與查詢數值一致':'已取得部分查詢資料，尚不能確認文件一致性',facts,[...errors,'全部業務金額為 Mock；查無資料不代表沒有異常','僅以範例對象、季度、TWD、含稅與取消條件進行程式比對']);
  }
  async completionReport(j){
    if(this.model.mode!=='real'||!j.ai||(!j.applied&&!j.creations))return;
    if(j.creations&&!j.creations.some(item=>item.status==='created')){
      j.result.answer='未建立任何新檔案。請展開詳細資訊查看略過或失敗的項目。';
      return;
    }
    const conciseVerification=v=>v?{status:v.status,kind:v.kind||null,exitCode:v.exitCode??null,message:String(v.message||'').slice(0,800)}:null;
    const changed=j.applied?{
      kind:'edit',file:path.basename(j.proposal.path),requestedSummary:j.tools.find(t=>t.name==='propose_edit')?.summary,
      applied:true,applicationMessage:j.applied.message,verification:conciseVerification(j.applied.verification)
    }:{kind:'new_files',files:j.creations.map(i=>({file:i.relativePath,purpose:i.purpose,status:i.status,error:i.error||null,verification:conciseVerification(i.result?.verification),warnings:i.result?.warnings||[]}))};
    const observed={request:j.question,status:j.status,changed,limitations:(j.result?.unknown||[]).map(value=>String(value).slice(0,800))};
    const fallback=j.applied?`已套用修改。靜態驗證：${j.applied.verification?.status||'未知'}；${String(j.applied.verification?.message||'未取得驗證結果').split(/\r?\n/)[0].slice(0,240)}。尚未執行瀏覽器功能測試。`:
      `已處理新增檔案提案：建立 ${j.creations.filter(i=>i.status==='created').length} 份、略過 ${j.creations.filter(i=>i.status==='skipped').length} 份、失敗 ${j.creations.filter(i=>i.status==='failed').length} 份。請展開詳細資訊檢查各檔案驗證結果。`;
    const log={name:'ai.completion_report',status:'running',mode:'real',attempt:1,startedAt:Date.now(),elapsedMs:0};j.tools.push(log);
    try{
      const beforeSend=async()=>{const root=j.scope.root(j.scope.targetProjectId);if(!root.permissions.ai)throw new Error('AI_PERMISSION：目前專案已撤銷 AI 外送授權');};
      const response=await this.model.finalAnswer([
        {role:'system',content:'你是程式助手。根據已發生的套用與驗證結果，以繁體中文撰寫給使用者的完整 Markdown 完工說明。說明改了什麼、實際驗證結果、未做或失敗的項目與下一步。只能使用所提供的觀測資料，不可聲稱瀏覽器測試通過、不可捏造檔案內容或隱藏失敗。不要輸出內部思考。'},
        {role:'user',content:JSON.stringify(observed)}
      ],j.controller.signal,beforeSend,attempt=>{log.attempt=attempt;j.ai.requests++;});
      j.result.answer=response.answer;j.result.origin='ai';if(response.usage)j.ai.usage.push(response.usage);
      log.status='ok';this.event(j,'已產生完工說明');
    }catch(e){
      j.result.answer=fallback;j.result.unknown.push('模型完工說明未取得：'+(e.code||'AI_ERROR')+'；上方為實際結果的固定摘要。');
      log.status='error';log.mode='error';log.code=e.code||'AI_ERROR';this.event(j,'完工說明未取得，保留實際結果摘要');
    }finally{log.elapsedMs=Date.now()-log.startedAt;j.finishedAt=Date.now();}
  }
  async decideNewFile(id,owner,itemId,decision){
    const j=this.get(id,owner),item=j.creations?.find(i=>i.status==='pending');
    if(j.status!=='awaiting_approval'||this.applying||!item||item.id!==itemId||!['create','skip'].includes(decision))throw new Error('請依序處理目前待確認的新檔案');
    this.applying=true;j.status='applying';
    const log={name:decision==='create'?'create_file':'skip_file',file:item.relativePath,startedAt:Date.now(),mode:'real',status:'running',attempt:1};j.tools.push(log);
    try{
      if(decision==='skip'){item.status='skipped';j.scope.workspace.proposals.delete(item.id);this.event(j,'已略過 '+item.relativePath);}
      else{item.result=await require('./new-files.js').apply(j.scope,item);log.verification=item.result.verification;this.event(j,'已建立 '+item.relativePath+' · '+item.result.verification.status);}
      log.status='ok';
    }catch(e){if(item.status!=='created')item.status='failed';item.error=e.message;log.status='error';log.message=e.message;this.event(j,'建立未完成：'+item.relativePath+' · '+e.message);}
    finally{
      log.elapsedMs=Date.now()-log.startedAt;this.applying=false;
      const pending=j.creations.some(i=>i.status==='pending');
      j.status=pending?'awaiting_approval':j.creations.some(i=>i.error||i.result?.verification.status==='failed')?'partial':'completed';j.finishedAt=pending?null:Date.now();
      const summary=`已建立 ${j.creations.filter(i=>i.status==='created').length} 份、略過 ${j.creations.filter(i=>i.status==='skipped').length} 份、待確認 ${j.creations.filter(i=>i.status==='pending').length} 份`;
      this.event(j,summary);j.result={...this.result(summary,[],j.creations.flatMap(i=>i.error?[i.error]:i.result?[i.relativePath+'：'+i.result.verification.message,...i.result.warnings]:[])),mock:false};
    }
    if(j.status!=='awaiting_approval')await this.completionReport(j);
    return this.public(j);
  }
  async apply(id,owner) {
    const j=this.get(id,owner);
    if(!j.proposal||j.status!=='awaiting_approval'||this.applying) throw new Error('任務不可套用或另有寫入正在進行');
    this.applying=true;j.status='applying';j.finishedAt=null;this.event(j,'正在套用修改與執行已授權靜態驗證');
    const log={name:'apply_edit',status:'running',mode:j.proposal.mock?'mock':'real',attempt:1,startedAt:Date.now(),path:j.proposal.path};j.tools.push(log);
    let failure;
    try {j.applied=await j.scope.apply(j.proposal);j.status=j.applied.verification.status==='failed'?'partial':'completed';this.event(j,'修改與靜態驗證完成');j.result={...this.result(j.applied.message,[],[j.applied.verification.message]),mock:j.proposal.mock};}
    catch(e) {failure=e;log.message=e.message;j.status='partial';j.result={...this.result('未完成套用或驗證',[],[e.message]),mock:!!j.proposal?.mock};}
    finally {j.finishedAt=Date.now();log.elapsedMs=j.finishedAt-log.startedAt;log.status=j.applied?'ok':'error';if(j.applied?.verification){log.verification=j.applied.verification;this.event(j,'靜態驗證：'+j.applied.verification.message);}else this.event(j,'套用未完成，請查看錯誤');this.applying=false;}
    if(j.proposal.source==='ai'&&j.applied)await this.completionReport(j);
    if(failure)throw failure;
    return this.public(j);
  }
}
module.exports={Engine};

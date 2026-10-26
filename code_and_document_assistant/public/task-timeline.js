// Present only observable actions and results. Never expose model reasoning.
function taskDuration(job){
  if(!Number.isFinite(job.startedAt))return '總耗時未知（舊紀錄）';
  const end=job.finishedAt||(!job.archived?Date.now():null);
  if(!end)return '總耗時未知（中斷紀錄）';
  return `總經過 ${Math.max(0,(end-job.startedAt)/1000).toFixed(1)} 秒（含確認等待）`;
}
function taskDetails(key,title,open=false){
  const detail=node('details',undefined,'task-detail'),summary=node('summary',title);
  detail.open=state.detailOpen.has(key)?state.detailOpen.get(key):open;
  const toggle=node('i',undefined,'task-toggle-icon fi fi-br-angle-small-'+(detail.open?'down':'right'));
  toggle.setAttribute('aria-hidden','true');
  summary.prepend(toggle);
  detail.addEventListener('toggle',()=>{toggle.className='task-toggle-icon fi fi-br-angle-small-'+(detail.open?'down':'right');});
  summary.addEventListener('click',()=>{
    const next=!detail.open;
    state.detailOpen.set(key,next);
    // The native details toggle event can be coalesced when a card contains
    // another details element; sync the icon after the browser applies open.
    queueMicrotask(()=>{toggle.className='task-toggle-icon fi fi-br-angle-small-'+(detail.open?'down':'right');});
  });
  detail.append(summary);return detail;
}
function timelineTaskDetails(key,title,kind){
  const detail=taskDetails(key,title,false),summary=detail.querySelector(':scope > summary'),toggle=summary.querySelector('.task-toggle-icon');
  const labels={ai:'AI',image:'Image',read:'Read',edit:'Edit',verify:'Verify',warning:'Warning',event:'Event'};
  summary.replaceChildren(toggle,taskIcon(kind),node('span',labels[kind]||'Event','timeline-step-label'),node('span',title,'timeline-step-preview'));
  detail.classList.add('timeline-step-detail');
  const content=node('div',undefined,'timeline-step-content');content.append(node('div',title,'timeline-step-full-text'));detail.append(content);
  return detail;
}
function taskIcon(kind){
  const names={ai:'br-brain-circuit',image:'rr-picture',read:'br-assessment',edit:'rc-settings-sliders',verify:'rr-memo-circle-check',warning:'br-file-exclamation',event:'rr-arrow-progress'};
  const i=node('i',undefined,'task-event-icon fi fi-'+names[kind]);i.setAttribute('aria-hidden','true');return i;
}
function taskStatus(tool){return {running:'執行中',ok:'完成',error:'失敗',retried:'重試'}[tool.status]||tool.status||'狀態未知';}
function shortTaskPath(full,relative){
  if(!full)return relative||'';
  const bits=String(full).split(/[\\/]/).filter(Boolean);
  return bits.slice(-2).join('\\');
}
function toolAction(job,tool){
  const elapsed=Number.isFinite(tool.elapsedMs)?` · ${tool.elapsedMs} ms`:'';
  const status=taskStatus(tool);
  if(tool.name==='ai.request')return {kind:'ai',text:`呼叫 ${job.ai?.model||'目前模型'} · ${status}${elapsed}`};
  if(tool.name==='ai.memory_summary')return {kind:'ai',text:`整理對話記憶 · ${status}${tool.summaryVersion?' · v'+tool.summaryVersion:''}${elapsed}`};
  if(tool.name==='search_documents')return {kind:'read',text:`搜尋文件${tool.query?'「'+tool.query+'」':''}${Number.isFinite(tool.resultCount)?` · 找到 ${tool.resultCount} 筆`:''}${elapsed}`};
  if(tool.name==='read_file')return {kind:'read',text:`讀取檔案 ${tool.path||tool.file||''} · ${status}${elapsed}`};
  if(tool.name==='propose_edit')return {kind:'edit',text:`提出修改 ${tool.path||tool.file||''}${tool.summary?'：'+tool.summary:''}`};
  if(tool.name==='propose_new_files'){
    const files=(tool.files||job.newFiles?.files||(job.creations||[]).map(file=>({path:file.relativePath,purpose:file.purpose}))).map(file=>`${file.path}${file.purpose?'（'+file.purpose+'）':''}`).join('、');
    return {kind:'edit',text:`提出建立 ${files||'新檔案'} · 等待逐檔確認`};
  }
  if(tool.name==='create_file'){
    const creation=(job.creations||[]).find(item=>item.path===tool.file||item.result?.path?.endsWith(tool.file||'\0'));
    return {kind:tool.status==='error'?'warning':'edit',text:`${tool.status==='error'?'建立失敗':'已建立'} ${shortTaskPath(creation?.result?.path,tool.file)}${elapsed}`};
  }
  if(tool.name==='skip_file')return {kind:'event',text:`已略過建立 ${tool.file||''}`};
  if(tool.name==='apply_edit')return {kind:tool.status==='error'?'warning':'edit',text:`${tool.status==='error'?'修改失敗':'已修改'} ${shortTaskPath(job.applied?.path,tool.file)}${elapsed}`};
  if(tool.name==='calculate')return {kind:'read',text:`計算數值 · ${status}${elapsed}`};
  if(tool.name==='finish')return {kind:'event',text:`整理回答 · ${status}${elapsed}`};
  return {kind:tool.status==='error'?'warning':'event',text:`${tool.name} · ${status}${elapsed}`};
}
function verificationAction(verification){
  const passed=verification?.status==='passed';
  return {kind:passed?'verify':'warning',text:`${verification?.kind||'靜態驗證'}${passed?'通過':'未通過'}${verification?.message?' · '+verification.message:''}`};
}
function timelineRows(job){
  const rows=[];
  for(const [index,image] of (job.images||job.attachments||[]).entries()){
    rows.push({key:'image-'+index,time:job.startedAt-index-1,kind:'image',text:`使用貼入圖片 ${image.name||image.filename||'圖片'} 作為參考`,technical:{name:image.name||image.filename,type:image.type||image.mimeType,size:image.size}});
  }
  for(const [index,event] of (job.events||[]).entries()){
    if(/^AI 規劃與核對|^正在|^搜尋文件$|^已建立 .+ · |^已建立 \d+ 份/.test(event.message||''))continue;
    rows.push({key:'event-'+index,time:Date.parse(event.time),kind:/失敗|取消|部分/.test(event.message)?'warning':'event',text:event.message,technical:event});
  }
  for(const [index,tool] of (job.tools||[]).entries()){
    const action=toolAction(job,tool);
    rows.push({key:'tool-'+index,time:tool.startedAt,tool,technical:tool, ...action});
    if(tool.verification){
      rows.push({key:'verification-'+index,time:Number.isFinite(tool.finishedAt)?tool.finishedAt:(tool.startedAt||Infinity)+1,verification:tool.verification,technical:tool.verification,...verificationAction(tool.verification)});
    }
  }
  const changed=(job.tools||[]).some(tool=>['create_file','apply_edit'].includes(tool.name)&&tool.status==='ok');
  if(changed&&!['running','awaiting_approval','applying'].includes(job.status)){
    rows.push({key:'browser-not-run',time:(job.finishedAt||Infinity)+1,kind:'warning',text:'未執行瀏覽器功能測試',technical:{status:'not_run',scope:'browser_functional_test'}});
  }
  return rows.sort((a,b)=>(a.time??Infinity)-(b.time??Infinity));
}
function iterationStage(job,iteration,stage,kind,label,text,keyPrefix=''){
  const key=job.id+keyPrefix+':iteration-'+iteration.index+':'+stage,detail=node('details',undefined,'task-detail agent-stage agent-stage-disclosure');
  detail.open=state.detailOpen.has(key)?state.detailOpen.get(key):false;
  const summary=node('summary',undefined,'agent-stage-summary'),toggle=node('i',undefined,'task-toggle-icon fi fi-br-angle-small-'+(detail.open?'down':'right'));
  toggle.setAttribute('aria-hidden','true');summary.append(toggle,taskIcon(kind),node('span',label,'agent-stage-label'),node('span',text,'agent-stage-text'));
  const full=node('div',text,'agent-stage-full');detail.append(summary,full);
  const sync=()=>{toggle.className='task-toggle-icon fi fi-br-angle-small-'+(detail.open?'down':'right');state.detailOpen.set(key,detail.open);};
  detail.addEventListener('toggle',sync);summary.addEventListener('click',()=>queueMicrotask(sync));
  return detail;
}
function renderAgentIteration(job,iteration,{keyPrefix='',open=false,title=`Iteration ${iteration.index}`,progressive=false}={}){
    const detail=taskDetails(job.id+keyPrefix+':iteration-'+iteration.index,title,open);
    detail.classList.add('agent-iteration');
    detail.dataset.iterationIndex=String(iteration.index);
    if(!progressive||iteration.decision||iteration.purpose)detail.append(iterationStage(job,iteration,'decide','ai','Decide',iteration.purpose||iteration.decision?.tool||'等待模型選擇操作',keyPrefix));
    if(!progressive||iteration.action)detail.append(iterationStage(job,iteration,'act','edit','Act',iteration.target||iteration.action?.tool||'尚未開始',keyPrefix));
    if(!progressive||iteration.observation)detail.append(iterationStage(job,iteration,'observe','read','Observe',iteration.observation||'pending',keyPrefix));
    const next=iteration.next||iteration.status;
    if(iteration.status==='repeat')detail.append(iterationStage(job,iteration,'repeat','event','Repeat',next,keyPrefix));
    else if(!progressive||iteration.status==='stop')detail.append(iterationStage(job,iteration,'stop',iteration.status==='stop'?'verify':'warning','Stop',next,keyPrefix));
    for(const preview of iteration.previews||[]){const source=node('div',undefined,'timeline-evidence');source.append(node('small',`${preview.id} · ${preview.name} · ${preview.location}`),node('pre',preview.excerpt));detail.append(source);}
    return detail;
}
function renderAgentIterations(job,panel){
  const iterations=job.iterations||[];
  for(const [index,iteration] of iterations.entries())panel.append(renderAgentIteration(job,iteration,{open:!job.archived&&index===iterations.length-1}));
}
function taskExecutionEntries(job){
  const iterations=job.iterations||[],groups=iterations.map(iteration=>({iteration,rows:[],time:iteration.startedAt})),entries=[];
  for(const row of timelineRows(job)){
    const tool=row.tool||job.tools?.[Number(row.key.match(/^verification-(\d+)$/)?.[1])];
    let group;
    if(tool&&(!String(tool.name||'').startsWith('ai.')||tool.name==='ai.request')){
      // Explicit round links take precedence over timestamps, which can coincide.
      if(Number.isInteger(tool.iterationIndex))group=groups.find(item=>item.iteration.index===tool.iterationIndex);
      else if(Number.isFinite(tool.startedAt))group=groups.findLast((item,index)=>Number.isFinite(item.time)&&tool.startedAt>=item.time&&(!Number.isFinite(groups[index+1]?.time)||tool.startedAt<groups[index+1].time));
    }
    // A pending model request is a real row, but does not create empty stages.
    if(group&&(group.iteration.decision||group.iteration.purpose||group.iteration.action||group.iteration.observation))group.rows.push(row);
    else entries.push({row,time:row.time});
  }
  entries.push(...groups.filter(group=>group.iteration.decision||group.iteration.purpose||group.iteration.action||group.iteration.observation));
  return entries.sort((a,b)=>(a.time??Infinity)-(b.time??Infinity));
}
function renderCurrentTaskIteration(job,panel){
  const current=node('div',undefined,'task-current-iteration');current.id='task-current-iteration-'+job.id;
  const entries=taskExecutionEntries(job),latestEntry=entries.findLast(entry=>entry.iteration?.decision||entry.iteration?.purpose)||entries.findLast(entry=>entry.iteration),latest=latestEntry?.iteration;
  const active=!job.archived&&['running','applying','awaiting_approval'].includes(job.status);
  const prior=state.activityIterations.get(job.id);
  if(latest){
    current.dataset.iterationIndex=String(latest.index);
    if(prior!==undefined&&prior!==latest.index){
      state.detailOpen.set(job.id+':current:iteration-'+prior,false);
      state.detailOpen.set(job.id+':current:iteration-'+latest.index,true);
    }
    state.activityIterations.set(job.id,latest.index);
  }
  if(latest){
    const purpose=node('strong',latest.purpose||latest.decision?.tool||'已記錄的操作','task-execution-purpose');purpose.id='task-execution-purpose-'+job.id;panel.append(purpose);
    const section=node('section',undefined,'task-execution-direction');section.dataset.iterationIndex=String(latest.index);
    const detail=renderAgentIteration(job,latest,{keyPrefix:':current',open:active,progressive:true});
    appendTimelineRows(job,detail,latestEntry.rows,':current');section.append(detail);current.append(section);
  }
  // Earlier steps remain in the full timeline; this area shows the latest action.
  const rows=entries.filter(entry=>entry.row&&(!latest||Number.isFinite(entry.time)&&entry.time>=latest.startedAt)).map(entry=>entry.row);
  appendTimelineRows(job,current,rows,':current');
  if(!job.archived&&job.status==='running'&&!job.iterations?.at(-1)?.decision)current.append(node('span','正在取得下一步操作','task-activity-hint'));
  else if(!entries.length)current.append(node('span',job.progress||'尚無執行紀錄','task-activity-hint'));
  panel.append(current);
}
function appendTimelineRows(job,panel,rows,keyPrefix=''){
  for(const row of rows){
    const detail=timelineTaskDetails(job.id+keyPrefix+':'+row.key,row.text,row.kind),content=detail.querySelector(':scope > .timeline-step-content');
    if(Number.isFinite(row.time))content.append(node('small',new Date(row.time).toLocaleString()));
    if(row.tool?.purpose)content.append(node('p','操作目的：'+row.tool.purpose,'timeline-operation'));
    if(row.tool?.target)content.append(node('p','操作對象：'+row.tool.target,'timeline-operation'));
    if(row.tool?.result)content.append(node('p','實際結果：'+row.tool.result,'timeline-operation'));
    if(row.verification){
      const view=node('button','View full verification output');view.id=`${keyPrefix?'current-':''}task-view-verification-${job.id}-${row.key}`;view.type='button';
      view.onclick=()=>{const panel=$('task-more-'+job.id);if(panel){panel.open=true;panel.scrollIntoView({behavior:'auto',block:'center'});}};content.append(view);
    }
    const technical=row.tool?.verification?{...row.tool,verification:{...row.tool.verification,output:undefined}}:row.technical;
    const technicalDetail=timelineTaskDetails(job.id+keyPrefix+':'+row.key+':technical','技術紀錄（JSON）','read');technicalDetail.querySelector(':scope > .timeline-step-content').append(node('pre',JSON.stringify(technical,null,2)));content.append(technicalDetail);panel.append(detail);
  }
}
function renderTaskTimeline(job,article){
  const panel=taskDetails(job.id+':timeline','執行紀錄 · '+(job.archived?'歷史':job.status),!job.archived&&['running','awaiting_approval','applying'].includes(job.status));
  panel.classList.add('task-timeline');panel.classList.toggle('is-live',!job.archived&&['running','awaiting_approval','applying'].includes(job.status));panel.id='timeline-'+job.id;
  const latest=job.iterations?.at(-1),tools=(job.tools||[]).filter(tool=>!String(tool.name||'').startsWith('ai.')),conclusion=job.result?.conclusions?.[0]||job.progress||'尚待整理';
  const inline=latest?`第 ${latest.index||job.iterations.length} 輪 · ${latest.purpose||latest.decision?.tool||'規劃處理'} · ${latest.target||latest.action?.tool||'等待執行'}`:`工具／修改：${tools.slice(-3).map(tool=>tool.name).join('、')||'尚無紀錄'} · 結論：${conclusion}`;
  panel.firstChild.append(node('span',inline,'timeline-summary-inline'));
  renderAgentIterations(job,panel);
  const rows=timelineRows(job);
  appendTimelineRows(job,panel,rows);
  if(!rows.length)panel.append(node('p','尚無執行紀錄'));
  article.append(panel);
}
function taskOutcome(job){
  if(job.imageProjectChat||!['completed','partial','failed','cancelled','needs_input'].includes(job.status))return null;
  const completed=[],pending=[],verification=[],passedMessages=new Set();
  const addVerification=(label,result)=>{
    if(!result)return;
    const status={passed:'通過',failed:'失敗',not_run:'未執行',unavailable:'無法執行'}[result.status]||result.status||'結果未知';
    verification.push(`${label}：${status}${result.message?' · '+result.message:''}`);
    if(result.status==='passed'&&result.message)passedMessages.add(result.message);
  };
  if(job.applied){completed.push(`${job.restored?'已還原':'已修改'} ${job.applied.path||job.proposal?.path||'檔案'}`);addVerification('套用後靜態驗證',job.applied.verification);}
  else if(job.proposal)pending.push(`修改提案尚未套用：${job.proposal.path||'檔案'}`);
  for(const file of job.creations||[]){
    if(file.status==='created'){completed.push(`已建立 ${file.relativePath}`);addVerification(file.relativePath+' 的靜態驗證',file.result?.verification);}
    else pending.push(`${{skipped:'已略過，未建立',failed:'建立失敗',cancelled:'已取消，未建立',pending:'尚待確認建立'}[file.status]||file.status}：${file.relativePath}${file.error?' · '+file.error:''}`);
  }
  for(const tool of job.tools||[]){
    if(tool.status==='error')pending.push(`${tool.name} 失敗${tool.message||tool.result||tool.code?'：'+(tool.message||tool.result||tool.code):''}`);
    if(tool.name==='propose_edit'&&tool.verification)addVerification('候選修改預檢',tool.verification);
  }
  const run=job.serviceRun;
  if(run){
    if(run.status==='running')completed.push(`服務已啟動：${run.entry} · 127.0.0.1:${run.port}`);
    else pending.push(`服務狀態：${run.status} · ${run.entry} · Port ${run.port}`);
    const check=run.initialMonitor?.checks?.[0];
    if(check)verification.push(`啟動時程序／Port 檢查：${check.processAlive&&check.portOpen?'通過':'未通過'}${check.error?' · '+check.error:''}`);
    if(run.apiVerification)verification.push(`API 驗證：${run.apiVerification.passed?'通過':'失敗'} · ${run.apiVerification.method} ${run.apiVerification.path}${run.apiVerification.actualStatus?' · HTTP '+run.apiVerification.actualStatus:''}`);
    else verification.push('API 回應驗證：未執行');
  }
  for(const text of job.result?.unknown||[]){
    if(/^AI 語意判斷不構成正確性保證/.test(text)||[...passedMessages].some(message=>text===message||text.endsWith('：'+message)))continue;
    pending.push('待確認：'+text);
  }
  if(!completed.length&&job.status==='completed'&&!job.creations?.length&&!job.proposal&&!run)completed.push(...(job.result?.conclusions?.length?job.result.conclusions:['已提供本次回答']));
  if(!completed.length)completed.push('尚無可確認已完成的項目；已取得的結果保留於最終回答與執行紀錄。');
  if(!pending.length)pending.push(job.status==='completed'?'未記錄其他待辦項目。':'流程未完整結束，請查看最終回答及執行紀錄。');
  if(!verification.length)verification.push('未記錄實際執行的驗證。');
  const changed=job.applied||(job.creations||[]).some(file=>file.status==='created');
  if(changed)verification.push('瀏覽器功能驗證：未執行。');
  return {completed:[...new Set(completed)],pending:[...new Set(pending)],verification:[...new Set(verification)]};
}
function selectTask(id){const job=state.taskJobs.get(id);if(!job||state.selectedTask===id)return;state.selectedTask=id;show(job);}
setInterval(()=>{
  if(document.hidden)return;
  for(const [id,job] of state.taskJobs){
    if(job.archived||!['running','awaiting_approval','applying'].includes(job.status))continue;
    const duration=state.articles.get(id)?.querySelector('.task-duration');if(duration)duration.textContent=taskDuration(job);
    if(state.selectedTask===id)$('inspector-duration').textContent=taskDuration(job);
  }
},1000);

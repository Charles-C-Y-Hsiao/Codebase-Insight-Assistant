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
function iterationStage(kind,text){
  const row=node('div',undefined,'agent-stage');
  row.append(taskIcon(kind),node('span',text));
  return row;
}
function renderAgentIterations(job,panel){
  const iterations=job.iterations||[];
  if(!iterations.length)return;
  const latest=iterations.length-1;
  for(const [index,iteration] of iterations.entries()){
    const detail=taskDetails(job.id+':iteration-'+iteration.index,`Iteration ${iteration.index}`,!job.archived&&index===latest);
    detail.classList.add('agent-iteration');
    detail.append(iterationStage('ai',`Decide · ${iteration.purpose||iteration.decision?.tool||'等待模型選擇操作'}`));
    detail.append(iterationStage('edit',`Act · ${iteration.target||iteration.action?.tool||'尚未開始'}`));
    detail.append(iterationStage('read',`Observe · ${iteration.observation||'pending'}`));
    detail.append(iterationStage(iteration.status==='repeat'?'event':iteration.status==='stop'?'verify':'warning',`${iteration.status==='repeat'?'Repeat':'Stop'} · ${iteration.next||iteration.status}`));
    for(const preview of iteration.previews||[]){const source=node('div',undefined,'timeline-evidence');source.append(node('small',`${preview.id} · ${preview.name} · ${preview.location}`),node('pre',preview.excerpt));detail.append(source);}
    panel.append(detail);
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
  for(const row of rows){
    const detail=taskDetails(job.id+':'+row.key,row.text);detail.firstChild.prepend(taskIcon(row.kind));
    if(Number.isFinite(row.time))detail.append(node('small',new Date(row.time).toLocaleString()));
    if(row.tool?.purpose)detail.append(node('p','操作目的：'+row.tool.purpose,'timeline-operation'));
    if(row.tool?.target)detail.append(node('p','操作對象：'+row.tool.target,'timeline-operation'));
    if(row.tool?.result)detail.append(node('p','實際結果：'+row.tool.result,'timeline-operation'));
    if(row.verification){
      const view=node('button','View full verification output');view.id=`task-view-verification-${job.id}-${row.key}`;view.type='button';
      view.onclick=()=>{const panel=$('task-more-'+job.id);if(panel){panel.open=true;panel.scrollIntoView({behavior:'auto',block:'center'});}};detail.append(view);
    }
    const technical=row.tool?.verification?{...row.tool,verification:{...row.tool.verification,output:undefined}}:row.technical;
    const technicalDetail=taskDetails(job.id+':'+row.key+':technical','技術紀錄（JSON）');technicalDetail.append(node('pre',JSON.stringify(technical,null,2)));detail.append(technicalDetail);panel.append(detail);
  }
  if(!rows.length)panel.append(node('p','尚無執行紀錄'));
  article.append(panel);
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

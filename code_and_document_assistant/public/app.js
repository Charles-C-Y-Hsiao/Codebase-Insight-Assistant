const $=id=>document.getElementById(id);
const state={csrf:'',files:[],selected:new Set(),job:null,request:null,editor:null,articles:new Map(),project:'demo',references:[],conversation:'',catalog:[],epoch:0,verificationRules:[]};
Object.assign(state,{taskJobs:new Map(),detailOpen:new Map(),questionExpanded:new Set(),selectedTask:null,polls:new Map(),inspectorActivityOpen:new Map()});
Object.assign(state,{draftImages:[],imageLimitMB:10,imageReady:false,imageQueue:Promise.resolve(),imagesSupported:false});
initAttachments();
Object.assign(state,{openProjects:new Set(),conversationLists:new Map(),questionBaseline:'',editorBaseline:'',mode:'query',openedDiffs:new Set(),grantedProject:null});
Object.assign(state,{memory:null,activeSkill:null,skillSuggestions:[],skillTimer:null});
Object.assign(state,{imageGeneration:{enabled:false,model:null},imagePreviousJobId:null});
Object.assign(state,{imageProjectGeneration:{enabled:false,model:null},imageProjects:[],imageProjectId:null,imageSeriesId:null,imageSeriesExpanded:new Set(),imageWorkspaceActive:false,imageCreationMode:false,serviceMode:'mock',imageSummaryCandidate:null,workspaceSectionSelection:null});
Object.assign(state,{editingTask:null});
try{state.openProjects=new Set(JSON.parse(sessionStorage.getItem('cda.openProjects')||'[]'));}catch{}
try{state.project=sessionStorage.getItem('cda.project')||'demo';}catch{}
try{const selection=sessionStorage.getItem('cda.workspaceSectionSelection');state.workspaceSectionSelection=['project','image'].includes(selection)?selection:null;}catch{}
function bindWorkspaceHover(element){
  if(!element||element.dataset.workspaceHoverBound)return;
  element.dataset.workspaceHoverBound='true';
  element.addEventListener('pointerenter',()=>{const sidebar=document.getElementById('workspace-sidebar');if(!sidebar)return;sidebar.dataset.hoverTarget=element.id;sidebar.querySelectorAll('.workspace-hover').forEach(item=>item.classList.remove('workspace-hover'));element.classList.add('workspace-hover');});
  element.addEventListener('pointerleave',()=>{const sidebar=document.getElementById('workspace-sidebar');if(!sidebar||sidebar.dataset.hoverTarget!==element.id)return;delete sidebar.dataset.hoverTarget;element.classList.remove('workspace-hover');});
}
bindWorkspaceHover(document.getElementById('project-heading-main'));bindWorkspaceHover(document.getElementById('image-project-section-toggle'));
const panelStorage={left:'cda.sidebar.collapsed',right:'cda.inspector.collapsed'};
function setPanel(side,collapsed,persist=true){
  const layout=document.querySelector('.layout'),left=side==='left',button=$(left?'sidebarToggle':'inspectorToggle');
  layout.classList.toggle(left?'sidebar-collapsed':'inspector-collapsed',collapsed);
  button.setAttribute('aria-expanded',String(!collapsed));
  const label=(collapsed?'展開':'收合')+(left?'工作區':'執行詳情');
  button.title=label;button.setAttribute('aria-label',label);
  button.querySelector('.fi').className='fi fi-br-angle-small-'+(left?(collapsed?'right':'left'):(collapsed?'left':'right'));
  if(persist)try{localStorage.setItem(panelStorage[side],collapsed?'1':'0');}catch{}
}
function initPanels(){
  let left=false,right=false;try{left=localStorage.getItem(panelStorage.left)==='1';right=localStorage.getItem(panelStorage.right)==='1';}catch{}
  setPanel('left',left,false);setPanel('right',right,false);
  $('sidebarToggle').addEventListener('click',()=>setPanel('left',!document.querySelector('.layout').classList.contains('sidebar-collapsed')));
  $('inspectorToggle').addEventListener('click',()=>setPanel('right',!document.querySelector('.layout').classList.contains('inspector-collapsed')));
}
initPanels();
function initInspectorResizer(){
  const layout=document.querySelector('.layout'),resizer=$('inspector-resizer');if(!layout||!resizer)return;
  const minWidth=()=>window.innerWidth<=1150?280:330;
  const applyWidth=width=>{layout.style.setProperty('--inspector-width',`${Math.round(width)}px`);resizer.setAttribute('aria-valuenow',String(Math.round(width)));};
  let width=Math.max(minWidth(),Number(localStorage.getItem('cda.inspector.width'))||minWidth());applyWidth(width);
  const clamp=clientX=>{const box=layout.getBoundingClientRect(),sidebar=$('workspace-sidebar').getBoundingClientRect(),maximum=Math.max(minWidth(),box.width-sidebar.width-330);return Math.min(maximum,Math.max(minWidth(),box.right-clientX));};
  let dragging=false;
  resizer.addEventListener('pointerdown',event=>{if(document.querySelector('.layout').classList.contains('inspector-collapsed'))return;dragging=true;resizer.setPointerCapture(event.pointerId);resizer.classList.add('is-dragging');document.body.classList.add('resizing-inspector');});
  resizer.addEventListener('pointermove',event=>{if(dragging){width=clamp(event.clientX);applyWidth(width);}});
  resizer.addEventListener('pointerup',event=>{if(!dragging)return;dragging=false;resizer.releasePointerCapture(event.pointerId);resizer.classList.remove('is-dragging');document.body.classList.remove('resizing-inspector');localStorage.setItem('cda.inspector.width',String(parseInt(resizer.getAttribute('aria-valuenow'),10)));});
  resizer.addEventListener('keydown',event=>{const step=event.shiftKey?50:20;if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();width=Math.max(minWidth(),width+(event.key==='ArrowLeft'?step:-step));applyWidth(width);localStorage.setItem('cda.inspector.width',String(width));}});
  window.addEventListener('resize',()=>{width=Math.max(minWidth(),parseInt(resizer.getAttribute('aria-valuenow'),10)||minWidth());applyWidth(width);});
}
initInspectorResizer();
new ResizeObserver(()=>document.documentElement.style.setProperty('--scope-offset',($('scope-banner').offsetHeight+16)+'px')).observe($('scope-banner'));
$('mode-query').onclick=()=>setMode('query');
$('mode-edit').onclick=()=>setMode('edit');
$('ai-allow-edits').onchange=()=>{if(!$('ai-allow-edits').checked&&state.mode==='ai-edit')setMode('query');};
const historyBottomButton=$('scroll-history-bottom'),historyElement=$('history');
function collapseComposerForExecution(){const panel=$('composer-panel');if(panel.open)panel.open=false;panel.classList.remove('image-memory-expanded');if(!$('composer-menu').hidden)setComposerMenu(false);}
function restoreComposerAfterExecution(){$('composer-panel').open=true;}
function moveHistoryToBottom(){requestAnimationFrame(()=>historyBottomButton.click());}
function sortHistoryTasks(){
  const cards=[...historyElement.querySelectorAll('article[id^="task-"]')].map((card,index)=>({card,index,job:state.taskJobs.get(card.id.slice(5))}));
  cards.sort((a,b)=>((Number(a.job?.startedAt)||Number(a.job?.finishedAt)||0)-(Number(b.job?.startedAt)||Number(b.job?.finishedAt)||0))||a.index-b.index);
  for(const [order,{card}] of cards.entries()){card.style.order=String(order);historyElement.append(card);}
}
const positionHistoryBottomButton=()=>{const historyBox=historyElement.getBoundingClientRect(),workflowBox=$('workflow-header').getBoundingClientRect(),scrollBox=$('main-scroll').getBoundingClientRect(),historyTop=Math.max(historyBox.top,scrollBox.top),historyBottom=Math.min(historyBox.bottom,scrollBox.bottom);if(historyBottom<=historyTop){historyBottomButton.style.visibility='hidden';return;}historyBottomButton.style.visibility='';historyBottomButton.style.left=`${Math.min(Math.max(workflowBox.left+workflowBox.width/2,scrollBox.left+20),scrollBox.right-20)}px`;historyBottomButton.style.top=`${workflowBox.bottom+15}px`;};
historyBottomButton.onclick=()=>[...historyElement.querySelectorAll(':scope > article:not([hidden])')].at(-1)?.scrollIntoView({behavior:'auto',block:'end'});
const setHistoryBottomVisible=visible=>historyBottomButton.classList.toggle('is-visible',visible);
historyElement.addEventListener('pointerenter',()=>setHistoryBottomVisible(true));
historyElement.addEventListener('pointerleave',event=>{if(!historyBottomButton.contains(event.relatedTarget))setHistoryBottomVisible(false);});
historyBottomButton.addEventListener('pointerenter',()=>setHistoryBottomVisible(true));
historyBottomButton.addEventListener('pointerleave',event=>{if(!historyElement.contains(event.relatedTarget))setHistoryBottomVisible(false);});
$('main-scroll').addEventListener('focusin',event=>{if(historyElement.contains(event.target))setHistoryBottomVisible(true);});
$('main-scroll').addEventListener('focusout',event=>{if(!historyElement.contains(event.relatedTarget)&&event.relatedTarget!==historyBottomButton)setHistoryBottomVisible(false);});
$('main-scroll').addEventListener('scroll',positionHistoryBottomButton,{passive:true});
window.addEventListener('resize',positionHistoryBottomButton);
new MutationObserver(positionHistoryBottomButton).observe(historyElement,{childList:true});
const moveApplyButtonsIntoDiffToolbars=()=>{for(const button of historyElement.querySelectorAll('button[id^="apply-edit-"]')){const toolbar=$('diff-view-toolbar-'+button.dataset.jobId);if(toolbar&&!toolbar.contains(button))toolbar.append(button);}};
new MutationObserver(moveApplyButtonsIntoDiffToolbars).observe(historyElement,{childList:true,subtree:true});
historyElement.addEventListener('click',event=>{const button=event.target.closest('button[id^="apply-edit-"]');if(button){event.preventDefault();event.stopImmediatePropagation();applyTaskUpdate(button.dataset.jobId,button);}},true);
positionHistoryBottomButton();
$('skill-panel').addEventListener('toggle',()=>{$('skill-panel-toggle-icon').className='fi fi-br-angle-small-'+($('skill-panel').open?'down':'right');});
$('memory-details').addEventListener('toggle',()=>{$('memory-toggle-icon').className='fi fi-br-angle-small-'+($('memory-details').open?'down':'right');});
for(const [detailId,iconId] of [['global-reference-panel','global-reference-toggle-icon'],['files-panel','files-toggle-icon'],['connections-panel','connections-toggle-icon'],['verification-rules-panel','verification-rules-toggle-icon'],['issues-panel','issues-toggle-icon'],['registry-panel','registry-toggle-icon'],['version-panel','version-toggle-icon'],['demo-panel','demo-toggle-icon'],['project-builder','project-builder-toggle-icon'],['manual-editor','manual-editor-toggle-icon'],['edit-result-panel','edit-result-toggle-icon'],['composer-panel','composer-panel-toggle-icon'],['root-permission-panel','root-permission-toggle-icon']]){const detail=$(detailId),icon=$(iconId),sync=()=>{icon.className='fi fi-br-angle-small-'+(detail.open?'down':'right');};detail.addEventListener('toggle',sync);sync();}
function closeOtherRootDetails(active){const panel=$('root-permission-panel');if(active!==panel)panel.open=false;document.querySelectorAll('#roots details').forEach(detail=>{if(detail!==active)detail.open=false;});}
$('root-permission-panel').addEventListener('toggle',()=>{if($('root-permission-panel').open)closeOtherRootDetails($('root-permission-panel'));});
$('open-permission').onclick=()=>openPermission();
$('close-permission').onclick=()=>$('permission-dialog').close();
$('add-reference').onclick=()=>{$('reference-error').textContent='';$('reference-dialog').showModal();};
$('close-reference').onclick=()=>$('reference-dialog').close();
$('open-granted-project').onclick=async()=>{try{const id=state.grantedProject;if(id===state.project){$('permission-dialog').close();return;}if(await switchProject(id))$('permission-dialog').close();}catch(e){fail(e);}};
window.addEventListener('beforeunload',e=>{if(hasDraft()){e.preventDefault();e.returnValue='';}});
function node(tag,text,cls){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;}
function lineChangeCounts(before,after){
  const a=String(before||'').split(/\r?\n/),b=String(after||'').split(/\r?\n/);
  if(a.length*b.length>250000)return {added:'?',removed:'?'};
  let previous=new Uint32Array(b.length+1);
  for(let i=1;i<=a.length;i++){const current=new Uint32Array(b.length+1);for(let j=1;j<=b.length;j++)current[j]=a[i-1]===b[j-1]?previous[j-1]+1:Math.max(previous[j],current[j-1]);previous=current;}
  return {added:b.length-previous[b.length],removed:a.length-previous[b.length]};
}
function updateTaskFloatingBadge(){
  const badge=$('task-update-floating'),label=$('task-update-floating-label'),action=$('task-update-floating-action');if(!badge)return;
  const jobs=[...state.taskJobs.values()].filter(job=>job.conversationId===state.conversation&&job.projectId===state.project&&!job.archived&&['running','applying','awaiting_approval'].includes(job.status)&&(job.allowEdits||job.proposal));
  const job=jobs.find(item=>item.id===state.selectedTask)||jobs.at(-1);if(!job){badge.hidden=true;action.onclick=null;label.onclick=null;label.onkeydown=null;$('execution-update-preview')?.remove();return;}
  if(!job.proposal){label.textContent='程式更新處理中';label.onclick=null;label.onkeydown=null;action.hidden=true;action.onclick=null;badge.hidden=false;return;}
  const counts=lineChangeCounts(job.proposal.before,job.proposal.after);label.textContent=`待確認修改 · +${counts.added} 行 · −${counts.removed} 行`;
  const open=()=>openExecutionDiff(job.id);label.onclick=open;label.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();open();}};action.hidden=false;action.onclick=()=>applyTaskUpdate(job.id,action);badge.hidden=false;
}
let taskUpdateApplying=false,taskUpdateFocus=null;
function setTaskUpdateOverlay(active){
  const overlay=$('task-update-overlay'),layout=document.querySelector('.layout');overlay.hidden=!active;layout.inert=active;document.body.classList.toggle('task-update-blocked',active);
  if(active){taskUpdateFocus=document.activeElement;overlay.focus();}else if(taskUpdateFocus?.isConnected){taskUpdateFocus.focus();taskUpdateFocus=null;}
}
function confirmForceApply(job){
  return new Promise(resolve=>{
    const dialog=$('force-apply-dialog'),check=$('force-apply-confirm'),confirm=$('confirm-force-apply');let settled=false;
    const finish=value=>{if(settled)return;settled=true;dialog.oncancel=null;dialog.close();resolve(value);};
    $('force-apply-message').textContent=`${shortTaskPath(job.proposal.path,job.proposal.path)} 的候選內容未通過預檢：${job.preflight?.message||'未提供原因'}。`;check.checked=false;confirm.disabled=true;
    check.onchange=()=>{confirm.disabled=!check.checked;};confirm.onclick=()=>finish(true);$('cancel-force-apply').onclick=()=>finish(false);dialog.oncancel=event=>{event.preventDefault();finish(false);};dialog.showModal();
  });
}
async function applyTaskUpdate(id,button){
  if(taskUpdateApplying)return;const job=state.taskJobs.get(id);if(!job?.proposal||job.status!=='awaiting_approval')return;
  const adminCode=$('admin').value.trim();
  const force=job.preflight?.status==='failed';if(force&&!await confirmForceApply(job))return;
  taskUpdateApplying=true;let adminError=false;button?.classList.add('is-processing');button?.setAttribute('aria-busy','true');if(button)button.disabled=true;setTaskUpdateOverlay(true);
  try{const result=await api('/api/jobs/'+id+'/apply',{adminToken:adminCode,force});show(result);if(taskIsLive(result))poll(result).catch(fail);await inventory();}
  catch(error){adminError=/管理碼|主機端確認/.test(error.message);fail(error);try{show(await api('/api/jobs/'+id));}catch{}}
  finally{taskUpdateApplying=false;setTaskUpdateOverlay(false);if(button?.isConnected){button.disabled=false;button.classList.remove('is-processing');button.removeAttribute('aria-busy');}if(adminError){openPermission();$('permission-error').textContent='此專案的確認已到期，或服務已重啟；請輸入本次服務的新管理碼。';$('admin').select();}}
}
function openExecutionDiff(id){
  const job=state.taskJobs.get(id);if(!job?.proposal)return;
  state.selectedTask=id;show(job);setPanel('right',false);
  const content=$('execution-inspector-content');let preview=$('execution-update-preview');
  if(!preview){preview=node('div',undefined,'execution-update-preview');preview.id='execution-update-preview';content.append(preview);}
  preview.replaceChildren(node('p',`程式差異：${shortTaskPath(job.proposal.path,job.proposal.path)}`),createDiffViewer(job,'execution-'));
  const comparison=$('execution-diff-details-'+job.id);if(comparison)comparison.open=true;
  requestAnimationFrame(()=>preview.scrollIntoView({behavior:'smooth',block:'center'}));
}
function taskActivityText(job){
  if(['queued','running'].includes(job.activitySummary?.status))return '正在整理工作摘要';
  if(['running','applying'].includes(job.status))return `執行中 · ${job.progress||'處理中'}`;
  return job.status==='completed'?'已完成':taskHeadline(job);
}
function taskActivityPreview(job){
  const iteration=job.iterations?.at(-1),tools=(job.tools||[]).filter(tool=>!String(tool.name||'').startsWith('ai.'));
  if(['queued','running'].includes(job.activitySummary?.status)||['running','applying'].includes(job.status)){
    if(iteration)return `第 ${iteration.index||job.iterations.length} 輪 · ${iteration.purpose||iteration.decision?.tool||'規劃處理'} · ${iteration.target||iteration.action?.tool||'等待執行'} · ${iteration.observation||'處理中'}`;
    const latest=tools.at(-1);if(latest)return `正在處理 · ${latest.name}${latest.status?' · '+latest.status:''}${latest.target||latest.path||latest.file?' · '+(latest.target||latest.path||latest.file):''}`;
    return '正在整理目前這一波的處理步驟與工具結果。';
  }
  const toolText=tools.slice(-4).map(tool=>tool.name||'工具').join('、')||'尚無工具紀錄';
  const conclusion=job.result?.conclusions?.[0]||job.progress||'已完成處理';
  return `需求：${job.question||'未提供'} · 工具／修改：${toolText} · 結論：${conclusion}`;
}
function renderTaskActivity(job){
  const live=['running','applying'].includes(job.status)||['queued','running'].includes(job.activitySummary?.status);
  const panel=taskDetails(job.id+':activity',taskActivityText(job),false),summary=panel.querySelector('summary');
  panel.classList.add('task-activity');panel.classList.toggle('is-live',live);panel.id='task-activity-'+job.id;
  summary.replaceChildren(summary.querySelector('.task-toggle-icon'),node('span',taskActivityText(job),'task-activity-label'));
  panel.addEventListener('toggle',()=>{if(panel.open)openExecutionActivity(job.id,{refresh:state.selectedTask!==job.id});});
  if(job.activitySummary?.answer){const content=taskAnswer(job.activitySummary.answer);content.classList.add('task-activity-summary');panel.append(content);}
  else panel.append(node('p',taskActivityPreview(job),'task-activity-hint'));
  return panel;
}
function inspectorDetails(id,title,open=false){
  const detail=node('section',undefined,'task-detail execution-activity-details'),summary=node('button',undefined,'execution-activity-toggle'),toggle=node('i',undefined,'task-toggle-icon fi fi-br-angle-small-'+(open?'down':'right')),content=node('div',undefined,'execution-activity-detail-content');
  const expanded=state.inspectorActivityOpen.has(id)?state.inspectorActivityOpen.get(id):open;
  detail.id=id;summary.type='button';summary.setAttribute('aria-expanded',String(expanded));toggle.className='task-toggle-icon fi fi-br-angle-small-'+(expanded?'down':'right');toggle.setAttribute('aria-hidden','true');summary.append(toggle,node('span',title));content.hidden=!expanded;
  summary.addEventListener('click',()=>{const next=content.hidden;state.inspectorActivityOpen.set(id,next);content.hidden=!next;summary.setAttribute('aria-expanded',String(next));toggle.className='task-toggle-icon fi fi-br-angle-small-'+(next?'down':'right');});
  detail.append(summary,content);detail.content=content;return detail;
}
function openExecutionActivity(id,{refresh=true}={}){
  const job=state.taskJobs.get(id);if(!job)return;
  state.selectedTask=id;if(refresh)show(job);setPanel('right',false);
  const content=$('execution-inspector-content');let preview=$('execution-activity-preview'),created=false;
  if(!preview){preview=node('section',undefined,'execution-activity-preview');preview.id='execution-activity-preview';content.append(preview);created=true;}
  preview.replaceChildren(node('p',taskActivityText(job),'execution-activity-status'));
  const summary=job.activitySummary?.answer&&inspectorDetails('execution-activity-summary-'+job.id,'AI 工作摘要',true);
  if(summary){summary.content.append(taskAnswer(job.activitySummary.answer));preview.append(summary);}
  const events=inspectorDetails('execution-activity-events-'+job.id,'公開事件');
  for(const event of job.events||[])events.content.append(node('p',event.message,'execution-activity-row'));
  if(!job.events?.length)events.content.append(node('p','尚無公開事件。','muted'));preview.append(events);
  const operations=inspectorDetails('execution-activity-operations-'+job.id,'操作與驗證');
  for(const tool of job.tools||[]){const line=[tool.name,tool.status,tool.purpose||tool.target||tool.result,tool.verification?.message].filter(Boolean).join(' · ');operations.content.append(node('p',line,'execution-activity-row'));}
  if(!job.tools?.length)operations.content.append(node('p','尚無工具紀錄。','muted'));preview.append(operations);
  if(created)requestAnimationFrame(()=>preview.scrollIntoView({behavior:'auto',block:'nearest'}));
}
const editNotice=node('div',undefined,'task-edit-notice');editNotice.hidden=true;
const editNoticeText=node('span'),cancelEdit=node('button','取消編輯');cancelEdit.type='button';cancelEdit.id='task-edit-cancel';
editNotice.append(editNoticeText,cancelEdit);$('question').parentElement.before(editNotice);
function endTaskEdit(clear=true){state.editingTask=null;editNotice.hidden=true;if(clear){$('question').value='';state.questionBaseline='';renderSkillSuggestions();}}
cancelEdit.onclick=()=>endTaskEdit();
async function editTask(job,version=job){
  if(!await allowSwitch())return;
  setMode(job.allowEdits?'ai-edit':'query');state.activeSkill=null;state.imagePreviousJobId=null;
  state.editingTask={editJobId:job.id,sourceVersion:version.revision||1};
  $('question').value=version.question;state.questionBaseline='';editNoticeText.textContent=`編輯需求 v${version.revision||1}（送出後建立新版本）`;editNotice.hidden=false;
  $('question').focus();renderSkillSuggestions();
}
function chooseContinuation(data){
  return new Promise(resolve=>{const dialog=node('dialog',undefined,'task-continuation-dialog');dialog.append(node('p',data.message));
    const finish=id=>{dialog.close();dialog.remove();resolve(id);};
    for(const item of data.candidates){const button=node('button',item.question);button.type='button';button.onclick=()=>finish(item.id);dialog.append(button);}
    const cancel=node('button','取消');cancel.type='button';cancel.onclick=()=>finish(null);dialog.append(cancel);dialog.addEventListener('cancel',e=>{e.preventDefault();finish(null);});document.body.append(dialog);dialog.showModal();});
}
const permissionPanel=$('root-permission-panel'),permissionFields=$('permission-fields'),permissionActions=$('permission-actions');
if(permissionPanel&&permissionFields&&permissionActions){const permissionContent=node('div',undefined,'permission-content');permissionContent.append(permissionFields,permissionActions);permissionPanel.append(permissionContent);}
const permissionHelp=$('root-permission-help'),folderLabel=$('folder-label'),folderInput=$('folder');
if(permissionHelp&&folderLabel&&folderInput){const folderNote=node('small','請輸入執行本服務的主機資料夾路徑，不是從瀏覽器上傳位置。下方可設定搜尋、修改、驗證、AI 權限與授權分鐘。');folderNote.id='folder-help';folderLabel.insertBefore(folderNote,folderInput);for(const child of [...folderLabel.childNodes])if(child.nodeType===Node.TEXT_NODE&&child.textContent.includes('完整路徑'))child.remove();permissionHelp.remove();}
const requestRoot=$('request-root'),approveRoot=$('approve-root');
if(requestRoot&&!$('request-root-help')){const note=node('small','先提出授權申請；此步驟不會立即讀取或修改資料夾。');note.id='request-root-help';requestRoot.before(note);}
if(approveRoot&&!$('approve-root-help')){const note=node('small','輸入本機管理碼確認後，才會正式授予權限並開始索引。');note.id='approve-root-help';const group=node('div',undefined,'approve-root-group');group.append(note,approveRoot);$('permission-actions').append(group);}
const refreshButton=$('refresh'),indexStatus=$('index-status');
if(refreshButton&&indexStatus&&!$('refresh-label')){const parent=refreshButton.parentElement,label=node('label');label.id='refresh-label';label.className='refresh-label';label.htmlFor='refresh';parent.insertBefore(label,refreshButton);label.append(refreshButton,indexStatus);}
async function api(url,body,projectOverride,method=body===undefined?'GET':'POST'){const epoch=state.epoch;const response=await fetch(url,{method,headers:{'Content-Type':'application/json','X-CDA-Token':state.csrf,'X-CDA-Project':projectOverride||state.project,'X-CDA-References':JSON.stringify(projectOverride?[]:state.references),...(!projectOverride&&state.conversation?{'X-CDA-Conversation':state.conversation}:{})},body:body===undefined?undefined:JSON.stringify(body)});const data=await response.json();if(epoch!==state.epoch){const e=new Error('專案已切換');e.stale=true;throw e;}if(!response.ok)throw new Error(data.error||'請求失敗');return data;}
function fail(e){if(!e.stale){$('notice').textContent=e.message;if($('permission-dialog').open)$('permission-error').textContent=e.message;if($('reference-dialog').open)$('reference-error').textContent=e.message;}}
function hasDraft(){return $('question').value!==state.questionBaseline||$('edit-content').value!==state.editorBaseline;}
async function allowSwitch(){
  if(!hasDraft())return true;
  if($('discard-dialog').open)return false;
  return new Promise(resolve=>{const d=$('discard-dialog');let settled=false;
    const finish=ok=>{if(settled)return;settled=true;d.removeEventListener('cancel',cancel);d.close();resolve(ok);};
    const cancel=e=>{e.preventDefault();finish(false);};d.addEventListener('cancel',cancel);
    $('keep-draft').onclick=()=>finish(false);$('discard-draft').onclick=()=>finish(true);d.showModal();
  });
}
function setMode(mode){state.mode=mode;$('composer-panel').hidden=mode==='edit';$('manual-editor').hidden=mode!=='edit';$('manual-editor').open=true;$('mode-query').setAttribute('aria-pressed',String(mode==='query'));$('mode-edit').setAttribute('aria-pressed',String(mode==='edit'));$('mode-ai-edit').setAttribute('aria-pressed',String(mode==='ai-edit'));$('ai-allow-edits').checked=mode==='ai-edit';if(typeof syncImageCreationModeUI==='function')syncImageCreationModeUI();}
$('mode-ai-edit').onclick=()=>setMode('ai-edit');
function setRootKind(kind){$('root-kind').value=kind;for(const id of ['allow-write','allow-verify','create-folder']){$(id).disabled=kind==='global-reference';if($(id).disabled)$(id).checked=false;}}
$('root-kind').onchange=()=>setRootKind($('root-kind').value);
function openPermission(folder,kind='project'){$('permission-error').textContent='';setRootKind(kind);if(folder)$('folder').value=folder;$('root-permission-panel').open=true;if(!$('permission-dialog').open)$('permission-dialog').showModal();}
function renderVerificationRules(){
  const list=$('verification-rules-readonly');list.replaceChildren();
  for(const rule of state.verificationRules){const row=node('div',undefined,'verification-rule-readonly'),label=node('span',rule.label),status=node('small',rule.enabled?'啟用':'已停用',rule.enabled?'enabled':'disabled');row.append(label,status);list.append(row);}
  if(!state.verificationRules.length)list.append(node('span','驗證規則載入中','muted'));
}
function renderVerificationRulesEditor(){
  const editor=$('verification-rules-editor'),code=$('verification-rules-admin').value.trim(),ready=/^[0-9a-f]{6}$/i.test(code);editor.replaceChildren();
  for(const rule of state.verificationRules){
    const label=node('label',undefined,'verification-rule'),box=document.createElement('input'),body=node('span');box.type='checkbox';box.checked=rule.enabled;box.disabled=!ready;box.setAttribute('aria-label',(rule.enabled?'停用':'啟用')+'驗證規則：'+rule.label);body.append(node('strong',rule.label),node('span',rule.extensions.join('、')+' · '+rule.description));
    box.onchange=async()=>{box.disabled=true;$('verification-rules-status').textContent='正在更新 '+rule.label+'…';try{const result=await api('/api/verification-rules/'+encodeURIComponent(rule.id),{adminToken:code,enabled:box.checked});state.verificationRules=result.rules;renderVerificationRules();renderVerificationRulesEditor();$('verification-rules-status').textContent=rule.label+(box.checked?' 已啟用':' 已停用')+'。';}catch(error){$('verification-rules-status').textContent='更新失敗：'+error.message;await loadVerificationRules();renderVerificationRulesEditor();}};
    label.append(box,body);editor.append(label);
  }
}
async function loadVerificationRules(){const result=await api('/api/verification-rules');state.verificationRules=result.rules;renderVerificationRules();return result;}
function openVerificationRules(){
  $('verification-rules-status').textContent='';$('verification-rules-admin').value=$('admin').value.trim();renderVerificationRulesEditor();
  if(!$('verification-rules-dialog').open)$('verification-rules-dialog').showModal();
}
$('open-verification-rules').onclick=()=>openVerificationRules();
$('close-verification-rules').onclick=()=>$('verification-rules-dialog').close();
$('verification-rules-admin').oninput=()=>renderVerificationRulesEditor();
function setComposerMenu(open){const menu=$('composer-menu'),button=$('composer-more');menu.hidden=!open;button.setAttribute('aria-expanded',String(open));$('composer-footer').classList.toggle('composer-menu-open',open);}
$('composer-more').onclick=()=>setComposerMenu($('composer-menu').hidden);
$('composer-files').onclick=()=>{setComposerMenu(false);$('files-panel').open=true;$('files').scrollIntoView({behavior:'smooth',block:'center'});};
$('composer-images').onclick=()=>{$('image-limit').focus();};
$('composer-create-image').onclick=()=>{setComposerMenu(false);submitImageCreation().catch(fail);};
$('composer-reference').onclick=()=>{setComposerMenu(false);$('add-reference').click();};
$('composer-permission').onclick=()=>{setComposerMenu(false);openPermission();};
document.addEventListener('click',event=>{if(!$('composer').contains(event.target))setComposerMenu(false);});
document.addEventListener('keydown',event=>{if(event.key==='Escape')setComposerMenu(false);});
function renderGlobalReferences(){
  $('global-reference-list').replaceChildren(...(state.globalReferences||[]).map(p=>{
    const d=node('div'),status=node('p',p.path+' · '+(p.active?'唯讀 · '+Math.max(0,Math.ceil((p.expiresAt-Date.now())/60000))+' mins':'待重新授權'));
    const renew=node('button','重新授權');renew.type='button';renew.onclick=()=>{openPermission(p.path,'global-reference');$('grant-minutes').value=p.grantDefaults.minutes;$('allow-ai').checked=p.grantDefaults.ai;};
    const revoke=node('button','撤銷');revoke.type='button';revoke.disabled=!p.active;revoke.onclick=async()=>{try{await api('/api/roots/'+p.id+'/revoke',{adminToken:$('admin').value});await catalog();expireVisibleFiles();if(state.catalog.find(r=>r.id===state.project)?.active)await inventory();}catch(e){fail(e);}};
    d.append(status,renew,revoke);return d;
  }));
}
function renderScope(){
  const p=state.catalog.find(p=>p.id===state.project);$('target-name').textContent=(p?.name||'Loading')+(p&&!p.active?' · Wait':p&&!p.permissions.write?' · Read-only':'');
  $('project-location').textContent=p?.path||'';$('project-location').title=p?.path||'';
  $('reference-chips').replaceChildren(...state.references.map(id=>{const p=state.catalog.find(p=>p.id===id);const b=node('button',(p?.name||id)+' ×');b.title='移除唯讀參考：'+(p?.path||id);b.onclick=()=>setReferences(state.references.filter(x=>x!==id)).catch(fail);return b;}));
  if(!state.references.length)$('reference-chips').append(node('span','No refs','reference-empty'));
  for(const root of state.globalReferences||[])if(root.active)$('reference-chips').append(node('span','Global: '+root.path,'muted'));
  renderGlobalReferences();
}
async function listConversations(project){
  const result=await api('/api/conversation-list',undefined,project);state.conversationLists.set(project,result.conversations);renderProjectList();
}
function renderProjectList(){
  const projects=[...state.catalog].sort((a,b)=>a.id==='demo'?-1:b.id==='demo'?1:0);
  $('project-list').replaceChildren(...projects.map(p=>{
    const group=node('div'),row=node('div'),expanded=state.openProjects.has(p.id);
    group.id='project-item-'+p.id;
    group.className='project-item';
    row.id='project-row-'+p.id;
    row.className='project-row';
    group.dataset.projectId=p.id;
    const toggle=node('button',expanded?'▾':'▸','project-expander');toggle.type='button';toggle.setAttribute('aria-label',(expanded?'收合':'展開')+p.name+'的對話');toggle.setAttribute('aria-expanded',String(expanded));toggle.setAttribute('aria-controls','conversations-'+p.id);
    toggle.onclick=()=>{if(state.openProjects.has(p.id))state.openProjects.delete(p.id);else state.openProjects.add(p.id);try{sessionStorage.setItem('cda.openProjects',JSON.stringify([...state.openProjects]));}catch{}renderProjectList();if(state.openProjects.has(p.id))listConversations(p.id).catch(fail);};
    const choose=node('button',undefined,'project-choice');choose.type='button';choose.dataset.projectId=p.id;choose.dataset.tooltip=p.path;choose.setAttribute('aria-current',String(p.id===state.project));choose.append(node('span',p.name),node('small',p.active?'已授權':'待授權'));bindFileTooltip(choose);
    choose.onclick=()=>switchProject(p.id).catch(fail);
    const newConversation=node('button',undefined,'conversation-new');newConversation.type='button';newConversation.title='建立'+p.name+'的新對話';newConversation.setAttribute('aria-label','建立'+p.name+'的新對話');const newConversationIcon=node('i');newConversationIcon.className='fi fi-rr-pen-circle';newConversationIcon.setAttribute('aria-hidden','true');newConversation.append(newConversationIcon);newConversation.onclick=event=>{event.stopPropagation();startNewConversation(p.id).catch(fail);};
    row.append(toggle,choose,newConversation);group.append(row);
    const children=node('div',undefined,'project-conversations');children.id='conversations-'+p.id;children.hidden=!expanded;
    for(const c of state.conversationLists.get(p.id)||[]){const b=node('button',c.title||new Date(c.createdAt).toLocaleString('zh-TW'),'conversation-choice');b.type='button';b.dataset.conversationId=c.id;b.title=new Date(c.createdAt).toLocaleString('zh-TW');b.setAttribute('aria-current',String(p.id===state.project&&c.id===state.conversation));b.onclick=()=>switchConversation(p.id,c.id).catch(fail);children.append(b);}
    if(!children.childElementCount)children.append(node('span',state.conversationLists.has(p.id)?'尚無對話，開啟專案後開始。':'載入對話中…','muted'));group.append(children);return group;
  }));renderScope();
}
function clearTaskView(){
  state.draftImages=[];state.imageReady=false;renderDraftImages();$('image-notice').textContent='';
  state.taskJobs.clear();state.detailOpen.clear();state.questionExpanded.clear();state.inspectorActivityOpen.clear();state.selectedTask=null;
  state.imagePreviousJobId=null;
  state.memory=null;state.activeSkill=null;state.skillSuggestions=[];renderMemory();renderSkillSuggestions();
  for(const id of ['inspector-question','inspector-usage','inspector-duration'])$(id).replaceChildren();
  $('ai-allow-edits').checked=true;
  state.epoch++;state.selected.clear();state.job=null;state.editor=null;state.request=null;state.articles.clear();state.files=[];
  state.questionBaseline='';state.editorBaseline='';state.openedDiffs.clear();state.grantedProject=null;$('open-granted-project').hidden=true;
  endTaskEdit(false);
  for(const id of ['history','project-output','verification','editor-file','mentions','root-status'])$(id).replaceChildren();
  $('edit-content').value='';$('question').value='';$('cancel').disabled=true;$('send').disabled=false;$('project-propose').disabled=false;$('progress').textContent='等待提問';$('notice').textContent='';renderFiles();
}
async function catalog(){
  const catalogData=await api('/api/catalog');state.catalog=catalogData.projects;state.globalReferences=catalogData.globalReferences||[];
  $('active-project').replaceChildren(...state.catalog.map(p=>{const o=node('option',p.name+' · '+p.path+(p.active?'':' · 待授權'));o.value=p.id;return o;}));
  $('active-project').value=state.project;
  $('roots').replaceChildren(...state.catalog.filter(p=>p.id!=='demo').map(p=>{
    const d=node('details'),summary=node('summary'),toggleIcon=node('i'),summaryText=node('span',p.name+' · '+(p.active?'有效':'待授權'));
    d.id='root-detail-'+p.id;
    const content=node('div',undefined,'root-detail-content');
    toggleIcon.className='fi fi-br-angle-small-right';toggleIcon.setAttribute('aria-hidden','true');summary.append(toggleIcon,summaryText);
    content.append(node('p',p.path),node('pre',JSON.stringify({permissions:p.permissions,expiresAt:p.expiresAt?new Date(p.expiresAt).toISOString():null},null,2)));
    d.append(summary,content);
    d.addEventListener('toggle',()=>{toggleIcon.className='fi fi-br-angle-small-'+(d.open?'down':'right');if(d.open)closeOtherRootDetails(d);});
    const renew=node('button','更新授權');renew.onclick=()=>openPermission(p.path);content.append(renew);
    if(p.active){const revoke=node('button','撤銷授權');revoke.onclick=async()=>{try{if(!await allowSwitch())return;await api('/api/roots/'+p.id+'/revoke',{adminToken:$('admin').value});await switchProject(state.project,{force:true,approved:true});}catch(e){fail(e);}};content.append(revoke);}return d;
  }));
  $('reference-projects').replaceChildren(...state.catalog.filter(p=>p.id!==state.project).map(p=>{
    const label=node('label'),box=document.createElement('input');box.type='checkbox';box.setAttribute('aria-label','引用專案：'+p.name);box.checked=state.references.includes(p.id);box.disabled=!p.active;
    box.onchange=()=>setReferences(box.checked?[...state.references,p.id]:state.references.filter(id=>id!==p.id)).catch(fail);
    label.append(box,node('span',p.name+' · '+p.path+(p.active?'':' · 待授權')));return label;
  }));
  renderProjectList();
  for(const p of state.catalog)if(state.openProjects.has(p.id)&&!state.conversationLists.has(p.id))await listConversations(p.id);
}
async function loadConversation(){
  let data;try{data=await api('/api/conversations');}catch(e){if(e.stale||!e.message.includes('對話不屬於'))throw e;state.conversation='';data=await api('/api/conversations');}state.conversation=data.id;
  try{sessionStorage.setItem('cda.conversation.'+state.project,data.id);}catch{}
  state.memory=data.memory||null;renderMemory();
  $('active-conversation').replaceChildren(...data.conversations.map(c=>{const o=node('option',c.createdAt);o.value=c.id;return o;}));$('active-conversation').value=data.id;
  await listConversations(state.project);
  for(const job of data.jobs.toSorted((a,b)=>(Number(a.startedAt)||0)-(Number(b.startedAt)||0)))show(job);
  if(state.imageWorkspaceActive&&state.imageProjectId){const imageHistory=await api('/api/image-project-history?imageProjectId='+encodeURIComponent(state.imageProjectId));for(const job of imageHistory.jobs||[])show(job);}
  if(typeof renderImageProjectMemory==='function'){renderImageProjectMemory();filterImageHistory();}
  await loadImageDraft();
  const active=data.jobs.findLast(j=>!j.archived&&(['running','awaiting_approval'].includes(j.status)||taskIsLive(j)));
  if(active){state.job=active.id;if(taskIsLive(active))poll(active).catch(fail);}
}
function renderMemory(){
  const memory=state.memory||{confirmed:[],summary:'',sourceJobCount:0};
  const active=(memory.confirmed||[]).filter(x=>x.status==='active');
  $('memory-status').textContent=active.length?`${active.length} 項已確認 · ${memory.sourceJobCount||0} 項任務已納入摘要`:'尚無已確認需求';
  $('confirmed-requirements').replaceChildren(...(memory.confirmed||[]).map((x,i)=>node('span',`${i+1}. ${x.text}${x.status==='superseded'?'（已被後續需求取代）':'（有效）'}`,x.status==='superseded'?'muted':'')));
  if(!(memory.confirmed||[]).length)$('confirmed-requirements').append(node('span','可在任務下方按「確認為需求」。','muted'));
  $('memory-summary').textContent=memory.summary||'對話尚短，尚未建立壓縮摘要。完整原始紀錄仍保存在本機。';
  if(memory.summaryVersion)$('memory-status').textContent+=` · ${memory.mode==='legacy'?'已保存的':''}模型摘要 v${memory.summaryVersion}`;
  if(memory.lastUpdate?.status==='running')$('memory-status').textContent+=' · 自動整理中';
  $('memory-update-history').replaceChildren(...(memory.updates||[]).slice().reverse().map(update=>{
    const detail=node('details'),summary=node('summary');
    const usage=(update.usage||[]),known=usage.length&&usage.every(x=>Number.isSafeInteger(x.inputTokens)&&Number.isSafeInteger(x.outputTokens));
    const tokens=known?`API 用量：輸入 ${usage.reduce((n,x)=>n+x.inputTokens,0)}／輸出 ${usage.reduce((n,x)=>n+x.outputTokens,0)} token`:'API 用量未取得';
    summary.textContent=`摘要 v${update.version} · ${update.status==='ok'?'成功':update.status==='running'?'整理中':'失敗，保留上一版'} · ${update.reason==='context_budget'?'上下文預算':'對話更新'} · ${update.finishedAt||update.startedAt}`;
    detail.append(summary,node('p',tokens,'muted'),node('p',`本機估算：${update.estimatedTokens} token；記憶預算：${update.budgetTokens} token（非模型最大窗口）`,'muted'),node('pre',update.summary||update.code||'尚無摘要'));return detail;
  }));
}
function renderSkillSuggestions(){
  $('active-skill').textContent=state.activeSkill?'已選：'+state.activeSkill.name:'尚未啟用';
  $('skill-suggestions').replaceChildren(...state.skillSuggestions.map(skill=>{
    const card=node('article',undefined,'skill-suggestion'),copy=node('div');copy.append(node('strong',skill.name),node('span',skill.reason,'muted'));
    const start=node('button',skill.action||'開始');start.type='button';start.id='start-skill-'+skill.id;start.onclick=()=>startSkill(skill);card.append(copy,start);return card;
  }));
  if(!state.skillSuggestions.length)$('skill-suggestions').append(node('span','輸入需求後，系統會在本機建議合適流程；不會自動執行。','muted'));
}
async function suggestSkills(){
  const question=$('question').value.trim();if(!question){state.skillSuggestions=[];renderSkillSuggestions();return;}
  try{const result=await api('/api/skills/suggest',{question});if($('question').value.trim()!==question)return;state.skillSuggestions=result.suggestions||[];renderSkillSuggestions();}catch(e){if(!e.stale)fail(e);}
}
function scheduleSkillSuggestions(){clearTimeout(state.skillTimer);state.skillTimer=setTimeout(()=>suggestSkills(),300);}
function startSkill(skill){state.activeSkill={id:skill.id,name:skill.name};renderSkillSuggestions();$('send').setAttribute('aria-label',skill.action||'開始');$('send').title=skill.action||'開始';$('composer').requestSubmit();}
async function confirmRequirement(job){
  let result=await api('/api/conversation-memory/confirm',{jobId:job.id,replace:false});
  if(result.requiresReplacementConfirmation){
    const ok=window.confirm(`目前內容可能取代已確認需求：\n\n${result.candidate.text}\n\n是否以「${result.text}」取代？`);if(!ok)return;
    result=await api('/api/conversation-memory/confirm',{jobId:job.id,replace:true});
  }
  state.memory=result.memory;renderMemory();show({...job,requirementConfirmed:true});$('notice').textContent='已確認需求並更新壓縮上下文。';
}
async function switchProject(id,{force=false,approved=false,conversation=null,selectSection=true}={}){
  if(id===state.project&&!force){if(selectSection){setImageWorkspaceActive(false);if(typeof setWorkspaceSectionSelection==='function')setWorkspaceSectionSelection('project');}return false;}
  if(!approved&&!await allowSwitch()){$('active-project').value=state.project;return false;}
  clearTaskView();state.project=id;state.references=[];state.conversation='';try{sessionStorage.setItem('cda.project',id);state.conversation=sessionStorage.getItem('cda.conversation.'+id)||'';}catch{}
  if(conversation)state.conversation=conversation;setMode('query');$('ai-allow-edits').checked=true;
  await catalog();await loadConversation();
  if(state.catalog.find(p=>p.id===id)?.active)await inventory();else $('notice').textContent='專案已登錄，需重新授權後讀取磁碟；目前顯示的是歷史對話。';
  if(selectSection){setImageWorkspaceActive(false);if(typeof setWorkspaceSectionSelection==='function')setWorkspaceSectionSelection('project');}
  return true;
}
async function switchConversation(project,id){return switchProject(project,{force:true,conversation:id});}
async function setReferences(ids){
  const previous=state.references;state.references=[...new Set(ids)];
  try{await inventory();await catalog();renderScope();}catch(e){if(!e.stale){state.references=previous;await catalog();}throw e;}
}
function taskIsLive(job){return ['running','applying'].includes(job.status)||job.memoryUpdating||job.imageDraftUpdating||['queued','running'].includes(job.activitySummary?.status);}
async function poll(job){
  const existing=state.polls.get(job.id);if(existing)return existing;
  const epoch=state.epoch;
  const work=(async()=>{
    let current=job;
    while(taskIsLive(current)&&epoch===state.epoch){
      await new Promise(resolve=>setTimeout(resolve,500));
      if(epoch!==state.epoch)return;
      current=await api('/api/jobs/'+job.id);
      if(current.memory){state.memory=current.memory;renderMemory();}
      show(current);
    }
  })();
  state.polls.set(job.id,work);
  try{return await work;}finally{if(state.polls.get(job.id)===work)state.polls.delete(job.id);}
}
$('active-project').onchange=()=>switchProject($('active-project').value).catch(fail);
$('active-conversation').onchange=()=>switchConversation(state.project,$('active-conversation').value).catch(fail);
async function startNewConversation(project=state.project){if(!project)return;if(!await allowSwitch())return;const c=await api('/api/conversations',{});await switchProject(project,{force:true,approved:true,conversation:c.id});}
$('new-conversation').onclick=()=>startNewConversation().catch(fail);
function select(id){if(state.selected.has(id))state.selected.delete(id);else if(state.selected.size<6)state.selected.add(id);else return fail(new Error('最多選取六份檔案'));renderFiles();}
let fileTooltip;
function showFileTooltip(label){
  if(!fileTooltip){
    fileTooltip=node('div',undefined,'file-tooltip');
    fileTooltip.id='file-tooltip';
    fileTooltip.setAttribute('role','tooltip');
    document.body.append(fileTooltip);
  }
  fileTooltip.textContent=label.dataset.tooltip||'';
  fileTooltip.hidden=false;
  label.setAttribute('aria-describedby','file-tooltip');
  const target=label.getBoundingClientRect();
  const tip=fileTooltip.getBoundingClientRect();
  const half=Math.max(8,tip.width/2);
  const left=Math.min(Math.max(target.left+target.width/2,half+8),window.innerWidth-half-8);
  const below=target.bottom+8;
  const top=below+tip.height<=window.innerHeight-8?below:Math.max(8,target.top-tip.height-8);
  fileTooltip.style.left=`${left}px`;
  fileTooltip.style.top=`${top}px`;
}
function hideFileTooltip(label){
  if(fileTooltip)fileTooltip.hidden=true;
  label.removeAttribute('aria-describedby');
}
function bindFileTooltip(label){
  label.addEventListener('pointerenter',()=>showFileTooltip(label));
  label.addEventListener('pointerleave',()=>hideFileTooltip(label));
  label.addEventListener('focusin',()=>showFileTooltip(label));
  label.addEventListener('focusout',event=>{if(!label.contains(event.relatedTarget))hideFileTooltip(label);});
}
bindFileTooltip($('task-update-floating-action'));
function renderFiles(){
  $('files').replaceChildren();$('selected').replaceChildren();
  for(const f of state.files){const label=node('label',undefined,'file');const box=document.createElement('input');box.type='checkbox';box.setAttribute('aria-label','選取檔案：'+f.name);box.checked=state.selected.has(f.id);box.addEventListener('change',()=>select(f.id));label.dataset.tooltip=f.path;label.setAttribute('aria-label',f.path);label.append(box,node('span',f.name));bindFileTooltip(label);$('files').append(label);if(box.checked){const chip=node('button');chip.id='selected-file-'+f.id;chip.type='button';chip.append(document.createTextNode('@'+f.name+' '));const close=node('i');close.className='fi fi-br-cross-small';close.setAttribute('aria-hidden','true');chip.append(close);chip.onclick=()=>select(f.id);$('selected').append(chip);}}
}
async function inventory(refresh=false){const result=await api(refresh?'/api/index':'/api/files',refresh?{}:undefined);state.files=result.files;for(const id of state.selected)if(!state.files.some(f=>f.id===id))state.selected.delete(id);renderFiles();$('index-status').textContent=`${result.files.length} 份檔案 · ${result.issues.length} 項提示 · ${result.updatedAt||''}`;$('issues').replaceChildren(...result.issues.map(i=>node('p',i.path+'：'+i.reason)));}
function sources(job){const content=node('div',undefined,'task-sources');for(const e of job.evidence){const detail=taskDetails(job.id+':source:'+e.id,e.id+' · '+(e.mode||(e.mock?'mock':'real'))+' · '+e.path);detail.classList.add('source');detail.id='evidence-'+job.id+'-'+e.id;detail.append(node('span',e.location+(e.mtime?' · 更新 '+e.mtime:'')),node('pre',e.excerpt));content.append(detail);}if(!content.childElementCount)content.append(node('span','尚無來源紀錄。','muted'));return content;}
function preflightDetails(job){
  if(!job.preflight)return null;
  const result=job.preflight,failed=result.status==='failed',title=failed?'預檢未通過 · 需要強制套用確認':result.status==='passed'?'預檢通過':'預檢未執行';
  const detail=taskDetails(job.id+':preflight',title,failed);detail.id='preflight-details-'+job.id;detail.classList.add('preflight-details');
  const attempts=job.preflightAttempts||[{attempt:1,verification:result}];
  detail.append(node('p',`${result.profile||'static'} · ${result.message||'未提供訊息'}`),node('p',`候選預檢 ${attempts.length} 輪`,'muted'));
  if(failed||attempts.length>1)detail.append(node('pre',JSON.stringify(attempts,null,2)));
  return detail;
}
function taskWorkbench(job){const panel=taskDetails(job.id+':workbench','修改工作台',!job.archived&&['running','awaiting_approval','applying'].includes(job.status));panel.classList.add('task-workbench');panel.id='task-workbench-'+job.id;const content=node('div',undefined,'task-workbench-content');content.append(node('p',job.question),node('p',job.restored?'已還原修改':job.applied?'已套用修改；請核對下方驗證範圍':job.archived?'歷史任務；需重新提出修改':job.progress),node('p',usageSummary(job)),node('span','修改差異與驗證','task-workbench-heading'));const diff=node('div',undefined,'task-diff');diff.id='diff-'+job.id;if(job.proposal){diff.append(node('p',job.proposal.path),createDiffViewer(job));const preflight=preflightDetails(job);if(preflight)diff.append(preflight);if(job.status==='awaiting_approval'&&!job.archived){const force=job.preflight?.status==='failed';const btn=node('button',force?'強制套用（預檢未通過）':job.proposal.mock?'確認套用展示修改':'主機確認套用實際修改',force?'force-apply':'primary');btn.id='apply-edit-'+job.id;btn.dataset.jobId=job.id;btn.onclick=()=>applyTaskUpdate(job.id,btn);diff.append(btn);}}else diff.append(node('p',job.archived?'此歷史任務未保存修改前後原文，無法重建差異比較。可查看保留的執行與驗證紀錄；若要再次修改，請使用 Edit 重新提出需求。':'尚無修改提案；請先提出修改需求。'));renderNewFiles(job,diff);if(job.applied){const v=job.applied.verification;diff.append(node('span','驗證結果','task-workbench-heading'),node('p',v?`${v.status} · ${v.message}`:'未取得驗證結果'),node('span','未執行瀏覽器功能測試；手動測試結果不會自動記錄。','muted'));const record=taskDetails(job.id+':verification','備份與完整驗證紀錄');record.id='verification-details-'+job.id;record.append(node('pre',JSON.stringify(job.applied,null,2)));diff.append(record);if(!job.restored&&!job.archived){const restore=node('button','確認還原這次修改');restore.onclick=async()=>{try{await api('/api/jobs/'+job.id+'/restore',{adminToken:$('admin').value});const result=await api('/api/jobs/'+job.id);show(result);if(taskIsLive(result))poll(result).catch(fail);$('notice').textContent='已還原，原套用後內容另有備份';await inventory();}catch(e){fail(e);}};diff.append(restore);}}content.append(diff);panel.append(content);return panel;}
function usageSummary(job){
  if(!job.ai)return 'Token 用量：未取得 API 用量紀錄';
  const records=job.ai.usage||[];
  const total=field=>{const values=records.map(r=>r[field]).filter(Number.isSafeInteger);return values.length?values.reduce((a,b)=>a+b,0).toLocaleString()+(values.length<job.ai.requests?'（部分回報）':''):'未知';};
  return `模型：${job.ai.model} · AI 請求 ${job.ai.requests} 次 · 輸入 ${total('inputTokens')} tokens · 輸出 ${total('outputTokens')} tokens · 費用未取得`;
}
function historyLabel(job,key,title,content=[]){
  const group=node('label',undefined,'history-group');
  group.id=`history-${job.id}-${key}`;
  const body=node('span',undefined,'history-content');
  body.append(...content);
  body.dataset.tooltip=content.map(item=>item.textContent).join(' · ');
  group.append(node('span',title,'history-title'),body);
  return group;
}
function historyText(text,cls){return node('span',text,cls||'history-text');}
function codeLanguage(value){
  const language=String(value||'text').trim().toLowerCase();
  if(['js','javascript','mjs','cjs'].includes(language))return 'javascript';
  if(['css','scss','less'].includes(language))return 'css';
  if(['html','xml'].includes(language))return 'html';
  return 'text';
}
function detectCodeLanguage(source){
  const value=String(source||'');
  if(/<!doctype html|<\/?[a-z][^>]*>/i.test(value))return 'html';
  if(/(^|[\n}])\s*[.#]?[\w-]+\s*\{[\s\S]*?:\s*[^;{}]+;?/m.test(value)||/\b(?:display|padding|margin|color|font-size|border)\s*:/i.test(value))return 'css';
  if(/\b(?:const|let|var|function|=>|document\.|window\.|querySelector|addEventListener)\b/.test(value))return 'javascript';
  return 'text';
}
function decorateTaskPre(pre){
  if(pre.dataset.taskCodeReady==='true')return;
  const source=pre.querySelector('code')?.textContent??pre.textContent??'';
  const language=codeLanguage(pre.dataset.language||detectCodeLanguage(source));
  const labels={css:'CSS',javascript:'JavaScript',html:'HTML',text:'純文字'};
  pre.dataset.taskCodeReady='true';pre.dataset.copyText=source;pre.dataset.language=language;pre.classList.add('task-code-block','language-'+language);
  const header=node('div',undefined,'task-code-header');
  const icon=node('i',undefined,'fi fi-br-code');icon.setAttribute('aria-hidden','true');
  header.append(icon,node('span',labels[language]));
  const copy=node('button',undefined,'task-code-copy');copy.type='button';copy.setAttribute('aria-label','複製'+labels[language]+'內容');copy.title='複製內容';
  const copyIcon=node('i',undefined,'fi fi-br-window-restore');copyIcon.setAttribute('aria-hidden','true');copy.append(copyIcon);
  copy.onclick=async()=>{try{if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(pre.dataset.copyText);else{const area=document.createElement('textarea');area.setAttribute('aria-label','複製暫存區');area.value=pre.dataset.copyText;area.style.position='fixed';area.style.opacity='0';document.body.append(area);area.select();document.execCommand('copy');area.remove();}copy.setAttribute('aria-label','已複製');copy.title='已複製';copyIcon.className='fi fi-br-check';setTimeout(()=>{copy.setAttribute('aria-label','複製'+labels[language]+'內容');copy.title='複製內容';copyIcon.className='fi fi-br-window-restore';},1200);}catch{copy.title='複製失敗';}};
  header.append(copy);pre.replaceChildren(header,node('code',source,'task-code-content'));
}
function decorateTaskPres(article){article.querySelectorAll('pre').forEach(decorateTaskPre);}
function taskAnswer(markdown){
  const container=node('div',undefined,'task-rich-answer');
  const inline=(target,value)=>{
    const pattern=/(\*\*([^*\n]+)\*\*|`([^`\n]+)`)/g;let cursor=0,match;
    while((match=pattern.exec(value))){
      if(match.index>cursor)target.append(document.createTextNode(value.slice(cursor,match.index)));
      target.append(node(match[2]?'strong':'code',match[2]||match[3]));cursor=pattern.lastIndex;
    }
    if(cursor<value.length)target.append(document.createTextNode(value.slice(cursor)));
  };
  const lines=String(markdown).replace(/\r\n?/g,'\n').split('\n');let index=0;
  while(index<lines.length){
    const line=lines[index];if(!line.trim()){index++;continue;}
    const fence=line.match(/^\s*```([^`]*)$/);
    if(fence){const code=[];index++;while(index<lines.length&&!/^\s*```\s*$/.test(lines[index]))code.push(lines[index++]);if(index<lines.length)index++;const pre=node('pre');pre.dataset.language=codeLanguage(fence[1]);pre.append(node('code',code.join('\n')));container.append(pre);continue;}
    const heading=line.match(/^(#{1,3})\s+(.+)$/);
    if(heading){const h=node('h'+Math.min(heading[1].length+2,5));inline(h,heading[2]);container.append(h);index++;continue;}
    const list=line.match(/^\s{0,3}([-*]|\d+\.)\s+(.+)$/);
    if(list){const ordered=/\d/.test(list[1]),items=node(ordered?'ol':'ul');while(index<lines.length){const current=lines[index].match(/^\s{0,3}([-*]|\d+\.)\s+(.+)$/);if(!current||/\d/.test(current[1])!==ordered)break;const item=node('li');inline(item,current[2]);items.append(item);index++;}container.append(items);continue;}
    const parts=[line.trim()];index++;
    while(index<lines.length&&lines[index].trim()&&!/^\s*```/.test(lines[index])&&!/^#{1,3}\s+/.test(lines[index])&&!/^\s{0,3}([-*]|\d+\.)\s+/.test(lines[index]))parts.push(lines[index++].trim());
    const paragraph=node('p');inline(paragraph,parts.join(' '));container.append(paragraph);
  }
  return container;
}
function taskHeadline(job){
  if(job.restored)return '已還原';
  if(job.applied)return '已套用';
  return {running:'執行中',awaiting_approval:'待確認',applying:'套用中',completed:'已完成',partial:'部分完成',cancelled:'已取消',failed:'失敗'}[job.status]||job.status;
}
function taskOutput(job){
  if(job.applied)return `已修改 ${shortTaskPath(job.applied.path,job.proposal?.path)||'檔案'}${job.applied.verification?.status?' · 驗證'+(job.applied.verification.status==='passed'?'通過':'未通過'):''}`;
  const created=(job.creations||[]).filter(item=>item.status==='created');
  if(created.length)return `已建立 ${created.length} 個檔案：${created.map(item=>item.relativePath).join('、')}`;
  if(job.proposal)return `修改提案：${shortTaskPath(job.proposal.path,job.proposal.path)}`;
  const pending=(job.newFiles?.files||job.creations||[]).filter(item=>!['created','skipped'].includes(item.status));
  if(pending.length)return `待確認 ${pending.length} 個新檔案`;
  return '';
}
function imageProjectDraftPanel(job){
  const panel=taskDetails(job.id+':image-draft','本輪圖片草稿',true);panel.id='image-project-draft-'+job.id;panel.classList.add('image-project-draft');
  const draft=job.imageProjectDraft;
  const historyWarning=job.imageProjectChat?.historySelection?.warning;
  if(historyWarning)panel.append(historyLabel(job,'image-history-warning','歷史內容篩選',[historyText(historyWarning)]));
  if(job.imageDraftUpdating||draft?.status==='pending'){panel.append(historyLabel(job,'image-draft-status','處理狀態',[historyText('正在整理 Agent 理解與參考圖片觀察…')]));return panel;}
  if(draft?.status==='completed'){
    panel.append(
      historyLabel(job,'image-understanding','Agent 理解',[historyText(draft.agentUnderstanding)]),
      historyLabel(job,'image-discussion','參考圖片觀察',[historyText(draft.discussion)]),
      node('span','此草稿已自動保存；候選完整提示詞會在創作確認視窗中顯示與編輯。','muted')
    );
    return panel;
  }
  panel.append(historyLabel(job,'image-draft-error','未產生候選提示詞',[historyText(draft?.error||'圖片討論未完成')]),node('span','已保留本輪原始要求與錯誤紀錄，可供後續追查。','muted'));
  return panel;
}
function show(job){
  const imageHistory=state.imageWorkspaceActive&&((job.imageProjectChat?.projectId===state.imageProjectId)||(job.imageCreation?.imageProject?.id===state.imageProjectId));
  if(job.memory&&(!job.projectId||job.projectId===state.project)&&(!job.conversationId||job.conversationId===state.conversation)){state.memory=job.memory;renderMemory();}
  if(!imageHistory&&(job.projectId&&job.projectId!==state.project))return;
  if(!imageHistory&&(job.conversationId&&job.conversationId!==state.conversation))return;
  if(job.kind==='image'){showImageJob(job);return;}
  const prior=[...state.taskJobs.values()].find(j=>j.id!==job.id&&(j.taskId||j.id)===(job.taskId||job.id));
  if(prior){const article=state.articles.get(prior.id);if(article){article.id='task-'+(job.taskId||job.id);state.articles.set(job.id,article);state.articles.delete(prior.id);}state.taskJobs.delete(prior.id);if(state.selectedTask===prior.id)state.selectedTask=job.id;}
  const previous=state.taskJobs.get(job.id);
  if(previous&&previous!==job&&JSON.stringify(previous)===JSON.stringify(job)){
    const duration=state.articles.get(job.id)?.querySelector('.task-duration');if(duration)duration.textContent=taskDuration(job);
    if(state.selectedTask===job.id)$('inspector-duration').textContent=taskDuration(job);
    updateTaskFloatingBadge();
    return;
  }
  if(!state.taskJobs.has(job.id))state.selectedTask=job.id;
  state.taskJobs.set(job.id,job);
  updateTaskFloatingBadge();
  const editing=!!(job.proposal||job.allowEdits);
  const selected=state.selectedTask===job.id;
  if(selected){
  $('inspector-question').textContent=job.question;
  $('inspector-usage').textContent=usageSummary(job);
  $('inspector-duration').textContent=taskDuration(job);
  $('progress').textContent=job.progress+' · '+job.status;
  }
  let article=state.articles.get(job.id);if(!article){article=node('article',undefined,'message');article.id='task-'+job.id;state.articles.set(job.id,article);$('history').append(article);}article.hidden=state.imageWorkspaceActive&&(!job.imageProjectChat||job.imageProjectChat.projectId!==state.imageProjectId||job.imageProjectChat.seriesId!==state.imageSeriesId);
  const r=job.result;
  const heading=node('div',undefined,'task-card-heading');
  heading.dataset.status=job.status;
  heading.append(node('strong',taskHeadline(job),'task-card-status'),node('span',' · '+taskDuration(job),'task-duration'));
  const questionExpanded=state.questionExpanded.has(job.id);
  const viewQuestion=node('button',questionExpanded?'Hide':'View','task-question-view');
  viewQuestion.type='button';viewQuestion.id='task-question-view-'+job.id;
  viewQuestion.setAttribute('aria-label',questionExpanded?'收合完整需求':'檢視完整需求');
  viewQuestion.setAttribute('aria-controls','task-question-'+job.id);
  viewQuestion.setAttribute('aria-expanded',String(questionExpanded));
  viewQuestion.onclick=()=>{
    const expanded=!state.questionExpanded.has(job.id);
    if(expanded)state.questionExpanded.add(job.id);else state.questionExpanded.delete(job.id);
    question.classList.toggle('is-expanded',expanded);
    viewQuestion.textContent=expanded?'Hide':'View';
    viewQuestion.setAttribute('aria-label',expanded?'收合完整需求':'檢視完整需求');
    viewQuestion.setAttribute('aria-expanded',String(expanded));
  };
  const actions=node('div',undefined,'task-heading-actions');
  const editQuestion=node('button','Edit','task-question-edit');editQuestion.type='button';editQuestion.id='task-question-edit-'+job.id;
  editQuestion.disabled=['running','applying','awaiting_approval'].includes(job.status);editQuestion.onclick=()=>editTask(job).catch(fail);
  actions.append(editQuestion,viewQuestion);heading.append(actions);
  article.replaceChildren(heading);
  const question=node('p',undefined,'question task-card-question');question.id='task-question-'+job.id;
  question.append(node('span',job.question,'task-card-question-text'));
  question.classList.toggle('is-expanded',questionExpanded);article.append(question);
  const versionsKey=job.id+':question-versions';
  const versions=taskDetails(versionsKey,`需求版本（目前 v${job.revision||1}）`,questionExpanded);
  versions.id='task-question-versions-'+job.id;versions.classList.add('task-question-versions');versions.hidden=!questionExpanded;
  for(const version of [...(job.versions||[]),job]){const section=node('section',undefined,'task-question-version');section.append(node('strong',`v${version.revision||1}${version.id===job.id?' · 目前版本':''}`),node('pre',version.question));
    if(version.id!==job.id){section.append(node('span','狀態：'+taskHeadline(version)));if(version.result?.answer)section.append(taskAnswer(version.result.answer));else section.append(node('pre',JSON.stringify(version.result||{},null,2)));const logs=node('details');logs.append(node('summary','工具與驗證紀錄'),node('pre',JSON.stringify({tools:version.tools,events:version.events,creations:version.creations},null,2)));section.append(logs);}
    const load=node('button','載入此版本編輯');load.type='button';load.disabled=editQuestion.disabled;load.onclick=()=>editTask(job,version).catch(fail);section.append(load);versions.append(section);}
  article.append(versions);
  const syncVersions=()=>{
    const expanded=state.questionExpanded.has(job.id);
    versions.hidden=!expanded;
    versions.open=expanded;
    state.detailOpen.set(versionsKey,expanded);
  };
  viewQuestion.addEventListener('click',syncVersions);
  versions.addEventListener('toggle',()=>{
    if(versions.hidden)return;
    const expanded=versions.open;
    if(expanded)state.questionExpanded.add(job.id);else state.questionExpanded.delete(job.id);
    question.classList.toggle('is-expanded',expanded);
    viewQuestion.textContent=expanded?'Hide':'View';
    viewQuestion.setAttribute('aria-label',expanded?'收合完整需求':'檢視完整需求');
    viewQuestion.setAttribute('aria-expanded',String(expanded));
  });
  const conclusion=r?.conclusions?.[0]||(!r?job.progress:'');
  if(r?.answer)article.append(taskAnswer(r.answer));
  else if(conclusion)article.append(historyLabel(job,'key-conclusion','結論',[historyText(conclusion)]));
  if(job.imageProjectChat)article.append(imageProjectDraftPanel(job));
  article.append(renderTaskActivity(job));
  const output=r?.answer?'':taskOutput(job);
  if(job.proposal&&job.status==='awaiting_approval'){const preview=node('div',undefined,'task-edit-preview');preview.append(node('strong','即將修改'),node('span',shortTaskPath(job.proposal.path,job.proposal.path)),node('p',job.tools?.findLast(t=>t.name==='propose_edit')?.summary||'請核對修改前後內容後確認套用。'));article.append(preview);}
  if(output)article.append(historyLabel(job,'key-output','主要產出',[historyText(output)]));
  if(['partial','failed','cancelled'].includes(job.status)&&r?.unknown?.length)article.append(historyLabel(job,'key-attention','需留意',[historyText(r.unknown[0])]));
  const detail=taskDetails(job.id+':main','詳細資訊',false);
  detail.classList.add('task-main-details');detail.id='task-more-'+job.id;
  detail.firstChild.setAttribute('aria-controls','task-more-content-'+job.id);
  const detailContent=node('div',undefined,'task-main-content');detailContent.id='task-more-content-'+job.id;
  detail.firstChild.setAttribute('aria-expanded',String(detail.open));
  detail.addEventListener('toggle',()=>detail.firstChild.setAttribute('aria-expanded',String(detail.open)));
  const category=(key,title,prompt)=>{const panel=taskDetails(job.id+':category:'+key,title,false);panel.classList.add('task-category','task-category-'+key);panel.id='task-category-'+key+'-'+job.id;panel.firstChild.append(node('span',' · '+prompt,'task-category-prompt'));const content=node('div',undefined,'task-category-content');content.id='task-category-content-'+key+'-'+job.id;panel.append(content);panel.content=content;return panel;};
  const resultPanel=category('result','結果與待辦','做完了什麼？還需要我做什麼？');
  const evidencePanel=category('evidence','內容與證據','根據什麼？實際改了哪裡？');
  const processPanel=category('process','過程與技術紀錄','系統如何執行？有哪些限制？');
  detailContent.append(resultPanel,evidencePanel,processPanel);
  if(job.skill)processPanel.content.append(node('span','技能：'+job.skill.name,'badge'));
  const planPanel=taskDetails(job.id+':plan','公開行動計畫');planPanel.id='task-plan-'+job.id;
  const planList=node('ol');planList.append(...job.plan.map(step=>node('li',step)));planPanel.append(planList,node('span','只顯示執行步驟，不展示模型內部思考。','muted'));
  processPanel.content.append(planPanel);
  const sourcePanel=taskDetails(job.id+':sources','來源檢視器');sourcePanel.id='task-sources-'+job.id;sourcePanel.append(sources(job));evidencePanel.content.append(sourcePanel);
  renderTaskImages(job,evidencePanel.content);
  if(editing)evidencePanel.content.append(taskWorkbench(job));
  const taskActions=node('div',undefined,'task-actions');taskActions.id='task-actions-'+job.id;
  if(editing){
    resultPanel.content.append(historyLabel(job,'edit-summary','修改任務摘要',[historyText(job.restored?'已還原修改':job.progress),historyText(usageSummary(job))]));
    if(r?.conclusions?.length)resultPanel.content.append(historyLabel(job,'conclusions','結論',r.conclusions.map(s=>historyText(s))));
    if(r?.facts?.length)evidencePanel.content.append(historyLabel(job,'facts','依據',r.facts.map(f=>historyText(f.text))));
    if(r?.inferences?.length)evidencePanel.content.append(historyLabel(job,'inferences','推論',r.inferences.map(s=>historyText(s))));
    if(r?.unknown?.length)resultPanel.content.append(historyLabel(job,'unknown','未確認事項',r.unknown.map(s=>historyText(s))));
  }else if(r){
    resultPanel.content.append(node('span',r.mock?'MOCK 回應':r.origin==='ai'?'AI 回應 · 請核對來源':'實際檔案操作','badge'),historyLabel(job,'conclusions','結論',r.conclusions.map(s=>historyText(s))));
    const facts=[];
    for(const f of r.facts){const item=historyText(f.text);for(const id of f.evidenceIds){const btn=node('button',id,'citation');btn.onclick=()=>{const panel=$('task-sources-'+job.id),source=$('evidence-'+job.id+'-'+id);if(panel)panel.open=true;if(source){source.open=true;source.scrollIntoView({behavior:'auto',block:'center'});}};item.append(btn);}facts.push(item);}
    const explanation=taskDetails(job.id+':answer','回答依據與推論');explanation.classList.add('answer-details');
    explanation.append(historyLabel(job,'facts','依據',facts.length?facts:[historyText('尚無已確認結論引用；已取得原文可在右側查看。')]));
    explanation.append(historyLabel(job,'inferences','推論',[historyText(r.inferences.join('；')||'未提出額外推論')]));evidencePanel.content.append(explanation);
    resultPanel.content.append(historyLabel(job,'unknown','未確認事項',(r.unknown||[]).map(s=>historyText(s))));
  }else resultPanel.content.append(historyLabel(job,'progress','處理狀態',[historyText(job.progress+'…')]));
  if(!editing&&r)processPanel.content.append(historyText(usageSummary(job),'history-usage'));
  const confirmed=(state.memory?.confirmed||[]).find(x=>x.sourceJobId===job.id);
  if(job.result&&!confirmed){const remember=node('button','Confirm requirement','confirm-requirement');remember.type='button';remember.id='task-confirm-requirement-'+job.id;remember.onclick=async()=>{remember.disabled=true;try{await confirmRequirement(job);}catch(e){fail(e);}finally{remember.disabled=false;}};taskActions.append(remember);}
  else if(confirmed)taskActions.append(node('span',confirmed.status==='active'?'已納入確認需求':'此需求已被後續版本取代','muted'));
  if(taskActions.childElementCount)resultPanel.content.append(taskActions);
  if(job.contextUsage)processPanel.content.append(node('span',`上下文：摘要 ${job.contextUsage.summaryChars} 字、已確認 ${job.contextUsage.confirmedCount} 項、最近 ${job.contextUsage.recentTurns} 輪、找回 ${job.contextUsage.retrievedTurns} 輪`,'muted'));
  const active=state.taskJobs.get(state.job);$('cancel').disabled=!active||active.archived||!['running','awaiting_approval'].includes(active.status);
  if(job.archived)processPanel.content.append(node('span','歷史紀錄：重新啟動後舊任務不會繼續執行；需要修改請重新載入檔案及建立提案。','muted archived-note'));
  renderTaskTimeline(job,processPanel.content);
  detail.append(detailContent);article.append(detail);decorateTaskPres(article);
  for(const [id,card] of state.articles)card.classList.toggle('task-selected',id===state.selectedTask);
  sortHistoryTasks();
}
function openTaskWorkbench(id){
  const job=state.taskJobs.get(id);if(!job)return;
  state.selectedTask=id;state.detailOpen.set(id+':main',true);show(job);
  const panel=$('task-more-'+id),workbench=$('task-workbench-'+id);
  if(panel)panel.open=true;
  const comparison=$('diff-details-'+id);if(comparison)comparison.open=true;
  if(workbench)workbench.open=true;
  requestAnimationFrame(()=>{if(state.selectedTask===id&&workbench?.isConnected)(comparison||workbench).scrollIntoView({behavior:'auto',block:'start'});});
}
async function submit(event){event.preventDefault();$('notice').textContent='';$('send').disabled=true;try{
  const epoch=state.epoch;await state.imageQueue;if(epoch!==state.epoch)return;
  if(state.imageWorkspaceActive){if(state.imageCreationMode)await submitImageCreation({projectMode:true});else await submitImageProjectChat();return;}
  if(!state.editingTask&&(state.imagePreviousJobId||imagePromptIntent($('question').value))){
    await submitImageCreation();return;
  }
  if(state.draftImages.length&&!state.imagesSupported)throw new Error('此模型／端點未啟用圖片輸入，請設定支援圖片的模型；圖片仍保留在草稿。');
  const question=$('question').value;const selectedSkill=state.activeSkill;const payload={question,fileIds:[...state.selected],allowEdits:$('ai-allow-edits').checked,autoMemory:$('ai-auto-memory').checked,imageIds:state.draftImages.map(i=>i.id),...(state.editingTask||{}),...(selectedSkill?{skillId:selectedSkill.id}:{})};
  collapseComposerForExecution();let job=await api('/api/jobs',payload);
  if(job.requiresContinuationSelection){const id=await chooseContinuation(job);if(!id)return;job=await api('/api/jobs',{...payload,continuationJobId:id});if(job.requiresContinuationSelection)throw new Error(job.message);}
  state.activeSkill=null;endTaskEdit(false);if($('question').value===question)$('question').value='';state.questionBaseline='';$('send').setAttribute('aria-label','送出問題');$('send').title='送出問題';renderSkillSuggestions();state.job=job.id;show(job);moveHistoryToBottom();await loadImageDraft();await listConversations(state.project);
  await poll(job);restoreComposerAfterExecution();
}catch(e){fail(e);}finally{$('send').disabled=false;restoreComposerAfterExecution();}}
$('composer').onsubmit=submit;
$('refresh').onclick=()=>inventory(true).catch(fail);
$('cancel').onclick=async()=>{try{if(state.job)show(await api('/api/jobs/'+state.job+'/cancel',{}));}catch(e){fail(e);}};
for(const btn of document.querySelectorAll('[data-question]'))btn.onclick=()=>{setMode('query');state.selected.clear();renderFiles();$('question').value=btn.dataset.question;$('question').focus();};
$('demo-edit').onclick=()=>{setMode('query');state.selected.clear();const f=state.files.find(f=>f.name==='discount.js'&&f.writable);if(f)state.selected.add(f.id);renderFiles();$('question').value='請修正 @discount.js 的折扣計算';};
$('question').oninput=()=>{
  scheduleSkillSuggestions();
  const match=$('question').value.match(/@([^\s@]*)$/);$('mentions').hidden=!match;$('mentions').replaceChildren();if(!match)return;
  for(const p of state.catalog.filter(p=>p.active&&p.id!==state.project&&('project-'+p.name).toLowerCase().includes(match[1].toLowerCase()))){
    const btn=node('button','@project-'+p.name+' · 唯讀 · '+p.path);btn.type='button';btn.onclick=async()=>{try{await setReferences([...state.references,p.id]);$('question').value=$('question').value.replace(/@([^\s@]*)$/,'@project-'+p.name+' ');$('mentions').hidden=true;}catch(e){fail(e);}};$('mentions').append(btn);
  }
  for(const f of state.files.filter(f=>f.name.toLowerCase().includes(match[1].toLowerCase())).slice(0,12)){const btn=node('button','@'+f.name);btn.type='button';btn.onclick=()=>{if(!state.selected.has(f.id))select(f.id);$('question').value=$('question').value.replace(/@([^\s@]*)$/,'@'+f.name+' ');$('mentions').hidden=true;$('question').focus();};$('mentions').append(btn);}
};
$('request-root').onclick=async()=>{state.grantedProject=null;$('open-granted-project').hidden=true;try{const create=$('create-folder').checked;const r=await api('/api/roots/request',{kind:$('root-kind').value,path:$('folder').value,create,write:$('allow-write').checked,verify:$('allow-verify').checked,ai:$('allow-ai').checked,minutes:Number($('grant-minutes').value)});state.request=r.id;$('permission-error').textContent='';$('notice').textContent='';$('root-status').textContent='待主機端核准：'+r.path+(create?'（確認時才建立資料夾）':'（尚未讀取）')+' '+JSON.stringify(r.permissions);}catch(e){fail(e);}};
$('approve-root').onclick=async()=>{try{if(!state.request)throw new Error('請先提出授權請求');if(!$('admin').value.trim())throw new Error('請先輸入終端顯示的本機管理碼');const result=await api('/api/roots/'+state.request+'/approve',{adminToken:$('admin').value.trim()});const global=result.root.kind==='global-reference';state.grantedProject=global?null:result.root.id;state.request=null;$('permission-error').textContent='';$('notice').textContent='';$('root-status').textContent=global?'全域唯讀授權完成，已加入目前與後續查詢；目前修改目標保持不變。':(result.created?'已建立空資料夾並':'已')+'依請求授權：'+result.root.label+'。按「開啟此專案」才會切換；也可關閉視窗繼續目前工作。';$('open-granted-project').hidden=global;await catalog();if(state.catalog.find(p=>p.id===state.project)?.active)await inventory();}catch(e){$('root-status').textContent='授權失敗：'+e.message+'。請確認瀏覽器網址是 http://127.0.0.1:4317/，且管理碼來自目前服務視窗。';fail(e);}};
function showConnectionStatus(connections,mode){
  state.serviceMode=mode;
  $('auto-memory-label').hidden=mode!=='real';if(mode!=='real')$('ai-auto-memory').checked=false;
  const ai=connections.ai;
  $('current-model').textContent='目前模型：'+(mode==='real'?`${ai.model} · ${ai.provider}`:mode==='error'?'設定未完成':'Mock（固定規則）');
  $('model-help').textContent=mode==='real'?ai.model:mode==='error'?'模型設定未完成':'Mock';$('model-help').title=mode==='real'?'目前使用的模型：'+ai.model:'目前使用固定規則模型';
  $('mode-ai-edit').hidden=mode!=='real';$('skill-panel').hidden=mode!=='real';$('connections').textContent=JSON.stringify(connections,null,2);$('mode-label').textContent='文件解析 real · AI '+mode+(mode==='real'?(ai.status==='connected'?'（連線已驗證）':'（待連線驗證）'):'')+' · 業務工具未接入';
  if(typeof syncImageCreationModeUI==='function')syncImageCreationModeUI();
}
$('ai-test').onclick=async()=>{const b=$('ai-test');b.disabled=true;try{const result=await api('/api/ai/test',{adminToken:$('admin').value.trim()});$('ai-test-status').textContent=result.message;showConnectionStatus(await api('/api/connections'),'real');}catch(e){$('ai-test-status').textContent=e.message;}finally{b.disabled=false;}};
(async()=>{const response=await fetch('/api/session');const config=await response.json();state.csrf=config.csrf;state.imageGeneration=config.imageGeneration||{enabled:false,model:null};state.imageProjectGeneration=config.imageProjectGeneration||{enabled:false,model:null};showConnectionStatus(config.connections,config.mode);$('ai-test').hidden=config.mode!=='real';$('ai-edit-label').hidden=config.mode!=='real';$('model-help').title+=config.mode==='real'?'；問題會送往設定的 AI，檔案仍須另授權外送。':'；支援「展示與測試」中的情境。';$('ai-label').lastChild.textContent=' 允許內容送往目前設定的 AI';$('registry').textContent=JSON.stringify(config.tools,null,2);await loadImageProjects();await loadVerificationRules();await catalog();await switchProject(state.catalog.some(p=>p.id===state.project)?state.project:'demo',{force:true,approved:true,selectSection:false});})().catch(fail);


$('load-edit').onclick=async()=>{try{if(state.selected.size!==1)throw new Error('請只選一份程式檔');if($('edit-content').value!==state.editorBaseline&&!await allowSwitch())return;const f=await api('/api/files/'+[...state.selected][0]);if(!f.writable)throw new Error('此檔案唯讀；修改請先切換目標並取得修改授權');if(!/\.(js|cjs|mjs|py|html|css|json)$/.test(f.name))throw new Error('請選取程式文字檔');state.editor=f;state.editorBaseline=f.content;$('edit-content').value=f.content;$('editor-file').textContent=f.path+' · 版本 '+f.hash;}catch(e){fail(e);}};
$('version-load').onclick=async()=>{try{const adminCode=$('admin').value.trim();if(!adminCode){openPermission();$('permission-error').textContent='請先輸入本次服務的本機管理碼，再載入版本清單。';$('admin').focus();return;}const result=await api('/api/versions/list',{adminToken:adminCode});const list=$('version-list');list.replaceChildren();for(const v of result.versions){const label=node('label',undefined,'version-item'),cb=document.createElement('input');cb.type='checkbox';cb.setAttribute('aria-label','選取備份：'+v.versionId);cb.value=v.id;cb.className='version-choice';label.append(cb,node('span',`${v.versionId} · ${v.path||'孤立備份'}${v.backupExists?'':' · 備份不存在'}`));list.append(label);}$('version-cleanup').hidden=!result.versions.length;}catch(e){fail(e);}};
$('version-cleanup').onclick=async()=>{const ids=[...document.querySelectorAll('.version-choice:checked')].map(e=>e.value);try{const result=await api('/api/versions/cleanup',{adminToken:$('admin').value.trim(),ids});$('notice').textContent=result.message;await $('version-load').onclick();}catch(e){fail(e);}};
$('propose-edit').onclick=async()=>{try{if(!state.editor)throw new Error('請先載入檔案');const after=$('edit-content').value;const j=await api('/api/proposals',{fileId:state.editor.id,version:state.editor.hash,after,adminToken:$('admin').value});state.editorBaseline=after;state.job=j.id;show(j);await listConversations(state.project);}catch(e){fail(e);}};
$('verify-file').onclick=async()=>{try{if(!state.editor)throw new Error('請先載入檔案');$('verification').textContent=JSON.stringify(await api('/api/files/'+state.editor.id+'/verify',{adminToken:$('admin').value}),null,2);}catch(e){fail(e);}};

$('project-builder').addEventListener('toggle',async()=>{
  if(!$('project-builder').open)return;
  try{const data=await api('/api/files');const previous=$('project-root').value;
    $('project-root').replaceChildren(...data.roots.filter(r=>r.id===state.project&&r.active&&r.permissions.write).map(r=>{const o=node('option',r.label+' · '+r.path);o.value=r.id;return o;}));
    if([...$('project-root').options].some(o=>o.value===previous))$('project-root').value=previous;
  }catch(e){fail(e);}
});
function showProject(p){
  const output=$('project-output');output.replaceChildren(node('span','MOCK 範本 · '+p.status+' · '+p.path));
  const plan=node('ol');plan.append(...p.plan.map(s=>node('li',s)));output.append(plan);
  for(const f of p.files){const d=node('details');d.append(node('summary','新增 '+f.name+'（原先不存在）'),node('pre',f.after,'diff-after'));output.append(d);}
  if(p.status==='awaiting_approval'){
    const apply=node('button','主機確認建立專案','primary');apply.id='project-apply';
    const cancel=node('button','取消建立');cancel.id='project-cancel';
    apply.onclick=async()=>{apply.disabled=true;cancel.disabled=true;try{showProject(await api('/api/projects/'+p.id+'/apply',{adminToken:$('admin').value}));await inventory();}catch(e){fail(e);output.append(node('p',e.message));}};
    cancel.onclick=async()=>{try{showProject(await api('/api/projects/'+p.id+'/cancel',{adminToken:$('admin').value}));}catch(e){fail(e);}};
    output.append(apply,cancel);
  }
  if(p.result){output.append(node('pre',JSON.stringify(p.result,null,2)));const link=node('a','開啟 Select2 功能預覽（會載入 CDN）');link.id='project-preview';link.href=p.result.previewUrl;link.target='_blank';link.rel='noopener noreferrer';output.append(link);}
}
$('project-propose').onclick=async()=>{const btn=$('project-propose');btn.disabled=true;$('notice').textContent='';try{showProject(await api('/api/projects',{rootId:$('project-root').value,name:$('project-name').value,template:'select2-products',adminToken:$('admin').value}));}catch(e){fail(e);}finally{btn.disabled=false;}};

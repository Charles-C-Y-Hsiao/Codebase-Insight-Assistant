function imagePromptIntent(prompt){
  const value=String(prompt||'').trim();
  if(/提示詞|prompt|怎麼|如何|是否|可以嗎|分析|說明|討論|建議/i.test(value.slice(0,100)))return false;
  return /(?:請|幫我|我要|製作|產生|生成|畫|設計|create|generate|draw|design)[\s\S]{0,160}(?:圖片|圖像|插圖|資訊圖表|流程圖|簡報圖|image|illustration|infographic)/i.test(value);
}
const IMAGE_MODEL_OPTIONS=['gpt-image-2.5-sunburst','gpt-image-1'];
const DEFAULT_IMAGE_MODEL='gpt-image-2.5-sunburst';
let imageHistoryPreviewTimer=0,imageHistoryPreviewSeq=0;
const currentImageProject=()=>state.imageProjects.find(project=>project.id===state.imageProjectId)||null;
const currentImageSeries=()=>currentImageProject()?.series?.find(series=>series.id===state.imageSeriesId)||null;
function renderWorkspaceSectionSelection(){const selection=state.workspaceSectionSelection,sidebarSelection=state.sidebarSelection;if(selection==='image'&&!sidebarSelection)state.sidebarSelection={type:'image-project',imageProjectId:state.imageProjectId};else if(selection==='project'&&!sidebarSelection)state.sidebarSelection={type:'project',projectId:state.project};const active=state.sidebarSelection;$('project-heading-main').setAttribute('aria-current',String(active?.type==='section-project'));$('image-project-section-toggle').setAttribute('aria-current',String(active?.type==='section-image'));$('workspace-sidebar').dataset.workspace=selection||'';document.querySelectorAll('#project-panel .project-row').forEach(row=>{const id=row.parentElement?.dataset.projectId,selected=active?.type==='project'&&active.projectId===id;row.classList.toggle('project-current',selected);row.querySelector('.project-choice')?.setAttribute('aria-current',String(selected));});if(typeof renderProjectList==='function')renderProjectList();}
function setWorkspaceSectionSelection(selection){state.workspaceSectionSelection=['project','image'].includes(selection)?selection:null;try{if(state.workspaceSectionSelection)sessionStorage.setItem('cda.workspaceSectionSelection',state.workspaceSectionSelection);else sessionStorage.removeItem('cda.workspaceSectionSelection');}catch{}renderWorkspaceSectionSelection();}
function imageSeriesJobs(seriesId=state.imageSeriesId){return [...state.taskJobs.values()].filter(job=>(job.imageProjectChat?.projectId===state.imageProjectId&&job.imageProjectChat?.seriesId===seriesId)||(job.imageCreation?.imageProject?.id===state.imageProjectId&&job.imageCreation?.seriesId===seriesId));}
function imageSeriesVersions(seriesId){return imageSeriesJobs(seriesId).filter(job=>job.kind==='image'&&job.imageCreation?.fileName).sort((a,b)=>(a.imageCreation.version||0)-(b.imageCreation.version||0));}
function imageSeriesDrafts(seriesId=state.imageSeriesId){return imageSeriesJobs(seriesId).filter(job=>job.imageProjectChat&&job.imageProjectDraft).sort((a,b)=>Number(a.startedAt||0)-Number(b.startedAt||0));}
function renderImageDiscussionReferences(){
  const section=$('image-discussion-references'),checkbox=$('image-use-latest'),preview=$('image-use-latest-preview'),latest=state.imageWorkspaceActive?imageSeriesVersions(state.imageSeriesId).at(-1):null;
  if(!latest?.imageCreation?.fileName){section.hidden=true;preview.replaceChildren();checkbox.checked=!state.imageTextOnlyMode;delete checkbox.dataset.seriesId;renderDraftImages();return;}
  section.hidden=false;
  if(checkbox.dataset.seriesId!==state.imageSeriesId){checkbox.checked=!state.imageTextOnlyMode;checkbox.dataset.seriesId=state.imageSeriesId;}
  if(state.imageTextOnlyMode)checkbox.checked=false;
  $('image-use-latest-text').textContent=imageReferenceName(1)+' · 最新圖片創作圖 · v'+latest.imageCreation.version+(state.imageTextOnlyMode?' · 未送出':'');
  const image={id:'generated-'+latest.id,name:'最新圖片創作圖 v'+latest.imageCreation.version,size:0,width:latest.imageCreation.width||1,height:latest.imageCreation.height||1,url:'/generated-images/'+encodeURIComponent(latest.id)},figure=attachmentPreview(image),img=figure.querySelector('img');
  if(img)bindImagePreview(img,()=>[{src:image.url,width:image.width,height:image.height,alt:image.name}]);
  preview.replaceChildren(figure);
  checkbox.onchange=renderDraftImages;
  renderDraftImages();
}
function filterImageHistory(){for(const [id,article] of state.articles){const job=state.taskJobs.get(id);if(!job)continue;article.hidden=state.imageWorkspaceActive&&(!((job.imageProjectChat?.projectId===state.imageProjectId&&job.imageProjectChat?.seriesId===state.imageSeriesId)||(job.imageCreation?.imageProject?.id===state.imageProjectId&&job.imageCreation?.seriesId===state.imageSeriesId)));}positionHistoryBottomButton();}
function renderTextDiff(target,before,after){const container=typeof target==='string'?$(target):target;container.replaceChildren();container.className='text-diff';if(String(before||'')===String(after||'')){container.append(node('span','無變更'));return;}const parts=window.Diff?.diffLines?window.Diff.diffLines(String(before||''),String(after||'')):[{added:true,value:String(after||'')}];for(const part of parts){const tag=part.added?'ins':part.removed?'del':'span',prefix=part.added?'+ ':part.removed?'− ':'  ';container.append(node(tag,prefix+part.value));}}
function renderSummaryCurrent(target,value,emptyText){const container=typeof target==='string'?$(target):target;const text=value||emptyText;if('value' in container)container.value=text;else{container.replaceChildren();container.className='text-diff';container.textContent=text;}}
function selectImageSeries(seriesId){state.imageSeriesId=seriesId;state.imagePreviousJobId=null;try{sessionStorage.setItem('cda.imageSeries.'+state.imageProjectId,seriesId||'');}catch{}renderImageProjectMemory();filterImageHistory();}
function setupImageSeriesPicker(picker){
  if(!window.jQuery?.fn?.select2)return;
  const $picker=window.jQuery(picker);
  if(document.activeElement===picker)picker.blur();
  if($picker.hasClass('select2-hidden-accessible'))$picker.select2('destroy');
  $picker.select2({width:'100%',dropdownParent:window.jQuery(document.body),dropdownCssClass:'image-series-select-dropdown',minimumResultsForSearch:Infinity});
  $picker.off('.imageSeriesPicker').on('select2:open.imageSeriesPicker',()=>requestAnimationFrame(()=>{const dropdown=$picker.data('select2')?.dropdown?.$dropdown?.[0];dropdown?.parentElement.classList.add('image-series-select-dropdown-host');})).on('select2:close.imageSeriesPicker',()=>{const dropdown=$picker.data('select2')?.dropdown?.$dropdown?.[0];dropdown?.parentElement.classList.remove('image-series-select-dropdown-host');});
  const $container=$picker.next('.select2-container');
  $container.attr('aria-label','切換圖片系列');
  $container.find('.select2-selection,.select2-selection__rendered,[role="textbox"]').attr('aria-label','切換圖片系列');
}
async function importImageVersion(job){const sourceProject=currentImageProject(),targets=state.imageProjects.filter(project=>project.id!==sourceProject?.id);if(!targets.length)throw new Error('請先建立另一個圖片專案');const choice=prompt('輸入目的圖片專案編號：\n'+targets.map((project,index)=>(index+1)+'. '+project.name).join('\n'),'1');if(choice===null)return;const destination=targets[Number(choice)-1];if(!destination)throw new Error('目的圖片專案編號不合法');const applyProjectSummary=confirm('是否把來源專案摘要套用到目的圖片專案？\n取消只會保留匯入來源，不改目的專案摘要。');const applySeriesSummary=confirm('是否把來源系列摘要套用到新系列？');const adminToken=prompt('輸入本次服務的 6 碼主機管理碼');if(adminToken===null)return;if(!/^[0-9a-f]{6}$/i.test(adminToken))throw new Error('主機管理碼必須是 6 碼十六進位');const result=await api('/api/image-projects/'+encodeURIComponent(sourceProject.id)+'/series/'+encodeURIComponent(job.imageCreation.seriesId)+'/import',{destinationProjectId:destination.id,sourceJobId:job.id,applyProjectSummary,applySeriesSummary,adminToken});state.imageProjectId=destination.id;state.imageProjects=state.imageProjects.map(project=>project.id===destination.id?result.project:project);setImageWorkspaceActive(true);selectImageSeries(result.seriesId);showImageJob(result.job);}
function renderImageProjectMemory(){
  $('image-history-preview').hidden=!state.imageWorkspaceActive||state.imageCreationMode;
  const project=currentImageProject(),series=currentImageSeries(),panel=$('image-project-memory');panel.hidden=!state.imageWorkspaceActive;if(!state.imageWorkspaceActive){$('image-discussion-references').hidden=true;renderDraftImages();return;}
  const versions=series?imageSeriesVersions(series.id):[],latest=versions.at(-1),summary=series?.memory?.summary||'尚未建立系列摘要',line=series?series.name+' · '+(latest?'v'+latest.imageCreation.version:'尚無版本'):'尚未建立圖片系列';
  const drafts=series?imageSeriesDrafts(series.id).filter(job=>job.imageProjectDraft.status==='completed'):[];
  const picker=$('image-series-select');picker.replaceChildren();const placeholder=node('option','尚未建立系列');placeholder.value='';picker.append(placeholder);for(const item of project?.series||[]){const option=node('option',item.name);option.value=item.id;picker.append(option);}picker.disabled=!project?.series?.length;picker.value=state.imageSeriesId||'';picker.title=series?.name||'尚未建立系列';setupImageSeriesPicker(picker);
  $('image-project-memory-line').textContent=line;const summaryButton=$('image-project-memory-summary');summaryButton.dataset.tooltip=summary;if(!summaryButton.dataset.tooltipBound){bindFileTooltip(summaryButton);summaryButton.dataset.tooltipBound='true';}$('image-summary-update').disabled=!series||!imageSeriesJobs(series.id).some(job=>![...(project?.memory?.sourceJobIds||[]),...(series.memory?.sourceJobIds||[])].includes(job.id));$('image-summary-copy').disabled=!series;$('image-draft-create').disabled=!series;$('image-draft-create').textContent='選擇來源並創作';renderImageDiscussionReferences();
  $('image-project-shared-summary').textContent='專案摘要：'+(project?.memory?.summary||'尚未建立');const list=$('image-series-list');list.replaceChildren();
  for(const item of project?.series||[]){
    const row=node('div',undefined,'image-series-row');row.setAttribute('aria-current',String(item.id===state.imageSeriesId));
    const seriesSummary=item.memory?.summary||'尚未建立系列摘要';
    const choose=node('button',undefined,'image-series-choice');choose.type='button';choose.id='image-series-toggle-'+item.id;choose.dataset.tooltip=seriesSummary;bindFileTooltip(choose);
    const expandIcon=icon('br-angle-small-right');expandIcon.id='image-series-toggle-icon-'+item.id;expandIcon.setAttribute('aria-hidden','true');choose.append(expandIcon,node('span',item.name+' · '+seriesSummary.slice(0,30),'image-series-choice-label'));
    const menu=node('button');menu.id='image-series-menu-'+item.id;menu.type='button';menu.title='系列操作';menu.setAttribute('aria-label','系列操作');menu.append(icon('rc-settings-sliders'));menu.dataset.seriesId=item.id;menu.dataset.tooltip='系列操作：重新命名或永久刪除';bindFileTooltip(menu);menu.onclick=()=>openImageSeriesActions(item);
    const versionsBox=node('div',undefined,'image-series-versions');versionsBox.id='image-series-versions-'+item.id;versionsBox.hidden=!state.imageSeriesExpanded.has(item.id);choose.setAttribute('aria-controls',versionsBox.id);choose.setAttribute('aria-expanded',String(!versionsBox.hidden));choose.title=versionsBox.hidden?'展開系列內容':'收合系列內容';choose.dataset.tooltip=choose.title;choose.setAttribute('aria-label',choose.title);expandIcon.className='fi fi-br-angle-small-'+(versionsBox.hidden?'right':'down');
    const summary=node('div',undefined,'image-series-summary');summary.dataset.tooltip=seriesSummary;bindFileTooltip(summary);summary.append(node('span','系列摘要 v'+(item.memory?.version||0),'image-series-label'),node('span',seriesSummary,'image-series-summary-text'));versionsBox.append(summary);
    const drafts=imageSeriesDrafts(item.id);if(drafts.length)versionsBox.append(node('div','候選提示詞版本（'+drafts.length+'）','image-series-section'));
    for(const [index,job] of drafts.entries()){const draft=job.imageProjectDraft,label=draft.status==='completed'?'候選提示詞版本 '+(index+1):draft.status==='pending'?'候選提示詞版本 '+(index+1)+' · 正在整理':'候選提示詞版本 '+(index+1)+' · 未產生候選提示詞';const draftRow=node('div',undefined,'image-series-version-row'),draftButton=node('button',label,'image-series-version');draftButton.dataset.tooltip=draft.status==='completed'?['Agent 理解：',draft.agentUnderstanding,'\n\n候選完整提示詞：',draft.prompt].join(''):draft.error||'正在整理候選提示詞';bindFileTooltip(draftButton);draftButton.onclick=()=>{selectImageSeries(item.id);state.articles.get(job.id)?.scrollIntoView({block:'center'});};draftRow.append(draftButton);versionsBox.append(draftRow);}
    const versions=imageSeriesVersions(item.id);if(versions.length)versionsBox.append(node('div','圖片版本（'+versions.length+'）','image-series-section'));
    for(const job of versions){const versionRow=node('div',undefined,'image-series-version-row'),version=node('button','圖片 v'+job.imageCreation.version+' · '+(job.imageCreation.currentRequest||job.question).slice(0,30),'image-series-version');version.dataset.tooltip=job.imageCreation.prompt||job.question;bindFileTooltip(version);version.onclick=()=>{selectImageSeries(item.id);state.articles.get(job.id)?.scrollIntoView({block:'center'});};const copy=iconButton('rr-copy','複製此版本到其他圖片專案');copy.onclick=()=>importImageVersion(job).catch(fail);versionRow.append(version,copy);versionsBox.append(versionRow);}
    if(!drafts.length&&!versions.length)versionsBox.append(node('span','尚無討論草稿或圖片版本','muted'));
    choose.onclick=()=>{const selecting=state.imageSeriesId!==item.id;state.imageSeriesId=item.id;state.imagePreviousJobId=null;try{sessionStorage.setItem('cda.imageSeries.'+state.imageProjectId,item.id);}catch{}if(selecting||versionsBox.hidden)state.imageSeriesExpanded.add(item.id);else state.imageSeriesExpanded.delete(item.id);renderImageProjectMemory();filterImageHistory();};
    bindWorkspaceHover(row);row.append(choose,menu,versionsBox);list.append(row);
  }if(!list.childElementCount)list.append(node('span','送出第一則圖片討論後會自動建立系列','muted'));
  if($('image-history-preview').open)scheduleImageHistoryPreview();
}
function scheduleImageHistoryPreview(){
  clearTimeout(imageHistoryPreviewTimer);if(!state.imageWorkspaceActive||state.imageCreationMode||!$('image-history-preview').open)return;
  imageHistoryPreviewTimer=setTimeout(async()=>{
    const sequence=++imageHistoryPreviewSeq,projectId=state.imageProjectId,seriesId=state.imageSeriesId,question=$('question').value,status=$('image-history-preview-status'),groups=$('image-history-preview-groups');
    if(!projectId)return;status.textContent='正在取得本次圖片討論的歷史候選…';groups.replaceChildren();
    try{
      const preview=await api('/api/image-project-chat/preview',{imageProjectId:projectId,seriesId,question});if(sequence!==imageHistoryPreviewSeq||!state.imageWorkspaceActive||projectId!==state.imageProjectId||seriesId!==state.imageSeriesId)return;
      if(!preview.available){status.textContent=preview.reason;return;}
      status.textContent=state.imageTextOnlyMode?'送出前候選預覽 · 專案與系列摘要固定保留，歷史文字待篩選；圖片不會送入 LLM。':'送出前候選預覽 · 專案與系列摘要固定保留，歷史文字待篩選；圖片只會在第二階段送入。';
      const add=(title,value,label)=>{const detail=node('details'),summary=node('summary',title+' · '+label),pre=node('pre',typeof value==='string'?value:JSON.stringify(value,null,2));detail.append(summary,pre);groups.append(detail);};
      add('專案摘要',preview.fixed.projectSummary||'尚無摘要','固定保留');add('系列摘要',preview.fixed.seriesSummary||'尚無摘要','固定保留');
      for(const [index,item] of preview.candidates.entries())add(`${index+1}. ${item.question}`,item,'待篩選');
      add('篩選 LLM 收到的完整候選文字',preview.candidateInput,'待篩選');
    }catch(error){if(sequence===imageHistoryPreviewSeq&&!error.stale)status.textContent='歷史候選預覽失敗：'+error.message;}
  },220);
}
$('image-history-preview').addEventListener('toggle',()=>{$('image-history-preview-toggle-icon').className='fi fi-br-angle-small-'+($('image-history-preview').open?'down':'right');scheduleImageHistoryPreview();});
$('question').addEventListener('input',scheduleImageHistoryPreview);
async function reloadImageProjects(){const data=await api('/api/image-projects');state.imageProjects=data.projects||[];const project=currentImageProject();if(project&&!project.series.some(series=>series.id===state.imageSeriesId)){let remembered='';try{remembered=sessionStorage.getItem('cda.imageSeries.'+project.id)||'';}catch{}state.imageSeriesId=project.series.some(series=>series.id===remembered)?remembered:project.series.toSorted((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)))[0]?.id||null;}renderImageProjects();renderImageProjectMemory();filterImageHistory();}
async function loadSelectedImageHistory(projectId){
  const history=await api('/api/image-project-history?imageProjectId='+encodeURIComponent(projectId));
  if(!state.imageWorkspaceActive||state.imageProjectId!==projectId)return;
  for(const job of history.jobs||[])show(job);
  renderImageProjectMemory();filterImageHistory();
}
function setImageWorkspaceActive(active){
  state.imageWorkspaceActive=!!active;
  if(active&&$('notice').textContent===projectAuthorizationNotice)$('notice').textContent='';
  if(active)setWorkspaceSectionSelection('image');
  if(active&&state.editingTask&&typeof endTaskEdit==='function')endTaskEdit(false);
  if(!active){state.imageCreationMode=false;state.imagePreviousJobId=null;}
  try{sessionStorage.setItem('cda.imageWorkspaceActive',active?'1':'0');if(state.imageProjectId)sessionStorage.setItem('cda.imageProject',state.imageProjectId);}catch{}
  const project=currentImageProject();if(active&&project&&!project.series.some(series=>series.id===state.imageSeriesId))state.imageSeriesId=project.series.toSorted((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)))[0]?.id||null;renderImageProjects();syncImageCreationModeUI();renderImageProjectMemory();filterImageHistory();
  if(active&&project)loadSelectedImageHistory(project.id).catch(error=>{if(state.imageWorkspaceActive&&state.imageProjectId===project.id)fail(error);});
}
function editImageProject(project,row){
  const form=node('div',undefined,'image-project-rename-form'),input=node('input'),save=iconButton('bs-check-circle','儲存圖片專案名稱'),cancel=iconButton('bs-cross-circle','取消重新命名');
  input.className='image-project-rename-input';input.maxLength=64;input.setAttribute('aria-label','圖片專案名稱');input.value=project.name===project.id.split('-').at(-1).slice(-11)?'':project.name;input.placeholder='輸入圖片專案名稱';
  const finish=()=>renderImageProjects();
  save.onclick=async()=>{save.disabled=true;try{const result=await api('/api/image-projects/'+encodeURIComponent(project.id),{name:input.value},undefined,'PATCH');state.imageProjects=state.imageProjects.map(item=>item.id===project.id?result.project:item);$('image-project-status').textContent='已重新命名：'+result.project.folderName;finish();}catch(error){$('image-project-status').textContent=error.message;save.disabled=false;}};
  cancel.onclick=finish;input.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();save.click();}else if(event.key==='Escape')finish();};form.append(input,save,cancel);row.replaceChildren(form);input.focus();input.select();
}
function renderImageProjects(){
  const list=$('image-project-list');list.replaceChildren();
  for(const project of state.imageProjects){
    const row=node('div');row.id='image-project-row-'+project.id;row.className='image-project-row';const selected=state.sidebarSelection?.type==='image-project'&&project.id===state.sidebarSelection.imageProjectId;row.setAttribute('aria-current',String(selected));bindWorkspaceHover(row);
    const button=node('button',undefined,'image-project-choice');button.type='button';button.role='option';button.dataset.projectId=project.id;button.setAttribute('aria-selected',String(selected));button.title=project.folderName;
    const marker=node('i',undefined,'fi '+(selected?'fi-sr-check-circle':'fi-rr-folder'));marker.setAttribute('aria-hidden','true');button.append(marker,node('span',project.folderName));
    button.onclick=()=>{state.imageProjectId=project.id;state.imageSeriesId=null;state.sidebarSelection={type:'image-project',imageProjectId:project.id};setImageWorkspaceActive(true);$('image-project-status').textContent='目前圖片專案：'+project.folderName;};
    const copy=iconButton('br-window-restore','複製圖片專案名稱');copy.className='image-project-copy';copy.onclick=async()=>{try{await navigator.clipboard.writeText(project.folderName);$('image-project-copy-message').textContent=project.folderName;$('image-project-copy-dialog').showModal();}catch{$('image-project-status').textContent='瀏覽器無法寫入剪貼簿';}};
    const rename=iconButton('rr-file-edit','重新命名 '+project.folderName);rename.className='image-project-rename';rename.onclick=()=>editImageProject(project,row);row.append(button,copy,rename);list.append(row);
  }
  if(!state.imageProjects.length)list.append(node('span','尚未建立圖片專案','muted'));
}
async function loadImageProjects(){
  const data=await api('/api/image-projects');state.imageProjects=data.projects||[];
  let remembered='',active=false;try{remembered=sessionStorage.getItem('cda.imageProject')||'';active=sessionStorage.getItem('cda.imageWorkspaceActive')==='1';}catch{}
  state.imageProjectId=state.imageProjects.some(project=>project.id===remembered)?remembered:state.imageProjects[0]?.id||null;state.imageWorkspaceActive=active&&!!state.imageProjectId;const project=currentImageProject();if(project){let series='';try{series=sessionStorage.getItem('cda.imageSeries.'+project.id)||'';}catch{}state.imageSeriesId=project.series?.some(item=>item.id===series)?series:project.series?.toSorted((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)))[0]?.id||null;}
  if(state.imageWorkspaceActive)setWorkspaceSectionSelection('image');else if(state.workspaceSectionSelection==='image')setWorkspaceSectionSelection(null);else renderWorkspaceSectionSelection();renderImageProjects();syncImageCreationModeUI();
}
function syncImageCreationModeUI(){
  const workspace=state.imageWorkspaceActive===true,enabled=workspace&&state.imageCreationMode===true,real=state.serviceMode==='real';
  $('image-create-mode-label').hidden=!state.imageProjectGeneration.enabled||!workspace;
  $('image-create-mode').disabled=false;
  $('image-create-mode').checked=enabled;
  $('auto-memory-label').hidden=workspace||!real;
  const aiLabel=$('ai-edit-label'),aiCheckbox=$('ai-allow-edits'),imageProject=currentImageProject(),authorized=imageProject?.aiAllowed!==false;
  aiLabel.hidden=!real;
  aiLabel.lastChild.textContent=workspace?' 允許內容送往目前設定的 AI':' 允許 AI 修改';
  aiCheckbox.setAttribute('aria-label',workspace?'允許內容送往目前設定的 AI':'允許 AI 修改');
  aiCheckbox.checked=workspace||state.mode==='ai-edit';
  aiLabel.title=workspace&&!authorized?'目前圖片專案未允許內容送往 AI。':'控制本次內容是否可以送往目前設定的 AI。';
  $('composer-context').hidden=false;
  $('conversation-memory').hidden=workspace;
  $('skill-panel').hidden=workspace||!real;
  $('scope-banner').hidden=workspace;
  $('image-project-memory').hidden=!workspace;
  $('question').placeholder=enabled?'描述想創作的圖片內容':workspace?'討論圖片主題、構圖、風格、色彩或提示詞':'想做什麼都可以';
  const latest=$('image-use-latest');if(latest){latest.disabled=state.imageTextOnlyMode;latest.checked=state.imageTextOnlyMode?false:latest.checked;latest.title=state.imageTextOnlyMode?'目前圖片 API 尚無解析圖片能力，圖片不會送出。':'';}
  const createButton=$('composer-create-image');if(createButton){createButton.disabled=false;createButton.title=state.imageTextOnlyMode?'僅用文字提示詞創作圖片；不傳送任何參考圖。':'創作圖片';}
}
function setImageCreationMode(enabled){
  state.imageCreationMode=!!enabled;
  if(enabled&&state.mode==='edit')setMode('query');
  syncImageCreationModeUI();
}
$('image-create-mode').onchange=()=>{state.imagePreviousJobId=null;setImageCreationMode($('image-create-mode').checked);};
$('image-project-toggle').onclick=()=>{state.sidebarSelection={type:'section-image'};setWorkspaceSectionSelection('image');renderImageProjects();const panel=$('image-project-panel'),toggle=$('image-project-toggle'),opening=panel.hidden;panel.hidden=!opening;toggle.setAttribute('aria-expanded',String(opening));$('image-project-toggle-icon').className='fi fi-br-angle-small-'+(opening?'down':'right');};
$('image-project-copy-close').onclick=()=>$('image-project-copy-dialog').close();$('image-project-copy-dialog').addEventListener('click',event=>{if(event.target===$('image-project-copy-dialog'))$('image-project-copy-dialog').close();});
$('image-project-add').onclick=async()=>{
  const button=$('image-project-add');button.disabled=true;$('image-project-status').textContent='';
  try{
    const result=await api('/api/image-projects',{id:crypto.randomUUID()});state.imageProjects.push(result.project);state.imageProjectId=result.project.id;setImageWorkspaceActive(true);
    $('image-project-status').textContent='已建立：'+result.project.folderName+'；可使用鉛筆圖示重新命名。';
  }catch(error){$('image-project-status').textContent=error.message;}finally{button.disabled=false;}
};
async function consumeImageDraftAttempt(operation,outcome,reason=''){
  const imageCount=state.draftImages.length;
  state.draftImages=[];renderDraftImages();
  try{await api('/api/image-project-attempt',{operation,outcome,reason,imageCount,imageProjectId:state.imageProjectId,seriesId:state.imageSeriesId});}
  catch(error){if(!error.stale)$('image-notice').textContent='附件草稿已從畫面移除，但後端清除／紀錄失敗：'+error.message;}
}
async function submitImageProjectChat(){
  let accepted=false;
  try{
    const question=$('question').value.trim();if(!question){$('question').focus();throw new Error('請先輸入圖片創作討論內容');}
    if(!$('ai-allow-edits').checked)throw new Error('請先勾選「允許內容送往目前設定的 AI」');
    const project=state.imageProjects.find(item=>item.id===state.imageProjectId);if(!project)throw new Error('請先建立或選擇圖片創作專案');
    if(state.imageSeriesId&&/(?:另一張圖|全新構圖|不要沿用上一張|建立新系列|新圖片系列)/.test(question)&&confirm('這段需求看起來是另一張圖。要建立新圖片系列並將這則對話放入新系列嗎？')){const result=await api('/api/image-projects/'+encodeURIComponent(project.id)+'/series',{name:question.slice(0,20)});state.imageProjects=state.imageProjects.map(item=>item.id===project.id?result.project:item);selectImageSeries(result.series.id);}
    const includeLatestImage=!state.imageTextOnlyMode&&$('image-use-latest').checked,hasLatest=!!imageSeriesVersions(state.imageSeriesId).at(-1);if(!state.imageTextOnlyMode&&(state.draftImages.length||(includeLatestImage&&hasLatest))&&!state.imagesSupported)throw new Error('目前模型／端點未啟用圖片理解能力；附件未送出討論');
    const selectedImages=state.imageTextOnlyMode?[]:state.draftImages.filter(image=>image.selected===true);
    if(selectedImages.length+(includeLatestImage&&hasLatest?1:0)>5)throw new Error('圖片討論最多 5 張參考圖，請減少貼圖或取消最新系列圖');
    collapseComposerForExecution();const job=await api('/api/image-project-chat',{question,imageProjectId:project.id,seriesId:state.imageSeriesId,imageIds:selectedImages.map(image=>image.id),includeLatestImage});accepted=true;
    await consumeImageDraftAttempt('discussion','submitted');
    if($('question').value.trim()===question)$('question').value='';state.questionBaseline='';state.activeSkill=null;state.job=job.id;show(job);moveHistoryToBottom();if(!state.imageSeriesId&&job.imageProjectChat?.seriesId)selectImageSeries(job.imageProjectChat.seriesId);await listConversations(state.project);await poll(job);restoreComposerAfterExecution();await reloadImageProjects();
  }catch(error){if(!accepted)await consumeImageDraftAttempt('discussion','rejected',error.message);throw error;}
}
$('image-project-memory-summary').onclick=()=>{const content=$('image-project-memory-content'),opening=content.hidden;content.hidden=!opening;$('image-project-memory-summary').setAttribute('aria-expanded',String(opening));$('image-project-memory-summary').querySelector('.fi').className='fi fi-br-angle-small-'+(opening?'down':'right');$('composer-panel').classList.toggle('image-memory-expanded',opening);};
$('image-series-select').onchange=event=>{if(event.target.value&&event.target.value!==state.imageSeriesId)selectImageSeries(event.target.value);};
$('image-draft-create').onclick=()=>submitImageCreation({projectMode:true,sourceChoice:true}).catch(fail);
$('image-series-new').onclick=async()=>{const project=currentImageProject();if(!project)return;try{const result=await api('/api/image-projects/'+encodeURIComponent(project.id)+'/series',{name:'新圖片系列'});state.imageProjects=state.imageProjects.map(item=>item.id===project.id?result.project:item);selectImageSeries(result.series.id);}catch(error){fail(error);}};
$('image-summary-copy').onclick=async()=>{const project=currentImageProject(),series=currentImageSeries();if(!series)return;const text=['圖片專案摘要',project.memory?.summary||'（無）','','圖片系列摘要',series.memory?.summary||'（無）'].join('\n');try{await navigator.clipboard.writeText(text);$('image-summary-copy').textContent='已複製';setTimeout(()=>$('image-summary-copy').textContent='複製摘要',1200);}catch{fail(new Error('瀏覽器無法寫入剪貼簿'));}};
function setImageSummaryLoading(loading){
  const dialog=$('image-summary-dialog');
  $('image-summary-loading').hidden=!loading;
  $('image-summary-close').disabled=loading;
  $('image-summary-cancel').disabled=loading;
  $('image-summary-modify').disabled=loading;
  $('image-summary-apply').disabled=loading;
  dialog.classList.toggle('image-summary-loading',loading);
}
async function openImageSummary(){const project=currentImageProject(),series=currentImageSeries();if(!project||!series)return;const button=$('image-summary-update'),dialog=$('image-summary-dialog');button.disabled=true;$('image-summary-error').textContent='';if(!dialog.open)dialog.showModal();setImageSummaryLoading(true);try{const data=await api('/api/image-projects/'+encodeURIComponent(project.id)+'/series/'+encodeURIComponent(series.id)+'/summary-candidate',{});state.imageSummaryCandidate=data.candidate;$('image-summary-project').value=data.candidate.projectSummary;$('image-summary-series').value=data.candidate.seriesSummary;$('image-summary-project').readOnly=true;$('image-summary-series').readOnly=true;renderSummaryCurrent('image-summary-project-current',data.current.projectSummary,'尚未建立專案摘要');renderSummaryCurrent('image-summary-series-current',data.current.seriesSummary,'尚未建立系列摘要');$('image-summary-error').textContent='';setImageSummaryLoading(false);}catch(error){setImageSummaryLoading(false);$('image-summary-error').textContent=error.message;}finally{button.disabled=false;}}
function closeImageSummary(){if(!$('image-summary-loading').hidden)return;$('image-summary-dialog').close();}
$('image-summary-update').onclick=openImageSummary;$('image-summary-close').onclick=$('image-summary-cancel').onclick=closeImageSummary;
$('image-summary-modify').onclick=()=>{$('image-summary-project').readOnly=false;$('image-summary-series').readOnly=false;$('image-summary-modify').disabled=true;$('image-summary-project').focus();};
$('image-summary-apply').onclick=async()=>{const project=currentImageProject(),series=currentImageSeries(),candidate=state.imageSummaryCandidate;try{const result=await api('/api/image-projects/'+encodeURIComponent(project.id)+'/series/'+encodeURIComponent(series.id)+'/apply-summary',{projectSummary:$('image-summary-project').value,seriesSummary:$('image-summary-series').value,applyProject:$('image-summary-apply-project').checked,applySeries:$('image-summary-apply-series').checked,sourceJobIds:candidate.sourceJobIds});state.imageProjects=state.imageProjects.map(item=>item.id===project.id?result.project:item);state.imageSummaryCandidate=null;$('image-summary-dialog').close();renderImageProjectMemory();}catch(error){$('image-summary-error').textContent=error.message;}};
function setImageSeriesActionsBusy(busy){for(const id of ['image-series-actions-close','image-series-actions-cancel','image-series-actions-delete','image-series-actions-save','image-series-actions-name'])$(id).disabled=busy;}
function openImageSeriesActions(series){const dialog=$('image-series-actions-dialog');dialog.dataset.seriesId=series.id;$('image-series-actions-name').value=series.name;$('image-series-actions-error').textContent='';setImageSeriesActionsBusy(false);dialog.showModal();$('image-series-actions-name').focus();$('image-series-actions-name').select();}
function closeImageSeriesActions(){if($('image-series-actions-dialog').dataset.busy==='true')return;$('image-series-actions-dialog').close();}
async function saveImageSeriesName(){const dialog=$('image-series-actions-dialog'),project=currentImageProject(),seriesId=dialog.dataset.seriesId,name=$('image-series-actions-name').value.trim();if(!project||!seriesId){$('image-series-actions-error').textContent='找不到目前圖片系列，請關閉後重新選擇';return;}if(!name){$('image-series-actions-error').textContent='請輸入圖片系列名稱';$('image-series-actions-name').focus();return;}dialog.dataset.busy='true';setImageSeriesActionsBusy(true);$('image-series-actions-error').textContent='';try{const result=await api('/api/image-projects/'+encodeURIComponent(project.id)+'/series/'+encodeURIComponent(seriesId),{name},undefined,'PATCH');state.imageProjects=state.imageProjects.map(value=>value.id===project.id?result.project:value);dialog.close();renderImageProjectMemory();}catch(error){$('image-series-actions-error').textContent=error.message;}finally{dialog.dataset.busy='false';setImageSeriesActionsBusy(false);}}
$('image-series-actions-close').onclick=$('image-series-actions-cancel').onclick=closeImageSeriesActions;
$('image-series-actions-save').onclick=()=>saveImageSeriesName();
$('image-series-actions-name').oninput=()=>{$('image-series-actions-error').textContent='';};
$('image-series-actions-name').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();saveImageSeriesName();}};
$('image-series-actions-dialog').addEventListener('cancel',event=>{if(event.currentTarget.dataset.busy==='true')event.preventDefault();});
$('image-series-actions-delete').onclick=()=>{const dialog=$('image-series-actions-dialog'),series=currentImageProject()?.series.find(item=>item.id===dialog.dataset.seriesId);if(!series){$('image-series-actions-error').textContent='找不到目前圖片系列，請關閉後重新選擇';return;}dialog.close();openImageSeriesDelete(series);};
function openImageSeriesDelete(series){const project=currentImageProject(),jobs=imageSeriesJobs(series.id),images=jobs.filter(job=>job.kind==='image'&&job.imageCreation?.fileName);$('image-series-delete-message').textContent='將永久刪除「'+series.name+'」的 '+jobs.length+' 筆對話／任務與 '+images.length+' 個圖片版本及本機檔案。';$('image-series-delete-admin').value='';$('image-series-delete-error').textContent='';$('image-series-delete-dialog').dataset.seriesId=series.id;$('image-series-delete-dialog').showModal();}
$('image-series-delete-close').onclick=$('image-series-delete-cancel').onclick=()=>$('image-series-delete-dialog').close();
$('image-series-delete-confirm').onclick=async()=>{const project=currentImageProject(),seriesId=$('image-series-delete-dialog').dataset.seriesId,adminToken=$('image-series-delete-admin').value.trim();if(!/^[0-9a-f]{6}$/i.test(adminToken)){$('image-series-delete-error').textContent='請輸入本次服務的 6 碼十六進位管理碼';return;}try{const result=await api('/api/image-projects/'+encodeURIComponent(project.id)+'/series/'+encodeURIComponent(seriesId),{adminToken},undefined,'DELETE');for(const [id,job] of state.taskJobs)if((job.imageProjectChat?.seriesId===seriesId)||(job.imageCreation?.seriesId===seriesId)){state.articles.get(id)?.remove();state.articles.delete(id);state.taskJobs.delete(id);}state.imageProjects=state.imageProjects.map(item=>item.id===project.id?result.project:item);state.imageSeriesId=result.project.series.toSorted((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)))[0]?.id||null;$('image-series-delete-dialog').close();renderImageProjectMemory();filterImageHistory();}catch(error){$('image-series-delete-error').textContent=error.message;}};
function confirmImageCreation(prompt,version,{projectMode=false,draftJobId=null,previous=null}={}){
  const dialog=$('image-create-dialog');
  const picker=$('image-create-model-select');
  const selected=DEFAULT_IMAGE_MODEL;
  const availability=projectMode?state.imageProjectGeneration:state.imageGeneration;
  let focusPickerSelection=()=>{};
  if(window.jQuery?.fn?.select2){
    const $picker=window.jQuery(picker);
    // Select2 hides the native select with aria-hidden. Move focus away before
    // destroying/recreating it, otherwise Chrome reports a focused hidden
    // descendant and blocks aria-hidden.
    if(document.activeElement===picker)picker.blur();
    if($picker.hasClass('select2-hidden-accessible'))$picker.select2('destroy');
    $picker.select2({width:'250px',dropdownParent:window.jQuery('#image-create-model-picker'),minimumResultsForSearch:Infinity});
    const $container=$picker.next('.select2-container');
    const alignModelDropdown=()=>{const selection=$container.find('.select2-selection')[0],host=[...document.querySelectorAll('#image-create-model-picker > .select2-container--open')].find(item=>item.querySelector('.select2-dropdown'));if(!selection||!host)return;const bounds=selection.getBoundingClientRect();Object.assign(host.style,{position:'fixed',left:Math.round(bounds.left)+'px',top:Math.round(bounds.top)+'px',width:Math.round(bounds.width)+'px'});};
    $picker.off('.imageCreateModelDropdown').on('select2:open.imageCreateModelDropdown',()=>requestAnimationFrame(()=>requestAnimationFrame(alignModelDropdown))).on('select2:close.imageCreateModelDropdown',()=>{const host=[...document.querySelectorAll('#image-create-model-picker > .select2-container--open')].find(item=>item.querySelector('.select2-dropdown'));host?.removeAttribute('style');});
    $container.attr('aria-label','選擇圖片模型');
    const selection=$container.find('.select2-selection')[0];
    $container.find('.select2-selection,.select2-selection__rendered,[role="textbox"]').attr('aria-label','選擇圖片模型');
    $container.find('input').attr('aria-label','搜尋圖片模型');
    $picker.val(selected).trigger('change');
    $picker.off('change.imageCreation').on('change.imageCreation',()=>{$('image-create-model').textContent='圖片模型：'+$picker.val();});
    focusPickerSelection=()=>{if(dialog.open&&selection)selection.focus();};
  }else picker.value=selected;
  const project=projectMode?currentImageProject():null,series=projectMode?currentImageSeries():null,drafts=projectMode?imageSeriesDrafts(series?.id).filter(job=>job.imageProjectDraft.status==='completed'):[],versions=projectMode?imageSeriesVersions(series?.id).filter(job=>job.imageCreation?.fileName):[],draftSelect=$('image-create-draft-select');
  const projectVersions=project?.memory?.versions||[],seriesVersions=series?.memory?.versions||[];renderTextDiff('image-create-project-summary',projectVersions.at(-2)?.summary||'',project?.memory?.summary||'');renderTextDiff('image-create-series-summary',seriesVersions.at(-2)?.summary||'',series?.memory?.summary||'');$('image-create-memory').hidden=!projectMode;$('image-create-prompt').hidden=projectMode;$('image-create-prompt').textContent=prompt;$('image-create-draft-label').hidden=!projectMode||!drafts.length;
  $('image-create-draft-label').hidden=!projectMode;$('image-create-draft-label').querySelector('span').textContent='提示詞來源';draftSelect.setAttribute('aria-label','選擇提示詞來源');$('image-create-source-panel').prepend($('image-create-draft-label'));
  draftSelect.replaceChildren();const noneOption=node('option','不使用候選提詞或上一版');noneOption.value='';draftSelect.append(noneOption);
  for(const job of drafts){const option=node('option','候選提示詞版本 '+(drafts.indexOf(job)+1)+' · '+(job.imageProjectDraft.agentUnderstanding||job.question||'').slice(0,30));option.value='draft:'+job.id;draftSelect.append(option);}
  for(const job of versions){const option=node('option','延續圖片 v'+(job.imageCreation.version||'?')+' · '+(job.question||'').slice(0,30));option.value='previous:'+job.id;draftSelect.append(option);}
  if(window.jQuery?.fn?.select2){const $draft=window.jQuery(draftSelect);if(document.activeElement===draftSelect)draftSelect.blur();if($draft.hasClass('select2-hidden-accessible'))$draft.select2('destroy');$draft.select2({width:'250px',dropdownParent:window.jQuery('#image-create-dialog'),minimumResultsForSearch:Infinity});const $draftContainer=$draft.next('.select2-container');$draftContainer.attr('aria-label','選擇提示詞來源');$draftContainer.find('.select2-selection,.select2-selection__rendered,[role="textbox"]').attr('aria-label','選擇提示詞來源');}
  const initialSource=previous?.id?'previous:'+previous.id:draftJobId?'draft:'+draftJobId:'';draftSelect.value=[...draftSelect.options].some(option=>option.value===initialSource)?initialSource:'';if(window.jQuery?.fn?.select2)window.jQuery(draftSelect).trigger('change.select2');
  let selectedDraftId=null,selectedPrevious=null;
  const renderPrevious=()=>{const section=$('image-create-previous'),list=$('image-create-previous-preview'),previous=selectedPrevious;if(!previous?.imageCreation?.fileName){section.hidden=true;list.replaceChildren();return;}section.hidden=false;$('image-create-previous-label').textContent=imageReferenceName(1)+(state.imageTextOnlyMode?' · 上一版圖片（僅供畫面查看，不傳入圖片模型）':' · 上一版圖片（將作為修改基礎）');const image={id:'generated-'+previous.id,name:'圖片 v'+(previous.imageCreation.version||'?'),size:0,width:previous.imageCreation.width||1,height:previous.imageCreation.height||1,url:'/generated-images/'+encodeURIComponent(previous.id)},preview=attachmentPreview(image),caption=preview.querySelector('figcaption');if(caption)caption.textContent=imageReferenceName(1)+(state.imageTextOnlyMode?' · 上一版畫面預覽 · v':' · 創作基礎圖 · v')+(previous.imageCreation.version||'?');const img=preview.querySelector('img');if(img)bindImagePreview(img,()=>[{src:image.url,width:image.width,height:image.height,alt:image.name}]);list.replaceChildren(preview);};
  const renderCandidate=draft=>{const section=$('image-create-candidate'),content=$('image-create-candidate-prompt'),prompt=draft?.prompt?.trim()||'';section.hidden=!prompt;content.textContent=prompt;};
  const renderReferences=job=>{
    const currentReferences=state.draftImages;
    const previousId=selectedPrevious?'generated-'+selectedPrevious.id:null,source=[...(job?.attachments||[]),...currentReferences].filter(image=>image?.id!==previousId);
    const references=[...new Map(source.filter(image=>image?.id).sort((a,b)=>(a.source==='latest-series'?-1:0)-(b.source==='latest-series'?-1:0)).map(image=>[image.id,image])).values()];
    const section=$('image-create-references'),list=$('image-create-reference-list'),count=$('image-create-reference-count');
    section.hidden=!references.length;
    count.textContent=references.length?(state.imageTextOnlyMode?'（'+references.length+' 張僅供畫面查看，不傳送）':'（'+references.length+' 張可勾選，預設不加入）'):'';
    section.querySelector('.image-create-section-hint').textContent=state.imageTextOnlyMode?'目前僅使用文字提示詞創作；下列圖片只供你在畫面查看，不能勾選或傳入圖片模型。':'以下圖片會一併提供給圖片模型作為本次創作的參考材料；編號與圖片對話一致。';
    list.replaceChildren(...references.map((image,index)=>{
      const label=node('label',undefined,'image-create-reference'),check=node('input'),material=node('span',undefined,'image-create-material'),meta=node('span',undefined,'image-create-material-meta');
      check.type='checkbox';check.name='image-create-reference';check.value=image.id;check.checked=false;check.disabled=state.imageTextOnlyMode;check.setAttribute('aria-label','加入創作材料：'+image.name);check.title=state.imageTextOnlyMode?'目前圖片 API 尚無解析圖片能力，不能加入創作材料。':'';
      const preview=attachmentPreview(image),img=preview.querySelector('img');
      if(img)bindImagePreview(img,()=>references.map(item=>({src:item.url||'/attachments/'+encodeURIComponent(item.id),width:item.width,height:item.height,alt:item.name})));
      const imageNumber=index+(selectedPrevious?2:1),sourceName=image.source==='latest-series'?'最新圖片創作圖':'附件草稿圖';
      meta.append(node('span',imageReferenceName(imageNumber)+' · '+sourceName,'image-create-material-index'),node('span',image.name||'未命名圖片','image-create-material-name'));
      material.append(preview,meta);label.append(check,material);return label;
    }));
  };
  const composeSections=(request,draftPrompt='')=>{
    if(selectedPrevious)return [
      ['延續規則',state.imageTextOnlyMode?'文字模式：上一版圖片及其他圖片材料不會傳入圖片模型。只能根據上一版提示詞與本次文字要求延續，不得假裝已看過上一版圖片。':'修改優先規則（最高優先）：以目前選定的上一版圖片作為唯一的主題、內容與版面基礎。保留上一版的文字、流程、編號、構圖、物件與資訊層級；本次新增參考圖片只作為指定項目的參考，不得自行替換上一版的主題或整體內容。只有在本次新增要求明確指定時，才修改或移除指定項目；其餘內容維持上一版。'],
      ['上一版完整提示詞',selectedPrevious.imageCreation.prompt||''],['本次新增要求',request]
    ].filter(([,value])=>value?.trim());
    if(selectedDraftId)return [['候選提示詞',draftPrompt],['本次新增要求',request]].filter(([,value])=>value?.trim());
    return [['專案摘要',project?.memory?.summary||''],['系列摘要',series?.memory?.summary||''],['本次新增要求',request]].filter(([,value])=>value?.trim());
  };
  const sectionText=([label,value])=>label+'：\n'+value;
  let composedSections=[];
  const refreshPromptStatus=manual=>{const fullPrompt=$('image-create-full-prompt').value,count=$('image-create-prompt-count');count.hidden=!projectMode;count.textContent='完整提示詞 '+fullPrompt.length+' / 15000 字 · '+(manual?'已手動修改，以下為組裝前各段字數：':'各段字數：')+(composedSections.length?composedSections.map(([label,value])=>label+' '+value.length).join(' · '):'無');count.classList.toggle('over-limit',fullPrompt.length>15000);const diffPanel=$('image-create-prompt-diff-panel');diffPanel.hidden=!selectedPrevious;renderTextDiff('image-create-prompt-diff',selectedPrevious?.imageCreation?.prompt||'',fullPrompt);};
  const renderSource=()=>{const value=draftSelect.value;selectedDraftId=value.startsWith('draft:')?value.slice(6):null;selectedPrevious=value.startsWith('previous:')?versions.find(job=>job.id===value.slice(9))||null:null;const job=selectedDraftId?drafts.find(item=>item.id===selectedDraftId):selectedPrevious,draft=selectedDraftId?job?.imageProjectDraft:null,request=$('image-create-request').value;composedSections=composeSections(request,draft?.prompt||'');$('image-create-full-prompt').value=projectMode?composedSections.map(sectionText).join('\n\n'):prompt;
    const sourceInfo=$('image-create-source-info'),sourceMode=$('image-create-source-mode');$('image-create-source-panel').hidden=!projectMode;const timestamp=job?.finishedAt||job?.startedAt||job?.createdAt,date=timestamp?new Date(timestamp).toLocaleString('zh-TW'):'時間不詳';sourceInfo.textContent=job?(selectedPrevious?'延續圖片 v'+(selectedPrevious.imageCreation.version||'?'):'候選提示詞版本 '+(drafts.indexOf(job)+1))+' · '+date+' · '+(job.question||draft?.agentUnderstanding||'未記錄需求'):'未選取候選或上一版；使用目前專案／系列摘要與本次要求';sourceMode.textContent=selectedPrevious?(state.imageTextOnlyMode?'只沿用上一版文字提示詞；上一版圖片不會傳送。':'上一版圖片會作為生圖編輯基礎；其他圖片材料須另行勾選。'):selectedDraftId?'只沿用所選候選提示詞文字；圖片材料須另行勾選。':'不會自動加入候選提示詞或上一版圖片。';
    $('image-create-version').textContent=String((selectedPrevious?.imageCreation.version||versions.at(-1)?.imageCreation?.version||0)+1);renderPrevious();renderCandidate(draft);renderReferences(selectedDraftId?job:null);refreshPromptStatus(false);};
  $('image-create-request').value=prompt;renderSource();draftSelect.onchange=renderSource;
  $('image-create-request').oninput=renderSource;$('image-create-full-prompt').oninput=()=>refreshPromptStatus(true);
  if(!projectMode)$('image-create-version').textContent=String(version);
  $('image-create-model').textContent=availability.enabled?'圖片模型：'+picker.value:'尚未設定可用的圖片模型或 API key';
  const projectWriteAllowed=Boolean(state.catalog.find(item=>item.id===state.project)?.permissions?.write);
  $('image-create-error').textContent=!availability.enabled?(projectMode?'需在服務啟動設定中提供官方 OpenAI API key，才可開始創作。':'需在服務端 AI 設定中指定 imageGenerationModel，才可開始創作。'):!projectMode&&!projectWriteAllowed?'圖片會保存到目前專案，需要先授予「允許修改」權限。':state.imageTextOnlyMode?'文字模式：生圖 API 只會收到提示詞，不會收到上一版圖片、參考圖或貼入草稿圖。':'';
  $('image-create-confirm').disabled=!availability.enabled||(!projectMode&&!projectWriteAllowed);
  $('image-create-admin-label').hidden=!projectMode;$('image-create-admin').value='';
  return new Promise(resolve=>{
    const close=result=>{dialog.removeEventListener('cancel',cancel);if(dialog.contains(document.activeElement))document.activeElement.blur();dialog.close();$('image-create-admin').value='';resolve(result);};
    const cancel=event=>{event.preventDefault();close(false);};
    dialog.addEventListener('cancel',cancel);
    $('image-create-back').onclick=()=>close(false);
    $('image-create-confirm').onclick=()=>{const adminToken=$('image-create-admin').value.trim(),fullPrompt=projectMode?$('image-create-full-prompt').value:prompt;if(projectMode&&!selectedDraftId&&!selectedPrevious&&!$('image-create-request').value.trim()){$('image-create-error').textContent='不使用候選或上一版時，請先輸入本次創作要求';$('image-create-request').focus();return;}if(!fullPrompt.trim()||fullPrompt.length>15000){$('image-create-error').textContent='圖片提示詞需為 1–15000 字（目前 '+fullPrompt.length+' 字）';if(projectMode)$('image-create-full-prompt').focus();return;}if(projectMode&&!/^[0-9a-f]{6}$/i.test(adminToken)){$('image-create-error').textContent='請輸入本次服務的 6 碼十六進位管理碼';$('image-create-admin').focus();return;}const referenceImageIds=[...document.querySelectorAll('input[name="image-create-reference"]:checked')].map(input=>input.value);close({imageModel:picker.value,adminToken,prompt:fullPrompt,currentRequest:projectMode?$('image-create-request').value:prompt,draftJobId:projectMode?selectedDraftId:null,previousJobId:projectMode?selectedPrevious?.id||null:previous?.id||null,referenceImageIds});};
    dialog.showModal();
    // Keep focus on the visible Select2 control instead of its aria-hidden
    // native select when the dialog chooses an initial focus target.
    focusPickerSelection();
  });
}
async function submitImageCreation(options={}){
  let accepted=false;
  try{return await submitImageCreationCore(options,()=>{accepted=true;});}
  catch(error){if(options.projectMode&&!accepted)await consumeImageDraftAttempt('creation','rejected',error.message);throw error;}
}
async function submitImageCreationCore({projectMode=false,draftJobId=null,sourceChoice=false}={},onAccepted=()=>{}){
  const prompt=$('question').value.trim();
  if(projectMode&&!$('ai-allow-edits').checked)throw new Error('請先勾選「允許內容送往目前設定的 AI」');
  if(!prompt&&!draftJobId&&!projectMode){$('question').focus();throw new Error('請先在對話框整理圖片提示詞');}
  if(prompt.length>15000)throw new Error('圖片提示詞最多 15000 字');
  const previous=projectMode?(state.imagePreviousJobId?state.taskJobs.get(state.imagePreviousJobId):!sourceChoice&&$('image-use-latest').checked?imageSeriesVersions(state.imageSeriesId).at(-1):null):state.imagePreviousJobId?state.taskJobs.get(state.imagePreviousJobId):null;
  if(state.imagePreviousJobId&&!previous)throw new Error('上一版圖片不屬於目前對話');
  const imageProject=projectMode&&state.imageProjects.find(project=>project.id===state.imageProjectId);
  if(projectMode&&!imageProject){const toggle=$('image-project-toggle');$('image-project-panel').hidden=false;toggle.setAttribute('aria-expanded','true');$('image-project-toggle-icon').className='fi fi-br-angle-small-down';throw new Error('請先建立或選擇圖片創作專案');}
  if(projectMode&&!currentImageSeries())throw new Error('請先送出圖片討論以建立系列，或按「新系列」');
  if(projectMode&&previous?.imageCreation?.imageProject?.id!==imageProject.id&&previous)throw new Error('上一版圖片不屬於目前選取的圖片創作專案');
  const selectedDraftJobId=projectMode?draftJobId:null;
  const confirmation=await confirmImageCreation(prompt,(previous?.imageCreation.version||0)+1,{projectMode,draftJobId:selectedDraftJobId,previous});
  if(!confirmation){$('question').focus();return;}
  if(projectMode){
    const requestForReferenceCheck=[confirmation.currentRequest,confirmation.prompt].filter(Boolean).join('\n');
    const mentionsReference=/(?:圖\s*[一二三四五六七八九十\d]+|第\s*[一二三四五六七八九十\d]+\s*張|參考圖|參考圖片|附圖|如圖|圖片風格)/u.test(requestForReferenceCheck);
    const selectedDraft=state.taskJobs.get(confirmation.draftJobId);
    const hasReference=confirmation.referenceImageIds.length>0||!!confirmation.previousJobId;
    if(!state.imageTextOnlyMode&&mentionsReference&&!hasReference)throw new Error('目前沒有收到提到的參考圖片，無法進行圖片觀察或產圖；已保留本輪圖片草稿。');
  }
  const endpoint=projectMode?'/api/image-project-generation':'/api/image-generation';
  collapseComposerForExecution();moveHistoryToBottom();const job=await api(endpoint,{prompt:confirmation.prompt,imageModel:confirmation.imageModel,previousJobId:confirmation.previousJobId,...(projectMode?{currentRequest:confirmation.currentRequest,imageProjectId:imageProject.id,seriesId:state.imageSeriesId,adminToken:confirmation.adminToken,draftJobId:confirmation.draftJobId,referenceImageIds:confirmation.referenceImageIds}:{})});onAccepted();if(projectMode)await consumeImageDraftAttempt('creation','submitted');
  if($('question').value.trim()===prompt)$('question').value='';state.questionBaseline='';state.job=job.id;state.imagePreviousJobId=null;
  showImageJob(job);moveHistoryToBottom();await listConversations(state.project);await poll(job);restoreComposerAfterExecution();if(projectMode)await reloadImageProjects();
}
function showImageJob(job){
  const imageHistory=state.imageWorkspaceActive&&((job.imageProjectChat?.projectId===state.imageProjectId)||(job.imageCreation?.imageProject?.id===state.imageProjectId));
  if(!imageHistory&&(job.projectId!==state.project||job.conversationId!==state.conversation))return;
  $('cancel').disabled=job.status!=='running';
  $('progress').textContent=job.progress;
  state.taskJobs.set(job.id,job);
  let article=state.articles.get(job.id);
  if(!article){article=node('article',undefined,'message image-task');article.id='task-'+job.id;state.articles.set(job.id,article);$('history').append(article);}
  article.hidden=state.imageWorkspaceActive&&(!job.imageCreation?.imageProject||job.imageCreation.imageProject.id!==state.imageProjectId||job.imageCreation.seriesId!==state.imageSeriesId);
  const image=job.imageCreation;
  const heading=node('div',undefined,'task-card-heading');heading.dataset.status=job.status;
  heading.append(node('strong',taskHeadline(job),'task-card-status'),node('span',' · '+taskDuration(job),'task-duration'));
  const headingActions=node('div',undefined,'task-heading-actions'),deleteButton=node('button','Delete','task-question-delete');deleteButton.type='button';deleteButton.id='task-delete-'+job.id;deleteButton.onclick=()=>deleteTaskCard(job);headingActions.append(deleteButton);heading.append(headingActions);
  const question=node('p',undefined,'question task-card-question');question.title=job.question;
  question.append(node('span',job.question,'task-card-question-text'));
  article.replaceChildren(heading,question,node('p',undefined,'image-task-summary'));
  article.querySelector('.image-task-summary').textContent=typeof taskActivityPreview==='function'?taskActivityPreview(job):job.progress||'正在處理';
  const detail=taskDetails(job.id+':main','詳細資訊',job.status==='running'&&!job.archived);
  detail.classList.add('task-main-details');detail.id='task-more-'+job.id;
  detail.firstChild.setAttribute('aria-controls','task-more-content-'+job.id);
  detail.firstChild.setAttribute('aria-expanded',String(detail.open));
  detail.addEventListener('toggle',()=>detail.firstChild.setAttribute('aria-expanded',String(detail.open)));
  const detailContent=node('div',undefined,'task-main-content');detailContent.id='task-more-content-'+job.id;
  detailContent.append(historyLabel(job,'full-question','本次新增要求',[historyText(job.question)]),historyLabel(job,'full-prompt','完整提示詞',[historyText(image.prompt||job.question)]),node('span',image.slug+' · 第 '+image.version+' 版 · '+image.model,'image-task-meta'));
  if(image.response?.answer)article.append(historyLabel(job,'image-response','AI 回應',[historyText(image.response.answer)]));
  if(image.fileName)detailContent.append(node('span',(image.outputFileName||image.fileName)+' · '+image.width+' × '+image.height,'image-task-meta'));
  if(job.result?.unknown?.length)detailContent.append(historyLabel(job,'unknown','未確認事項',job.result.unknown.map(item=>historyText(item))));
  renderTaskTimeline(job,detailContent);
  if(job.status==='completed'&&image.fileName){
    const figure=node('figure',undefined,'image-task-result'),preview=node('img');
    preview.width=Math.max(1,Number(image.width)||1);preview.height=Math.max(1,Number(image.height)||1);
    preview.src='/generated-images/'+encodeURIComponent(job.id);preview.alt=image.slug+' 第 '+image.version+' 版';preview.loading='lazy';
    bindImagePreview(preview,()=>taskPreviewImages(job));
    figure.append(preview);article.append(figure);
    const actions=node('div',undefined,'image-task-actions'),edit=node('button','修改這張圖片');edit.type='button';edit.id='image-edit-'+job.id;
    edit.onclick=()=>{state.imagePreviousJobId=job.id;if(image.imageProject){state.imageProjectId=image.imageProject.id;state.imageSeriesId=image.seriesId;setImageWorkspaceActive(true);setImageCreationMode(true);renderImageProjects();}$('composer-panel').open=true;$('question').value='請以第 '+image.version+' 版圖片為基礎，修改：\n';$('question').focus();};
    const download=node('a','下載 PNG');download.href=preview.src;download.download=image.fileName;
    actions.append(edit,download);article.append(actions);
  }else article.append(node('span',job.status==='running'?'正在創作圖片…':job.result?.unknown?.join('；')||job.progress,'image-task-status'));
  detail.append(detailContent);article.append(detail);sortHistoryTasks();
}

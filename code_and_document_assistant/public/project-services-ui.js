const serviceUi={job:null,services:[],prompted:new Set(),stopRefreshJobs:new Set(),installPlan:null,installDev:false,verifyId:null,moduleDirectory:'',moduleDirectoryLocked:false};
function setupProjectServicePicker(picker){
  if(!window.jQuery?.fn?.select2)return;
  const $picker=window.jQuery(picker);
  picker.parentElement.classList.add('project-service-picker-field');
  if(!$picker.hasClass('select2-hidden-accessible')){
    $picker.select2({width:'100%',dropdownParent:window.jQuery(picker.parentElement),dropdownCssClass:'project-services-select-dropdown',minimumResultsForSearch:Infinity});
  }else $picker.trigger('change.select2');
  const $container=$picker.next('.select2-container');
  const label=({'project-service-entry':'選擇啟動入口','project-service-api-method':'選擇 API 方法','project-service-stop-select':'選擇要停止的服務與 Port'})[picker.id]||'選擇服務與 Port';
  $container.attr('aria-label',label);
  $container.find('.select2-selection,.select2-selection__rendered,[role="textbox"]').attr('aria-label',label);
}
function serviceVerificationInput(prefix){
  const path=$(`${prefix}-path`).value.trim();
  if(!path)throw new Error('請填寫 API 路徑');
  let headers={};try{headers=JSON.parse($(`${prefix}-headers`).value.trim()||'{}');}catch{throw new Error('標頭必須是合法 JSON 物件');}
  const jsonPath=$(`${prefix}-json-path`).value.trim(),jsonExpected=$(`${prefix}-json-expected`).value.trim();
  if(jsonPath&&!jsonExpected)throw new Error('請填寫 JSON 預期值');
  return {method:$(`${prefix}-method`).value,path,headers,body:$(`${prefix}-body`).value,expectedStatus:Number($(`${prefix}-status`).value),contains:$(`${prefix}-contains`).value,jsonPath,jsonExpected};
}
function clearServiceVerificationSecrets(prefix){
  for(const name of ['headers','body','contains','json-expected'])$(`${prefix}-${name}`).value='';
}
function renderServiceVerificationResult(result){
  if(!result)return '尚未驗證 API；目前只確認程序與 Port。';
  const status=result.actualStatus?`HTTP ${result.actualStatus}`:result.error||'未收到回應';
  return `${result.passed?'通過':'失敗'} · ${result.method} ${result.path} · ${status}（預期 ${result.expectedStatus}）${result.hasTextCondition?` · 文字${result.textMatched?'符合':'不符合'}`:''}${result.hasJsonCondition?` · JSON ${result.jsonPath}${result.jsonMatched?'符合':'不符合'}`:''}`;
}
function renderInitialServiceMonitor(monitor){
  if(!monitor)return '尚無初始監測紀錄';
  const checks=monitor.checks||[],errors=monitor.errors||[],latestError=errors.at(-1),count=checks.length;
  const status=monitor.status==='monitoring'?`監測中 ${count} 次（最多 5 分鐘）`:monitor.status==='completed'?`監測完成，共 ${count} 次檢查`:monitor.status==='completed_with_errors'?`監測完成，共 ${count} 次檢查，發現 ${errors.length} 次錯誤`:monitor.status==='ended_early'?`監測提前中止，共 ${count} 次檢查`:monitor.status==='interrupted'?`助手重啟，監測中斷（${count} 次檢查）`:monitor.status==='failed'?'啟動檢查失敗':monitor.status==='stopped'?`服務停止，監測提前結束（${count} 次檢查）`:monitor.status;
  return `初始監測：${status}${latestError?'；最近錯誤 '+new Date(latestError.checkedAt).toLocaleString()+' '+latestError.message:''}`;
}
function routeField(parent,labelText,value,type='text',name=''){const label=node('label',labelText);let control;if(type==='textarea'){control=node('textarea');control.rows=3;control.value=value||'';}else{control=node('input');control.type=type;control.value=value??'';}control.dataset.routeField=name;label.append(control);parent.append(label);return control;}
function buildChangeRouteCard(route,index){
  const card=node('article',undefined,'service-route-case');card.dataset.routeIndex=String(index);
  const heading=node('label'),check=node('input');check.type='checkbox';check.checked=['GET','HEAD'].includes(route.method);check.dataset.routeField='selected';heading.append(check,node('strong',`${route.method} ${route.path}`));card.append(heading,node('small',`來源：${route.source}${check.checked?'':' · 可能修改資料，預設不勾選'}`));
  if(route.params?.length){const params=node('div',undefined,'service-route-params');for(const key of route.params)routeField(params,`路徑參數 ${key}`,'','text','param:'+key);card.append(params);}
  if(!['GET','HEAD'].includes(route.method)){
    routeField(card,'標頭（JSON 物件，選填）',route.bodySchema?'{"Content-Type":"application/json"}':'{}','textarea','headers');
    routeField(card,'Body（依程式讀取欄位預填，可自行調整）',route.bodySchema?JSON.stringify(route.bodySchema,null,2):'','textarea','body');
  }
  routeField(card,'預期狀態碼','200','number','status');
  routeField(card,'回應文字須包含（選填）','','text','contains');
  routeField(card,'JSON 欄位路徑（選填）','','text','jsonPath');
  routeField(card,'JSON 預期值（合法 JSON）','','text','jsonExpected');
  return card;
}
function openChangeRouteVerification(plan){
  serviceUi.changePlan=plan;const container=$('project-service-change-verify-routes');container.replaceChildren(...plan.routes.map(buildChangeRouteCard));
  $('project-service-change-verify-source').textContent=`修改任務：${plan.changedQuestion||plan.changedTaskId} · 服務入口：${plan.serviceEntry} · 狀態：${plan.serviceStatus}`;
  $('project-service-change-verify-status').textContent=[...plan.warnings,...(plan.serviceStatus==='running'?[]:['服務目前未執行；請先啟動服務，再重新掃描路由。'])].join('；');
  $('project-service-change-verify-confirm').disabled=plan.serviceStatus!=='running'||!plan.serviceId;
  $('project-service-change-verify-admin').value=$('admin').value.trim();
  if(!$('project-service-change-verify-dialog').open)$('project-service-change-verify-dialog').showModal();
}
async function scanLatestChangedApis(){
  const button=$('project-services-scan-changes');button.disabled=true;
  try{
    const plan=await api('/api/project-services/scan-changes',{serviceId:$('project-services-select').value||null});
    if(!plan.routes?.length){$('project-services-floating-status').textContent=(plan.warnings||[]).join('；')||'最近已套用的修改沒有找到可追蹤的 Express 字串路由。';return;}
    openChangeRouteVerification(plan);
  }catch(error){$('project-services-floating-status').textContent=error.message;}finally{button.disabled=false;}
}
function renderProjectServiceJob(job){
  const panel=taskDetails(job.id+':service-record',job.serviceRun?'服務啟動與驗證紀錄':'服務啟動計畫',false);
  panel.classList.add('task-service-record');panel.id='task-service-record-'+job.id;
  if(job.servicePlan){
    panel.append(node('span','候選入口與預期 Port：','task-service-record-line'));
    const list=node('ul');
    for(const item of job.servicePlan.candidates||[])list.append(node('li',`${item.command} · ${item.port||'Port 待輸入'}`));
    panel.append(list);
  }
  if(job.serviceInstall)panel.append(node('span',`外部依賴安裝：${job.serviceInstall.packages.map(item=>item.name).join('、')||'無'} · ${job.serviceInstall.directory}`,'task-service-record-line'));
  if(job.serviceRun){const run=job.serviceRun;panel.append(node('span',`${run.status} · ${run.entry} · 127.0.0.1:${run.port} · PID ${run.pid||'未取得'}`,'task-service-record-line'));panel.append(node('span',renderInitialServiceMonitor(run.initialMonitor),'task-service-record-line'));panel.append(node('span',renderServiceVerificationResult(run.apiVerification),'task-service-record-line'));if(run.output)panel.append(node('pre',run.output.slice(-4000)));if(run.status==='running'){const verify=node('button','驗證 API');verify.type='button';verify.onclick=()=>openProjectServiceVerify(run);panel.append(verify);}}
  if(job.servicePlan&&!job.archived&&job.status==='awaiting_approval'){const button=node('button','開啟啟動確認');button.type='button';button.onclick=()=>openProjectServiceStart(job);panel.append(button);}
  return panel;
}
function promptProjectServiceStart(job){
  if(serviceUi.prompted.has(job.id))return;
  serviceUi.prompted.add(job.id);
  queueMicrotask(()=>{if(state.project===job.projectId&&state.conversation===job.conversationId)openProjectServiceStart(job);});
}
function setProjectServiceFormEditable(editable){
  $('project-services-startup-config').hidden=false;
  for(const control of $('project-services-startup-config').querySelectorAll('input,select,textarea,button'))control.disabled=!editable;
  $('project-service-start-close').hidden=!editable;
  $('project-service-start-title').textContent=editable?'確認啟動專案服務':'啟動服務設定';
  if(editable){
    $('project-service-api-headers').placeholder='{"Content-Type":"application/json"}';
    for(const name of ['body','contains','json-expected'])$(`project-service-api-${name}`).placeholder='';
  }
}
function renderSelectedServiceSettings(){
  if(serviceUi.job)return;
  const service=serviceUi.services.find(item=>item.id===$('project-services-select').value),setup=service?.verificationSetup||{};
  setProjectServiceFormEditable(false);
  const entry=$('project-service-entry');entry.replaceChildren();
  const option=document.createElement('option');option.value=service?.entry||'';option.textContent=service?`node ${service.entry}`:'尚無服務啟動計畫';entry.append(option);
  $('project-service-port').value=service?.port||'';
  $('project-service-modules').value=service?.directory||serviceUi.moduleDirectory;
  $('project-service-admin').value='';
  for(const [name,value] of Object.entries({method:setup.method||'GET',path:setup.path||'',status:setup.expectedStatus||200,'json-path':setup.jsonPath||''}))$(`project-service-api-${name}`).value=value;
  clearServiceVerificationSecrets('project-service-api');
  $('project-service-api-headers').placeholder='敏感內容未保存';
  $('project-service-api-body').placeholder='敏感內容未保存';
  $('project-service-api-contains').placeholder=setup.hasTextCondition?'有設定，條件文字未保存':'';
  $('project-service-api-json-expected').placeholder=setup.jsonPath?'有設定，預期值未保存':'';
  $('project-service-command').textContent=service?`執行：node ${service.entry} · 驗證：127.0.0.1:${service.port}`:'';
  $('project-service-start-status').textContent=service?'目前顯示所選服務的啟動設定。若要再次啟動，請按「啟動設定」提出新的啟動計畫。':'按「啟動設定」提出啟動計畫後，即可選擇入口、填寫設定並確認啟動。';
  setupProjectServicePicker(entry);
  setupProjectServicePicker($('project-service-api-method'));
}
async function openProjectServiceStart(job){
  serviceUi.job=job;
  setProjectServicesPanelOpen(true);setProjectServiceFormEditable(true);
  const select=$('project-service-entry');select.replaceChildren(...(job.servicePlan?.candidates||[]).map(item=>{const option=document.createElement('option');option.value=item.entry;option.textContent=`${item.command} · ${item.port||'Port 待輸入'}`;return option;}));
  const modules=$('project-service-modules');modules.value=serviceUi.moduleDirectory;modules.readOnly=serviceUi.moduleDirectoryLocked;modules.title=modules.readOnly?'有服務正在執行；停止所有服務後才能更改此路徑':'';
  $('project-service-admin').value=$('admin').value.trim();$('project-service-start-status').textContent='';
  try{await refreshProjectServices();modules.value=serviceUi.moduleDirectory;modules.readOnly=serviceUi.moduleDirectoryLocked;modules.title=modules.readOnly?'有服務正在執行；停止所有服務後才能更改此路徑':'';}catch(error){$('project-service-start-status').textContent='讀取專案外部依賴設定失敗：'+error.message;}
  $('project-service-api-settings').open=false;$('project-service-api-method').value='GET';$('project-service-api-path').value='';$('project-service-api-status').value='200';$('project-service-api-json-path').value='';clearServiceVerificationSecrets('project-service-api');
  syncProjectServiceEntry();
  setupProjectServicePicker(select);
  setupProjectServicePicker($('project-service-api-method'));
}
function closeProjectServiceStart(){
  serviceUi.job=null;renderSelectedServiceSettings();
}
function syncProjectServiceEntry(){
  const item=serviceUi.job?.servicePlan?.candidates.find(candidate=>candidate.entry===$('project-service-entry').value);
  $('project-service-port').value=item?.port||'';
  $('project-service-command').textContent=item?`執行：${item.command} · 工作目錄：目前專案 · 驗證：127.0.0.1:${item.port||'待填'}`:'';
}
$('project-service-entry').onchange=syncProjectServiceEntry;
$('project-service-port').oninput=()=>{
  const item=serviceUi.job?.servicePlan?.candidates.find(candidate=>candidate.entry===$('project-service-entry').value);
  $('project-service-command').textContent=item?`執行：${item.command} · 工作目錄：目前專案 · 驗證：127.0.0.1:${$('project-service-port').value||'待填'}`:'';
};
$('project-service-start-close').onclick=closeProjectServiceStart;
async function saveProjectServiceModuleDirectory(){
  clearTimeout(moduleDirectorySaveTimer);
  const input=$('project-service-modules'),moduleDirectory=input.value.trim();
  const result=await api('/api/project-services/settings',{moduleDirectory});
  serviceUi.moduleDirectory=result.moduleDirectory||'';serviceUi.moduleDirectoryLocked=result.moduleDirectoryLocked===true;input.value=serviceUi.moduleDirectory;input.readOnly=serviceUi.moduleDirectoryLocked;input.title=input.readOnly?'有服務正在執行；停止所有服務後才能更改此路徑':'';
  return serviceUi.moduleDirectory;
}
let moduleDirectorySaveTimer;
$('project-service-modules').addEventListener('change',()=>{clearTimeout(moduleDirectorySaveTimer);moduleDirectorySaveTimer=setTimeout(()=>saveProjectServiceModuleDirectory().then(()=>{$('project-service-start-status').textContent='外部 node_modules 路徑已保存於目前專案。'}).catch(error=>{$('project-service-start-status').textContent='保存外部依賴路徑失敗：'+error.message;}),250);});
function projectServiceInput(){
  if(!serviceUi.job)throw new Error('尚未選取服務啟動任務');
  const entry=$('project-service-entry').value,port=Number($('project-service-port').value),moduleDirectory=$('project-service-modules').value.trim();
  if(!entry||!Number.isInteger(port)||port<1||port>65535)throw new Error('請選擇入口並填入有效 Port');
  if(!moduleDirectory)throw new Error('請填寫專案外 node_modules 絕對路徑');
  return {entry,port,moduleDirectory,adminToken:$('project-service-admin').value.trim()};
}
async function projectServiceDependencies(includeDev=false){
  const input=projectServiceInput();
  await saveProjectServiceModuleDirectory();
  return api('/api/jobs/'+encodeURIComponent(serviceUi.job.id)+'/service-dependencies?moduleDirectory='+encodeURIComponent(input.moduleDirectory)+(includeDev?'&includeDev=1':''));
}
function showProjectServiceInstall(plan,includeDev=false){
  serviceUi.installPlan=plan;serviceUi.installDev=includeDev;
  $('project-service-install-details').textContent=`預計安裝 ${plan.category}：${plan.missing.map(item=>item.name+'@'+item.version).join('、')}。位置：${plan.directory}。專案內不建立 node_modules；npm 的安裝檔案只寫到這個外部目錄。`;
  $('project-service-install-status').textContent='';
  if(!$('project-service-install-dialog').open)$('project-service-install-dialog').showModal();
}
$('project-service-dependencies').onclick=async()=>{
  try{const plan=await projectServiceDependencies();$('project-service-start-status').textContent=plan.missing.length?`缺少 ${plan.missing.length} 個依賴；需要另行確認安裝。`:'外部依賴已備妥。';if(plan.missing.length)showProjectServiceInstall(plan);}catch(error){$('project-service-start-status').textContent=error.message;}
};
$('project-service-dev-dependencies').onclick=async()=>{
  try{const plan=await projectServiceDependencies(true);$('project-service-start-status').textContent=plan.missing.length?`缺少 ${plan.missing.length} 個開發依賴；若此入口需要它們，可另行確認安裝。`:'外部開發依賴已備妥。';if(plan.missing.length)showProjectServiceInstall(plan,true);}catch(error){$('project-service-start-status').textContent=error.message;}
};
$('project-service-install-cancel').onclick=()=>$('project-service-install-dialog').close();
$('project-service-install-confirm').onclick=async()=>{
  const button=$('project-service-install-confirm');button.disabled=true;
  try{
    const input=projectServiceInput();
    await api('/api/jobs/'+encodeURIComponent(serviceUi.job.id)+'/service-install',{moduleDirectory:input.moduleDirectory,includeDev:serviceUi.installDev,adminToken:input.adminToken});
    $('project-service-install-dialog').close();$('project-service-start-status').textContent='外部依賴安裝完成。請再次核對命令與 Port，然後按「確認啟動」。';
    show(await api('/api/jobs/'+encodeURIComponent(serviceUi.job.id)));
  }catch(error){$('project-service-install-status').textContent=error.message;}finally{button.disabled=false;}
};
$('project-service-start-confirm').onclick=async()=>{
  const button=$('project-service-start-confirm');button.disabled=true;
  try{
    const input=projectServiceInput(),plan=await projectServiceDependencies();
    if($('project-service-api-path').value.trim())input.verification=serviceVerificationInput('project-service-api');
    if(plan.missing.length){showProjectServiceInstall(plan);$('project-service-start-status').textContent='需先另行確認外部依賴安裝。';return;}
    $('project-service-start-status').textContent='正在啟動並檢查 127.0.0.1:'+input.port+'…';
    const job=await api('/api/jobs/'+encodeURIComponent(serviceUi.job.id)+'/service-start',input);
    clearServiceVerificationSecrets('project-service-api');show(job);await refreshProjectServices();
    $('project-service-start-status').textContent=job.serviceRun?.status==='running'?renderServiceVerificationResult(job.serviceRun.apiVerification):'服務啟動失敗；請查看任務卡輸出。';
    if(job.serviceRun?.status==='running')closeProjectServiceStart();
  }catch(error){$('project-service-start-status').textContent=error.message;}finally{button.disabled=!serviceUi.job;}
};
function openProjectServiceVerify(service){
  serviceUi.verifyId=service.id;
  const setup=service.verificationSetup||{};
  $('project-service-verify-service').textContent=`${service.entry} · 127.0.0.1:${service.port} · ${service.status}${setup.hadQuery?'；上次查詢參數未保存，請重新輸入':''}`;
  for(const [name,value] of Object.entries({method:setup.method||'GET',path:setup.path||'',status:setup.expectedStatus||200,'json-path':setup.jsonPath||''}))$(`project-service-verify-${name}`).value=value;
  clearServiceVerificationSecrets('project-service-verify');
  $('project-service-verify-admin').value=$('admin').value.trim();$('project-service-verify-status-message').textContent='';
  if(!$('project-service-verify-dialog').open)$('project-service-verify-dialog').showModal();
}
$('project-service-verify-close').onclick=()=>$('project-service-verify-dialog').close();
$('project-service-verify-confirm').onclick=async()=>{
  const button=$('project-service-verify-confirm');button.disabled=true;
  try{
    const verification=serviceVerificationInput('project-service-verify');
    $('project-service-verify-status-message').textContent='正在請求並比對 API 回應…';
    const result=await api('/api/project-services/'+encodeURIComponent(serviceUi.verifyId)+'/verify',{verification,adminToken:$('project-service-verify-admin').value.trim()});
    clearServiceVerificationSecrets('project-service-verify');
    $('project-service-verify-status-message').textContent=renderServiceVerificationResult(result.service.apiVerification);
    if(result.job)show(result.job);await refreshProjectServices();
  }catch(error){$('project-service-verify-status-message').textContent=error.message;}finally{button.disabled=false;}
};
async function refreshProjectServices(){
  if(state.imageWorkspaceActive){$('project-services-stop').hidden=true;$('project-services-settings').hidden=true;setProjectServicesPanelOpen(false);return;}
  if(!state.catalog.find(project=>project.id===state.project)?.active){$('project-services-stop').hidden=true;$('project-services-settings').hidden=true;serviceUi.services=[];updateProjectServicesIcon();setProjectServicesPanelOpen(false);return;}
  if(serviceUi.job&&(serviceUi.job.projectId!==state.project||serviceUi.job.conversationId!==state.conversation))serviceUi.job=null;
  $('project-services-settings').hidden=false;
  try{
    const result=await api('/api/project-services');
    serviceUi.services=result.services||[];
    updateProjectServicesIcon();
    serviceUi.moduleDirectory=result.moduleDirectory||'';serviceUi.moduleDirectoryLocked=result.moduleDirectoryLocked===true;
    const serviceSelect=$('project-services-select'),previous=serviceSelect.value;
    serviceSelect.replaceChildren(...serviceUi.services.map(item=>{const option=document.createElement('option');option.value=item.id;option.textContent=`${item.entry} · 127.0.0.1:${item.port} · ${item.status}`;return option;}));
    if(serviceUi.services.some(item=>item.id===previous))serviceSelect.value=previous;
    setupProjectServicePicker(serviceSelect);
    const selected=serviceUi.services.find(item=>item.id===serviceSelect.value)||serviceUi.services.toSorted((a,b)=>String(b.startedAt).localeCompare(String(a.startedAt)))[0];
    renderSelectedServiceSettings();
    $('project-services-floating-status').textContent=selected?`${selected.status} · ${selected.entry} · 127.0.0.1:${selected.port}${selected.apiVerification?' · API '+(selected.apiVerification.passed?'驗證通過':'驗證失敗'):' · 尚無 API 驗證結果'} · ${renderInitialServiceMonitor(selected.initialMonitor)}`:'目前沒有服務程序；可以先從對話提出服務啟動計畫。';
    $('project-services-stop').hidden=!serviceUi.services.some(item=>item.status==='running'||item.status==='starting');
    if($('project-service-stop-dialog').open)renderProjectServiceStop();
  }catch{$('project-services-stop').hidden=true;serviceUi.services=[];updateProjectServicesIcon();}
}
$('project-services-select').addEventListener('change',()=>{
  renderSelectedServiceSettings();
  const selected=serviceUi.services.find(item=>item.id===$('project-services-select').value);
  $('project-services-floating-status').textContent=selected?`${selected.status} · ${selected.entry} · 127.0.0.1:${selected.port} · ${renderInitialServiceMonitor(selected.initialMonitor)}`:'目前沒有服務程序。';
});
$('project-services-settings').onclick=async()=>{
  const panel=$('project-services-floating'),open=!panel.open;setProjectServicesPanelOpen(open);
  if(open){
    await refreshProjectServices();
    const pending=[...state.taskJobs.values()].find(job=>job.projectId===state.project&&job.conversationId===state.conversation&&job.servicePlan&&!job.archived&&job.status==='awaiting_approval');
    if(pending&&!serviceUi.job)await openProjectServiceStart(pending);
  }
};
function setProjectServicesPanelOpen(open){
  const panel=$('project-services-floating');
  if(open)renderSelectedServiceSettings();
  if(open&&!panel.open)panel.showModal();
  else if(!open&&panel.open)panel.close();
  const button=$('project-services-settings');button.setAttribute('aria-expanded',String(open));
}
function updateProjectServicesIcon(){
  const running=serviceUi.services.some(item=>item.status==='running');
  $('project-services-settings').querySelector('i').className='fi fi-rr-toggle-'+(running?'on':'off');
}
function refreshServicesAfterTask(job){
  if(!job?.tools?.some(item=>item.name==='stop_project_service'&&item.status==='ok')||serviceUi.stopRefreshJobs.has(job.id))return;
  serviceUi.stopRefreshJobs.add(job.id);
  refreshProjectServices().catch(()=>{});
}
$('project-services-settings-close').onclick=()=>setProjectServicesPanelOpen(false);
$('project-services-floating').addEventListener('close',()=>{
  $('project-services-settings').setAttribute('aria-expanded','false');
});
$('project-services-floating').addEventListener('cancel',()=>{
  $('project-services-settings').setAttribute('aria-expanded','false');
});
$('project-services-open-start').onclick=()=>{
  const pending=[...state.taskJobs.values()].find(job=>job.projectId===state.project&&job.conversationId===state.conversation&&job.servicePlan&&!job.archived&&job.status==='awaiting_approval');
  if(pending)openProjectServiceStart(pending);else{setProjectServicesPanelOpen(false);$('question').value='請提出目前專案的 Node 服務啟動計畫';$('composer-panel').open=true;$('question').focus();}
};
$('project-services-scan-changes').onclick=scanLatestChangedApis;
$('project-service-change-verify-close').onclick=()=>$('project-service-change-verify-dialog').close();
$('project-service-change-verify-confirm').onclick=async()=>{
  const button=$('project-service-change-verify-confirm');button.disabled=true;
  try{
    const requests=[];
    for(const card of $('project-service-change-verify-routes').querySelectorAll('.service-route-case')){
      if(!card.querySelector('[data-route-field="selected"]').checked)continue;
      const route=serviceUi.changePlan.routes[Number(card.dataset.routeIndex)],get=name=>card.querySelector(`[data-route-field="${name}"]`)?.value||'';
      let path=route.path;for(const key of route.params||[]){const value=get('param:'+key).trim();if(!value)throw new Error(`${route.method} ${route.path} 請填入路徑參數 ${key}`);path=path.replace(':'+key,encodeURIComponent(value));}
      let headers={};try{headers=JSON.parse(get('headers')||'{}');}catch{throw new Error(`${route.method} ${path} 的標頭必須是合法 JSON 物件`);}
      const jsonPath=get('jsonPath').trim(),jsonExpected=get('jsonExpected').trim();if(jsonPath&&!jsonExpected)throw new Error(`${route.method} ${path} 請填 JSON 預期值`);
      requests.push({method:route.method,path,headers,body:get('body'),expectedStatus:Number(get('status')||200),contains:get('contains'),jsonPath,jsonExpected});
    }
    if(!requests.length)throw new Error('請至少勾選一個 API 路由');
    $('project-service-change-verify-status').textContent=`正在依序驗證 ${requests.length} 個 API…`;
    const result=await api('/api/project-services/'+encodeURIComponent(serviceUi.changePlan.serviceId)+'/verify-batch',{verifications:requests,adminToken:$('project-service-change-verify-admin').value.trim()});
    $('project-service-change-verify-status').textContent=result.results.map(item=>item.passed?renderServiceVerificationResult(item.verification):`失敗 · ${item.method||''} ${item.path||''} · ${item.error||renderServiceVerificationResult(item.verification)}`).join('；');
    for(const field of $('project-service-change-verify-routes').querySelectorAll('[data-route-field="headers"],[data-route-field="body"],[data-route-field="contains"],[data-route-field="jsonExpected"]'))field.value='';
    if(result.job)show(result.job);await refreshProjectServices();
  }catch(error){$('project-service-change-verify-status').textContent=error.message;}finally{button.disabled=false;}
};
function renderProjectServiceStop(){
  const running=serviceUi.services.filter(item=>item.status==='running'||item.status==='starting'),select=$('project-service-stop-select'),previous=select.value;
  select.replaceChildren(...running.map(item=>{const option=document.createElement('option');option.value=item.id;option.textContent=`${item.entry} · 127.0.0.1:${item.port} · ${item.status} · PID ${item.pid||'?'}`;return option;}));
  if(running.some(item=>item.id===previous))select.value=previous;
  setupProjectServicePicker(select);
  const selected=running.find(item=>item.id===select.value);
  $('project-service-stop-output').textContent=selected?.output?.slice(-4000)||'尚無服務輸出';
  $('project-service-stop-message').textContent=selected?`目前狀態：${selected.status}。確認後將關閉 ${selected.entry}（Port ${selected.port}）；已修改的專案檔案不受影響。`:'目前沒有執行中的服務。';
}
$('project-service-stop-select').onchange=renderProjectServiceStop;
$('project-services-stop').onclick=async()=>{
  await refreshProjectServices();renderProjectServiceStop();
  if(!$('project-service-stop-dialog').open)$('project-service-stop-dialog').showModal();
};
$('project-service-stop-cancel').onclick=()=>$('project-service-stop-dialog').close();
$('project-service-stop-confirm').onclick=async()=>{
  const id=$('project-service-stop-select').value,button=$('project-service-stop-confirm');
  if(!id)return;button.disabled=true;
  try{
    const result=await api('/api/project-services/'+encodeURIComponent(id)+'/stop',{});
    $('project-service-stop-dialog').close();await refreshProjectServices();
    if(result.service?.jobId)show(await api('/api/jobs/'+encodeURIComponent(result.service.jobId)));
  }catch(error){$('project-service-stop-message').textContent='停止失敗：'+error.message;}finally{button.disabled=false;}
};

function initTextModelUI(){
  state.textModels={catalog:null,preferences:null,saving:false,loading:false,sequence:0,draft:null,error:null};
  const button=$('text-model-picker'),menu=$('text-model-menu');
  if(menu.matches(':popover-open'))menu.hidePopover();
  button.setAttribute('aria-expanded','false');
  window.addEventListener('pageshow',event=>{if(event.persisted&&menu.matches(':popover-open'))menu.hidePopover();});
  button.onclick=async event=>{
    if(menu.matches(':popover-open')){menu.hidePopover();return;}
    state.textModels.loading=true;state.textModels.error=null;renderTextModelPicker();menu.showPopover();positionTextModelMenu();
    try{await loadTextModels();await refreshTextModelSelection();}catch(error){state.textModels.error=error.message;}
    finally{state.textModels.loading=false;renderTextModelPicker();if(event.detail===0&&menu.matches(':popover-open'))(menu.querySelector('#text-model-options button:not(:disabled)')||menu.querySelector('button:not(:disabled)'))?.focus();}
  };
  menu.addEventListener('toggle',()=>{button.setAttribute('aria-expanded',String(menu.matches(':popover-open')));if(menu.matches(':popover-open'))positionTextModelMenu();});
  document.addEventListener('pointerdown',event=>{
    if(menu.matches(':popover-open')&&!menu.contains(event.target)&&!button.contains(event.target))menu.hidePopover();
  },true);
  menu.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();menu.hidePopover();button.focus();return;}
    if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
    const options=[...menu.querySelectorAll('button:not(:disabled)')],index=options.indexOf(document.activeElement);if(!options.length)return;
    event.preventDefault();options[event.key==='Home'?0:event.key==='End'?options.length-1:(index+(event.key==='ArrowUp'?-1:1)+options.length)%options.length].focus();
  });
  window.addEventListener('resize',positionTextModelMenu);
  $('text-model-manage').onclick=openTextModelManager;
  $('text-model-manage-close').onclick=$('text-model-manage-cancel').onclick=()=>$('text-model-manage-dialog').close();
  $('text-model-add').onclick=()=>{const draft=state.textModels.draft,profile={id:crypto.randomUUID(),modelId:'',displayName:'',enabled:true,sendReasoning:true,defaultEffort:draft.sharedDefaultEffort,depths:structuredClone(draft.sharedDepths)};draft.models.push(profile);renderTextModelEditor();$('text-model-profile-fields-'+profile.id).querySelector('input[data-field="modelId"]').focus();};
  $('text-model-manage-save').onclick=saveTextModelManager;
}
function positionTextModelMenu(){
  const menu=$('text-model-menu');if(!menu.matches(':popover-open'))return;
  const rect=$('text-model-picker').getBoundingClientRect(),width=menu.getBoundingClientRect().width;
  menu.style.left=Math.max(12,Math.min(rect.right-width,innerWidth-width-12))+'px';
  menu.style.bottom=Math.max(12,innerHeight-rect.top+6)+'px';menu.style.maxHeight=Math.max(100,rect.top-18)+'px';
}
async function loadTextModels(){state.textModels.catalog=await api('/api/text-models');renderTextModelPicker();}
function clearTextModelSelection(){state.textModels.sequence++;state.textModels.preferences=null;state.textModels.saving=false;state.textModels.error=null;if($('text-model-menu').matches(':popover-open'))$('text-model-menu').hidePopover();renderTextModelPicker();}
function applyTextModelSelection(preferences){state.textModels.preferences=preferences||null;renderTextModelPicker();}
async function refreshTextModelSelection(){
  if(!state.conversation)return;
  const epoch=state.epoch,conversation=state.conversation,preferences=await api('/api/text-model-selection');
  if(epoch===state.epoch&&conversation===state.conversation)applyTextModelSelection(preferences);
}
async function chooseTextModel(profile,effort){
  const config=state.textModels;if(config.saving)return;
  const sequence=++config.sequence,epoch=state.epoch,conversation=state.conversation;config.saving=true;config.error=null;renderTextModelPicker();
  try{const preferences=await api('/api/text-model-selection',{profileId:profile.id,effort});if(sequence===config.sequence&&epoch===state.epoch&&conversation===state.conversation){config.preferences=preferences;if($('text-model-menu').matches(':popover-open'))$('text-model-menu').hidePopover();}}
  catch(error){if(sequence===config.sequence)config.error=error.message;}
  finally{if(sequence===config.sequence){config.saving=false;renderTextModelPicker();}}
}
function refreshTextModelAvailability(){
  const config=state.textModels;if(!config)return;
  const independentImage=state.imageWorkspaceActive&&state.imageCreationMode;
  const blocked=config.catalog?.available&&!independentImage&&(!config.preferences?.valid||config.saving);
  const send=$('send');if(blocked){send.dataset.modelBlocked='true';send.disabled=true;}else if(send.dataset.modelBlocked){delete send.dataset.modelBlocked;send.disabled=state.composerSubmitting===true;}
}
function assertTextModelAvailable(){const config=state.textModels;if(config.catalog?.available&&(!config.preferences?.valid||config.saving))throw new Error(config.preferences?.reason||'請先完成模型與思考深度選擇');}
function renderTextModelPicker(){
  const config=state.textModels;if(!config)return;
  const catalog=config.catalog,preferences=config.preferences,selected=preferences?.selection,button=$('text-model-picker');
  button.disabled=!catalog?.available||!state.conversation;
  $('text-model-name').textContent=selected?selected.displayName+(preferences.valid?'':'（不可用）'):catalog?.available?'選取模型':'模型未設定';
  $('text-model-effort').textContent=selected&&preferences.valid&&selected.sendReasoning?selected.effortLabel:'';
  button.classList.toggle('is-unavailable',!!selected&&!preferences.valid);
  $('text-model-status').textContent=config.error||(config.loading?'正在讀取模型設定…':config.saving?'正在儲存選擇…':preferences?.valid?(selected?.sendReasoning?'': '此模型不傳送思考深度參數'):preferences?.reason||'');
  $('text-model-manage').disabled=config.loading||config.saving;
  const options=$('text-model-options');options.replaceChildren();
  for(const profile of catalog?.models||[]){
    if(!profile.enabled)continue;
    const option=node('button',undefined,'text-model-option');option.type='button';option.role='menuitemradio';option.dataset.profileId=profile.id;option.setAttribute('aria-checked',String(selected?.profileId===profile.id));option.disabled=config.saving||config.loading;
    option.append(node('span',profile.displayName));if(selected?.profileId===profile.id){const mark=node('i',undefined,'fa-solid fa-check');mark.setAttribute('aria-hidden','true');option.append(mark);}
    option.onclick=()=>{const effort=profile.depths.some(depth=>depth.enabled&&depth.value===selected?.effort)?selected.effort:profile.defaultEffort;chooseTextModel(profile,effort);};options.append(option);
  }
  const depths=$('text-model-depths');depths.replaceChildren();
  const profile=catalog?.models.find(item=>item.id===selected?.profileId&&item.enabled);
  for(const depth of profile?.depths||[]){if(!depth.enabled)continue;const option=node('button',depth.label);option.type='button';option.role='menuitemradio';option.dataset.effort=depth.value;option.setAttribute('aria-checked',String(selected.effort===depth.value));option.disabled=config.saving||config.loading||!profile.sendReasoning;option.onclick=()=>chooseTextModel(profile,depth.value);depths.append(option);}
  if(selected&&catalog?.available){$('current-model').textContent='目前模型：'+selected.displayName+(selected.sendReasoning?' · '+selected.effortLabel:'')+(preferences.valid?'':' · 已不可用');$('model-help').textContent=selected.displayName;}
  refreshTextModelAvailability();
}
async function openTextModelManager(){
  if($('text-model-menu').matches(':popover-open'))$('text-model-menu').hidePopover();
  try{await loadTextModels();const draft=structuredClone(state.textModels.catalog),baseline=draft.models.find(model=>model.id===draft.defaultModelId)||draft.models[0];draft.sharedDepths=structuredClone(baseline?.depths||[]);draft.sharedDefaultEffort=baseline?.defaultEffort||'';state.textModels.draft=draft;$('text-model-manage-status').textContent='';renderTextModelEditor();$('text-model-manage-dialog').showModal();}catch(error){fail(error);}
}
function renderTextModelEditor(){
  const draft=state.textModels.draft,editor=$('text-model-editor'),managerTools=$('text-model-manager-tools');editor.replaceChildren();
  const key=String(draft.models[0]?.id||'shared').replace(/[^a-zA-Z0-9_-]/g,'-');
  const card=node('section');card.id='text-model-profile-'+key;card.className='text-model-profile';
  const deleteButton=(id,label,action)=>{const button=node('button');button.id=id;button.className='text-model-delete-button';button.type='button';button.setAttribute('aria-label',label);const icon=node('i',undefined,'fi fi-rc-trash');icon.setAttribute('aria-hidden','true');const tooltip=node('span',label);tooltip.id=id+'-tooltip';tooltip.className='text-model-delete-tooltip';tooltip.setAttribute('role','tooltip');button.setAttribute('aria-describedby',tooltip.id);button.append(icon,tooltip);button.onclick=action;return button;};
  const modelSettings=node('details');modelSettings.id='text-model-profile-model-settings-'+key;modelSettings.className='text-model-profile-model-settings';modelSettings.open=true;
  const modelSummary=node('summary');modelSummary.id='text-model-profile-model-settings-heading-'+key;const modelToggle=node('i',undefined,'fi fi-br-angle-small-down');modelToggle.setAttribute('aria-hidden','true');modelSummary.append(modelToggle,node('span','模型設定'));modelSettings.append(modelSummary);modelSettings.addEventListener('toggle',()=>{modelToggle.className='fi fi-br-angle-small-'+(modelSettings.open?'down':'right');});
  const header=node('div');header.id='text-model-editor-heading';header.className='text-model-profile-fields-heading';
  for(const title of ['選單顯示','預設','傳送深度','API ID','顯示ID'])header.append(node('span',title));header.append(node('span'));
  const rows=node('div');rows.id='text-model-profile-list';rows.className='text-model-profile-list';
  for(const profile of draft.models){
    const profileKey=String(profile.id).replace(/[^a-zA-Z0-9_-]/g,'-');
    const fields=node('div');fields.id='text-model-profile-fields-'+profileKey;fields.className='text-model-profile-fields';fields.dataset.profileId=profile.id;fields.setAttribute('aria-labelledby',header.id);
    const field=(name,label,value,type,change)=>{const input=node('input');input.id='text-model-field-'+name+'-'+profileKey;input.type=type;input.setAttribute('aria-label',label);if(type==='checkbox')input.checked=value;else input.value=value;input.oninput=()=>change(type==='checkbox'?input.checked:input.value,input);fields.append(input);return input;};
    field('enabled','選單顯示',profile.enabled,'checkbox',value=>{profile.enabled=value;});
    const defaultCheckbox=field('default','預設模型',draft.defaultModelId===profile.id,'checkbox',(checked,input)=>{
      if(!checked){input.checked=true;return;}
      draft.defaultModelId=profile.id;editor.querySelectorAll('[data-model-default]').forEach(box=>{box.checked=box===input;});
    });defaultCheckbox.dataset.modelDefault='true';
    field('reasoning','將思考深度傳給 API',profile.sendReasoning,'checkbox',value=>{profile.sendReasoning=value;});
    const modelId=field('model-id','API ID',profile.modelId,'text',value=>{profile.modelId=value;});modelId.dataset.field='modelId';modelId.maxLength=200;modelId.placeholder='公司 API 的實際模型 ID';
    const name=field('display-name','顯示ID',profile.displayName,'text',value=>{profile.displayName=value;});name.maxLength=80;name.placeholder='例如：GPT-6.1 Sol';
    const remove=deleteButton('text-model-profile-remove-'+profileKey,'刪除模型',()=>{draft.models=draft.models.filter(item=>item!==profile);if(draft.defaultModelId===profile.id)draft.defaultModelId=null;renderTextModelEditor();});fields.append(remove);rows.append(fields);
  }
  modelSettings.append(header,rows,managerTools);card.append(modelSettings);
  const settings=node('details');settings.id='text-model-profile-settings-'+key;const summary=node('summary');summary.id='text-model-profile-settings-heading-'+key;const toggle=node('i',undefined,'fi fi-br-angle-small-right');toggle.setAttribute('aria-hidden','true');summary.append(toggle,node('span','共用思考深度設定'));settings.append(summary);settings.addEventListener('toggle',()=>{toggle.className='fi fi-br-angle-small-'+(settings.open?'down':'right');});
  const depthHeader=node('div');depthHeader.id='text-model-profile-depth-heading-'+key;depthHeader.className='text-model-depth-heading';for(const title of ['選單顯示','預設','API ID','顯示ID'])depthHeader.append(node('span',title));depthHeader.append(node('span'));settings.append(depthHeader);
  const depthRows=node('div');depthRows.id='text-model-profile-depth-editor-'+key;depthRows.className='text-model-depth-editor';
  const refreshDefault=()=>{
    if(!draft.sharedDefaultEffort||!draft.sharedDepths.some(depth=>depth.enabled&&depth.value===draft.sharedDefaultEffort))draft.sharedDefaultEffort=draft.sharedDepths.find(depth=>depth.enabled&&depth.value)?.value||'';
    depthRows.querySelectorAll('input[data-depth-default]').forEach(box=>{const depth=draft.sharedDepths[Number(box.dataset.depthIndex)];box.disabled=!depth?.enabled||!depth.value;box.checked=!!depth&&!!depth.value&&depth.value===draft.sharedDefaultEffort;});
  };
  const renderDepths=()=>{
    depthRows.replaceChildren();
    for(const [depthIndex,depth] of draft.sharedDepths.entries()){
      const depthKey=String(depthIndex+1),row=node('div');row.id='text-model-profile-depth-row-'+depthKey+'-'+key;row.className='text-model-depth-row';
      const enabled=node('input'),isDefault=node('input'),value=node('input'),label=node('input');
      enabled.id='text-model-profile-depth-enabled-'+depthKey+'-'+key;isDefault.id='text-model-profile-depth-default-'+depthKey+'-'+key;value.id='text-model-profile-depth-value-'+depthKey+'-'+key;label.id='text-model-profile-depth-label-'+depthKey+'-'+key;
      enabled.type='checkbox';enabled.checked=depth.enabled;enabled.setAttribute('aria-label','選單顯示');enabled.onchange=()=>{depth.enabled=enabled.checked;refreshDefault();};
      isDefault.type='checkbox';isDefault.dataset.depthDefault='true';isDefault.dataset.depthIndex=String(depthIndex);isDefault.setAttribute('aria-label','預設深度');isDefault.onchange=()=>{if(!isDefault.checked){isDefault.checked=true;return;}draft.sharedDefaultEffort=depth.value;refreshDefault();};
      value.value=depth.value;value.placeholder='API 值，例如 medium';value.setAttribute('aria-label','思考深度 API ID');value.maxLength=40;value.oninput=()=>{const previous=depth.value;depth.value=value.value;if(draft.sharedDefaultEffort===previous)draft.sharedDefaultEffort=depth.value;refreshDefault();};
      label.value=depth.label;label.placeholder='顯示名稱，例如 中';label.setAttribute('aria-label','思考深度顯示ID');label.maxLength=30;label.oninput=()=>{depth.label=label.value;};
      const remove=deleteButton('text-model-profile-depth-remove-'+depthKey+'-'+key,'移除思考深度',()=>{draft.sharedDepths=draft.sharedDepths.filter(item=>item!==depth);renderDepths();});row.append(enabled,isDefault,value,label,remove);depthRows.append(row);
    }
    refreshDefault();
  };
  renderDepths();const addDepth=node('button','新增深度');addDepth.id='text-model-profile-add-depth-'+key;addDepth.type='button';addDepth.onclick=()=>{draft.sharedDepths.push({value:'',label:'',enabled:true});renderDepths();depthRows.lastElementChild.querySelector('input:not([type="checkbox"])').focus();};settings.append(depthRows,addDepth);card.append(settings);editor.append(card);
}
async function saveTextModelManager(){
  const save=$('text-model-manage-save');save.disabled=true;$('text-model-manage-status').textContent='正在儲存…';
  try{const draft=state.textModels.draft,models=draft.models.map(profile=>({...profile,defaultEffort:draft.sharedDefaultEffort,depths:structuredClone(draft.sharedDepths)}));state.textModels.catalog=await api('/api/text-models',{revision:draft.revision,models,defaultModelId:draft.defaultModelId});await refreshTextModelSelection();$('text-model-manage-dialog').close();renderTextModelPicker();}
  catch(error){$('text-model-manage-status').textContent=error.message;}
  finally{save.disabled=false;}
}

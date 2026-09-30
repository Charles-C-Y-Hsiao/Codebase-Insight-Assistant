// Project navigation and explicit host authorization. No credentials are persisted.
function icon(name){const i=node('i',undefined,'fi fi-'+name);i.setAttribute('aria-hidden','true');return i;}
function iconButton(name,label){const b=node('button');b.type='button';b.title=label;b.setAttribute('aria-label',label);b.append(icon(name));return b;}
function rememberExpanded(){try{sessionStorage.setItem('cda.openProjects',JSON.stringify([...state.openProjects]));}catch{}}
function grantTime(p){if(p.id==='demo')return '展示專案 · 無期限';if(!p.active)return p.expiresAt>1?'已到期':'待重新授權';const mins=Math.max(0,Math.floor((p.expiresAt-Date.now())/60000));return mins>=60?Math.floor(mins/60)+' hrs':mins+' mins';}
let actionsProject=null,quickProject=null,expiryTimer;
async function deleteConversation(project,id,title){
  if(!window.confirm('確定刪除對話「'+title+'」？此操作無法還原。'))return;
  const current=project===state.project&&id===state.conversation;
  try{
    const result=await api('/api/conversations/'+encodeURIComponent(id),{},project,'DELETE');
    state.conversationLists.delete(project);
    if(current){state.conversation=result.nextConversationId||'';clearTaskView();await loadConversation();if(state.catalog.find(p=>p.id===project)?.active)await inventory();}
    else await listConversations(project);
  }catch(e){fail(e);}
}
renderProjectList=function(){
  const projects=[...state.catalog].sort((a,b)=>a.id==='demo'?-1:b.id==='demo'?1:0);
  $('project-list').replaceChildren(...projects.map(p=>{
    const group=node('div'),row=node('div');group.id='project-item-'+p.id;group.className='project-item';row.id='project-row-'+p.id;row.className='project-row';group.dataset.projectId=p.id;row.classList.toggle('project-current',p.id===state.project);
    const expanded=state.openProjects.has(p.id);
    const toggleConversations=()=>{const willExpand=!state.openProjects.has(p.id);if(willExpand)state.openProjects.add(p.id);else state.openProjects.delete(p.id);rememberExpanded();renderProjectList();if(willExpand)listConversations(p.id).catch(fail);};
    const choose=node('button',undefined,'project-choice');choose.id=group.id+'-choice';choose.type='button';choose.dataset.projectId=p.id;choose.dataset.tooltip=p.path;choose.setAttribute('aria-current',String(p.id===state.project));choose.setAttribute('aria-expanded',String(expanded));choose.setAttribute('aria-controls','conversations-'+p.id);choose.append(icon(expanded?'rc-folder-open':'rc-folder'),node('span',p.name));if(p.id!=='demo')choose.append(node('small',grantTime(p),'project-grant-time'));bindFileTooltip(choose);choose.onclick=async e=>{e.stopPropagation();try{const alreadyCurrent=p.id===state.project,switched=await switchProject(p.id);if(alreadyCurrent||switched)toggleConversations();}catch(err){fail(err);}};row.append(choose);
    const create=iconButton('rr-pen-circle','建立 '+p.name+' 的新對話');create.id=group.id+'-new-conversation';create.className='conversation-new';create.onclick=e=>{e.stopPropagation();(async()=>{try{if(!await allowSwitch())return;const c=await api('/api/conversations',{},p.id);await switchProject(p.id,{force:true,approved:true,conversation:c.id});}catch(err){fail(err);}})();};row.append(create);
    if(p.id!=='demo'){const renew=iconButton('br-plus-small','重新授權／延長 '+p.name);renew.id=group.id+'-renew';renew.className='project-renew';renew.onclick=e=>{e.stopPropagation();openQuickGrant(p.id);};row.append(renew);}
    const menu=iconButton('br-menu-dots','管理 '+p.name);menu.id=group.id+'-actions';menu.className='project-actions';menu.onclick=e=>{e.stopPropagation();openProjectActions(p.id);};row.append(menu);
    row.onclick=e=>{if(!e.target.closest('.project-renew,.project-actions'))toggleConversations();};group.append(row);
    const children=node('div',undefined,'project-conversations');children.id='conversations-'+p.id;children.hidden=!expanded;
    for(const c of state.conversationLists.get(p.id)||[]){const item=node('div',undefined,'conversation-row'),b=node('button',c.title||'新對話','conversation-choice');b.dataset.conversationId=c.id;b.title=c.title||'新對話';b.setAttribute('aria-current',String(p.id===state.project&&c.id===state.conversation));b.onclick=()=>switchConversation(p.id,c.id).catch(fail);const remove=iconButton('rc-trash','刪除對話：'+(c.title||'新對話'));remove.className='conversation-delete';remove.onclick=e=>{e.stopPropagation();deleteConversation(p.id,c.id,c.title||'新對話');};item.append(b,remove);children.append(item);}group.append(children);return group;
  }));renderScope();scheduleExpiry();
};
$('project-section-toggle').onclick=()=>{const panel=$('project-panel'),toggle=$('project-section-toggle');panel.hidden=!panel.hidden;toggle.setAttribute('aria-expanded',String(!panel.hidden));toggle.querySelector('i').className='fi fi-br-angle-small-'+(panel.hidden?'right':'down');};
function openProjectActions(id){actionsProject=id;const p=state.catalog.find(p=>p.id===id);$('project-actions-title').textContent=p.name;$('project-actions-path').textContent=p.path;$('project-expiry').textContent=grantTime(p);$('project-actions-status').textContent='';$('quick-renew').disabled=p.id==='demo';$('project-revoke').disabled=p.id==='demo'||!p.active;$('project-reindex').disabled=!p.active;$('project-actions-dialog').showModal();}
$('project-menu').onclick=()=>openProjectActions(state.project);
$('close-project-actions').onclick=()=>$('project-actions-dialog').close();
$('project-open').onclick=async()=>{try{const result=await api('/api/projects/'+encodeURIComponent(actionsProject)+'/open',{},actionsProject);$('project-actions-status').textContent='已開啟資料夾：'+result.path;}catch(e){$('project-actions-status').textContent=e.message;}};
$('quick-renew').onclick=()=>{$('project-actions-dialog').close();openQuickGrant(actionsProject);};
function openQuickGrant(id){quickProject=id;const p=state.catalog.find(p=>p.id===id),g=p.grantDefaults;$('quick-grant-title').textContent='重新授權：'+p.name;$('quick-grant-path').textContent=p.path;$('quick-grant-settings').textContent=`${g.minutes} 分鐘 · 修改 ${g.write?'允許':'不允許'} · 靜態驗證 ${g.verify?'允許':'不允許'} · AI ${g.ai?'允許':'不允許'}。變更設定請使用「新增專案／管理授權」。`;$('quick-grant-code').value='';$('quick-grant-status').textContent='';$('quick-grant-dialog').showModal();$('quick-grant-code').focus();}
$('close-quick-grant').onclick=()=>$('quick-grant-dialog').close();
$('quick-grant-dialog').addEventListener('close',()=>{$('quick-grant-code').value='';});
$('quick-grant-confirm').onclick=async()=>{const b=$('quick-grant-confirm');b.disabled=true;try{const p=state.catalog.find(p=>p.id===quickProject),code=$('quick-grant-code').value.trim();if(!/^[0-9a-f]{6}$/.test(code))throw new Error('請輸入本次服務的 6 碼十六進位管理碼');const q=await api('/api/roots/request',{path:p.path,...p.grantDefaults,create:false});await api('/api/roots/'+q.id+'/approve',{adminToken:code});$('admin').value=code;await catalog();if(p.id===state.project||state.references.includes(p.id))await inventory();$('quick-grant-status').textContent='授權完成；目前修改目標保持不變。';$('quick-grant-code').value='';}catch(e){$('quick-grant-status').textContent=e.message;}finally{b.disabled=false;}};
$('project-reindex').onclick=async()=>{try{await api('/api/index',{},actionsProject);if(actionsProject===state.project||state.references.includes(actionsProject))await inventory();$('project-actions-status').textContent='索引更新完成';}catch(e){$('project-actions-status').textContent=e.message;}};
$('project-revoke').onclick=async()=>{try{await api('/api/roots/'+actionsProject+'/revoke',{adminToken:$('admin').value});await catalog();expireVisibleFiles();$('project-expiry').textContent='授權已撤銷';$('project-revoke').disabled=true;$('project-reindex').disabled=true;}catch(e){$('project-actions-status').textContent=e.message+'；可先在完整授權視窗輸入本次管理碼。';}};
function allGrantRoots(){return [...state.catalog,...(state.globalReferences||[])];}
function expireVisibleFiles(){const expired=new Set(allGrantRoots().filter(p=>!p.active).map(p=>p.id));state.files=state.files.filter(f=>!expired.has(f.rootId));for(const id of state.selected)if(!state.files.some(f=>f.id===id))state.selected.delete(id);if(state.editor&&expired.has(state.editor.rootId)){state.editor=null;$('editor-file').textContent='授權已到期；候選內容保留，重新授權後請重新載入。';}renderFiles();if(expired.has(state.project))$('index-status').textContent='授權已到期，檔案已隱藏；歷史對話保留。';}
function scheduleExpiry(){clearTimeout(expiryTimer);let delay=300000;for(const p of allGrantRoots()){if(p.active&&p.expiresAt)delay=Math.min(delay,Math.max(1,p.expiresAt-Date.now()));}expiryTimer=setTimeout(()=>{let changed=false;for(const p of allGrantRoots())if(p.active&&p.expiresAt&&p.expiresAt<=Date.now()){p.active=false;changed=true;}if(changed)expireVisibleFiles();renderProjectList();if(actionsProject){const p=state.catalog.find(p=>p.id===actionsProject);if(p)$('project-expiry').textContent=grantTime(p);}},Math.max(1,delay));}
document.addEventListener('visibilitychange',()=>{if(!document.hidden){for(const p of allGrantRoots())if(p.expiresAt&&p.expiresAt<=Date.now())p.active=false;expireVisibleFiles();renderProjectList();}});

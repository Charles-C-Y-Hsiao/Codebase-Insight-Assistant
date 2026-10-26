function renderNewFiles(job,target,prefix=''){
  if(!job.creations?.length)return;
  const first=job.creations.find(i=>i.status==='pending'),container=node('div',undefined,'new-files');container.id=prefix+'new-files-'+job.id;
  container.append(node('p','新增檔案 '+job.creations.length+' / 20 份 · 請依序確認或略過'));
  for(const [index,item] of job.creations.entries()){
    const card=node('section',undefined,'new-file');card.id=prefix+'new-file-'+item.id;
    const status={pending:'待確認',created:'已建立',skipped:'已略過',failed:'建立失敗',cancelled:'已取消'}[item.status]||item.status;
    card.append(node('h4',(index+1)+'. '+item.relativePath+' · '+status),node('p',item.purpose));
    if(typeof item.content==='string'){
      const preview=taskDetails(job.id+':'+prefix+'new-file:'+item.id,'預覽完整內容',item===first);preview.append(node('pre',item.content));card.append(preview);
    }else card.append(node('span','歷史提案內容不重播；建立結果保留於檔案與紀錄。','muted'));
    if(item.error)card.append(node('p',item.error,'error'));
    if(item.result){card.append(node('p',item.result.verification.status+' · '+item.result.verification.message));for(const warning of item.result.warnings||[])card.append(node('p',warning,'error'));}
    if(item===first&&job.status==='awaiting_approval'&&!job.archived){
      const actions=node('div',undefined,'new-file-actions');
      for(const [decision,label] of [['create','確認建立'],['skip','略過']]){
        const button=node('button',label,decision==='create'?'primary':'');button.type='button';button.id=prefix+'new-file-'+decision+'-'+item.id;
        button.onclick=async()=>{
          for(const b of actions.querySelectorAll('button'))b.disabled=true;
          try{const result=await api('/api/jobs/'+job.id+'/new-files/'+item.id,{decision,adminToken:$('admin').value});show(result);if(taskIsLive(result))poll(result).catch(fail);await inventory();}
          catch(e){fail(e);for(const b of actions.querySelectorAll('button'))b.disabled=false;}
        };actions.append(button);
      }
      card.append(actions);
    }
    container.append(card);
  }
  target.replaceChildren(container);
}

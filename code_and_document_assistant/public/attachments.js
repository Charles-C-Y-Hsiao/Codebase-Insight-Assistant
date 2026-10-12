function attachmentPreview(image,remove){
  const figure=node('figure',undefined,'attachment-preview'),caption=node('figcaption',image.name+' · '+(image.size/1024/1024).toFixed(2)+' MB');
  if(image.available===false){figure.classList.add('attachment-error');caption.textContent=image.name+' · 附件已隨服務重啟清除';figure.append(caption);return figure;}
  const img=node('img');
  img.width=Math.max(1,Number(image.width)||1);img.height=Math.max(1,Number(image.height)||1);
  img.src=image.url||'/attachments/'+encodeURIComponent(image.id);img.alt=image.name;img.loading='lazy';
  img.onerror=()=>{img.hidden=true;figure.classList.add('attachment-error');caption.textContent=image.name+' · 圖片無法載入';};
  figure.append(img,caption);
  if(remove)bindImagePreview(img,()=>state.draftImages.map(i=>({src:'/attachments/'+encodeURIComponent(i.id),width:i.width,height:i.height,alt:i.name})));
  if(remove){const button=node('button');button.type='button';button.id='remove-image-'+image.id;button.className='attachment-remove';button.setAttribute('aria-label','移除圖片：'+image.name);button.title='移除圖片';const icon=node('i',undefined,'fi fi-br-cross-circle');icon.setAttribute('aria-hidden','true');button.append(icon);button.onclick=remove;figure.append(button);}
  return figure;
}
const imageReferenceName=index=>{
  const numerals=['零','一','二','三','四','五','六','七','八','九','十'];
  return '圖'+(numerals[index]||String(index));
};
function renderDraftImages(){
  const latestIncluded=state.imageWorkspaceActive&&$('image-use-latest')?.checked&&!!imageSeriesVersions(state.imageSeriesId).at(-1);let selectedIndex=latestIncluded?2:1;
  $('image-draft').replaceChildren(...state.draftImages.map(i=>{const figure=attachmentPreview(i,()=>{
    const epoch=state.epoch;
    queueImageAction(async()=>{if(epoch!==state.epoch)return;await api('/api/image-draft/'+i.id,{},undefined,'DELETE');await loadImageDraft();});
  });const use=node('label',undefined,'attachment-use'),check=node('input'),included=i.selected!==false,label=included?imageReferenceName(selectedIndex++)+' · 附件草稿圖':'未送出 · 附件草稿圖';check.type='checkbox';check.checked=included;check.setAttribute('aria-label','本次討論使用圖片：'+i.name);check.onchange=()=>{i.selected=check.checked;renderDraftImages();};use.append(check,node('span',label));figure.append(use);return figure;}));
  $('image-count').textContent=state.draftImages.length+' / 5 張';
}
async function loadImageDraft(){
  const [draft,settings]=await Promise.all([api('/api/image-draft'),api('/api/image-settings')]);
  state.draftImages=draft.images.map(image=>({...image,selected:image.selected!==false}));state.imageLimitMB=settings.maxImageMB;state.imagesSupported=settings.supportsImages;state.imageReady=true;
  $('image-limit').value=state.imageLimitMB;
  $('image-support').textContent=settings.supportsImages?'目前模型已啟用圖片輸入':'目前模型／端點未啟用圖片輸入；送出前須設定支援的模型';
  renderDraftImages();
}
function queueImageAction(action){
  state.imageQueue=state.imageQueue.then(async()=>{try{$('image-notice').textContent='處理圖片中…';await action();$('image-notice').textContent='';}catch(e){if(!e.stale)$('image-notice').textContent=e.message;}});
  return state.imageQueue;
}
function initAttachments(){
  $('image-limit').onchange=()=>{
    const value=Number($('image-limit').value);
    queueImageAction(async()=>{const result=await api('/api/image-settings',{maxImageMB:value});state.imageLimitMB=result.maxImageMB;$('image-limit').value=result.maxImageMB;});
  };
  $('question').addEventListener('paste',event=>{
    const files=[...(event.clipboardData?.items||[])].filter(i=>i.kind==='file').map(i=>i.getAsFile()).filter(Boolean);
    if(!files.length)return;event.preventDefault();
    const epoch=state.epoch;
    queueImageAction(async()=>{
      if(epoch!==state.epoch)return;
      if(!state.imageReady)throw new Error('請先等候專案對話載入');
      if(files.length+state.draftImages.length>5)throw new Error('每次問題最多 5 張圖片');
      for(const file of files){
        if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('只接受 PNG、JPEG、WebP 圖片');
        if(file.size>state.imageLimitMB*1024*1024)throw new Error('圖片超過目前單張 '+state.imageLimitMB+' MB 上限');
      }
      for(const file of files){
        if(epoch!==state.epoch)return;
        const response=await fetch('/api/image-draft',{method:'POST',headers:{'Content-Type':file.type,'X-CDA-Token':state.csrf,'X-CDA-Project':state.project,'X-CDA-Conversation':state.conversation,'X-CDA-Image-Name':encodeURIComponent(file.name||'貼入的圖片')},body:file});
        const result=await response.json();
        if(epoch!==state.epoch)return;
        if(!response.ok)throw new Error(result.error||'圖片暫存失敗');
        state.draftImages.push(result);renderDraftImages();
      }
    });
  });
}
function renderTaskImages(job,article){
  if(!job.attachments?.length)return;
  const gallery=node('div',undefined,'attachment-gallery');gallery.id='task-images-'+job.id;
  gallery.append(...job.attachments.map(i=>{const figure=attachmentPreview(i),preview=figure.querySelector('img');if(preview)bindImagePreview(preview,()=>taskPreviewImages(job));return figure;}));article.append(gallery);
}

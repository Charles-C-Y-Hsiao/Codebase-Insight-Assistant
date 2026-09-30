function imagePromptIntent(prompt){
  const value=String(prompt||'').trim();
  if(/提示詞|prompt|怎麼|如何|是否|可以嗎|分析|說明|討論|建議/i.test(value.slice(0,100)))return false;
  return /(?:請|幫我|我要|製作|產生|生成|畫|設計|create|generate|draw|design)[\s\S]{0,160}(?:圖片|圖像|插圖|資訊圖表|流程圖|簡報圖|image|illustration|infographic)/i.test(value);
}
const IMAGE_MODEL_OPTIONS=['gpt-image-2.5-sunburst','gpt-image-1'];
const DEFAULT_IMAGE_MODEL='gpt-image-2.5-sunburst';
function confirmImageCreation(prompt,version){
  const dialog=$('image-create-dialog');
  const picker=$('image-create-model-select');
  const selected=DEFAULT_IMAGE_MODEL;
  if(window.jQuery?.fn?.select2){
    const $picker=window.jQuery(picker);
    if($picker.hasClass('select2-hidden-accessible'))$picker.select2('destroy');
    $picker.select2({width:'250px',dropdownParent:window.jQuery(dialog),minimumResultsForSearch:Infinity});
    $picker.val(selected).trigger('change');
    $picker.off('change.imageCreation').on('change.imageCreation',()=>{$('image-create-model').textContent='圖片模型：'+$picker.val();});
  }else picker.value=selected;
  $('image-create-prompt').textContent=prompt;
  $('image-create-version').textContent=String(version);
  $('image-create-model').textContent=state.imageGeneration.enabled?'圖片模型：'+picker.value:'尚未設定核准的圖片模型';
  $('image-create-error').textContent=state.imageGeneration.enabled?'':'需在服務端 AI 設定中指定 imageGenerationModel，才可開始創作。';
  $('image-create-confirm').disabled=!state.imageGeneration.enabled;
  return new Promise(resolve=>{
    const close=approved=>{dialog.removeEventListener('cancel',cancel);dialog.close();resolve(approved?picker.value:'');};
    const cancel=event=>{event.preventDefault();close(false);};
    dialog.addEventListener('cancel',cancel);
    $('image-create-back').onclick=()=>close(false);
    $('image-create-confirm').onclick=()=>close(true);
    dialog.showModal();
  });
}
async function submitImageCreation(){
  const prompt=$('question').value.trim();
  if(!prompt){$('question').focus();throw new Error('請先在對話框整理圖片提示詞');}
  if(prompt.length>12000)throw new Error('圖片提示詞最多 12000 字');
  if(state.draftImages.length)throw new Error('圖片創作目前使用文字提示詞與上一版生成圖片；請先移除貼入的草稿圖片');
  const previous=state.imagePreviousJobId?state.taskJobs.get(state.imagePreviousJobId):null;
  if(state.imagePreviousJobId&&!previous)throw new Error('上一版圖片不屬於目前對話');
  const imageModel=await confirmImageCreation(prompt,(previous?.imageCreation.version||0)+1);
  if(!imageModel){$('question').focus();return;}
  const job=await api('/api/image-generation',{prompt,imageModel,previousJobId:previous?.id||null});
  if($('question').value.trim()===prompt)$('question').value='';state.questionBaseline='';state.job=job.id;state.imagePreviousJobId=null;
  showImageJob(job);await listConversations(state.project);await poll(job);
}
function showImageJob(job){
  if(job.projectId!==state.project||job.conversationId!==state.conversation)return;
  $('cancel').disabled=job.status!=='running';
  $('progress').textContent=job.progress;
  state.taskJobs.set(job.id,job);
  let article=state.articles.get(job.id);
  if(!article){article=node('article',undefined,'message image-task');article.id='task-'+job.id;state.articles.set(job.id,article);$('history').append(article);}
  const image=job.imageCreation;
  const heading=node('div',undefined,'task-card-heading');heading.dataset.status=job.status;
  heading.append(node('strong',taskHeadline(job),'task-card-status'),node('span',' · '+taskDuration(job),'task-duration'));
  const question=node('p',undefined,'question task-card-question');question.title=job.question;
  question.append(node('span',job.question,'task-card-question-text'));
  article.replaceChildren(heading,question);
  const detail=taskDetails(job.id+':main','詳細資訊',job.status==='running'&&!job.archived);
  detail.classList.add('task-main-details');detail.id='task-more-'+job.id;
  detail.firstChild.setAttribute('aria-controls','task-more-content-'+job.id);
  detail.firstChild.setAttribute('aria-expanded',String(detail.open));
  detail.addEventListener('toggle',()=>detail.firstChild.setAttribute('aria-expanded',String(detail.open)));
  const detailContent=node('div',undefined,'task-main-content');detailContent.id='task-more-content-'+job.id;
  detailContent.append(historyLabel(job,'full-question','完整需求',[historyText(job.question)]),node('span',image.slug+' · 第 '+image.version+' 版 · '+image.model,'image-task-meta'));
  if(image.fileName)detailContent.append(node('span',image.fileName+' · '+image.width+' × '+image.height,'image-task-meta'));
  if(job.result?.unknown?.length)detailContent.append(historyLabel(job,'unknown','未確認事項',job.result.unknown.map(item=>historyText(item))));
  if(job.status==='completed'&&image.fileName){
    const figure=node('figure',undefined,'image-task-result'),preview=node('img');
    preview.src='/generated-images/'+encodeURIComponent(job.id);preview.alt=image.slug+' 第 '+image.version+' 版';preview.loading='lazy';
    bindImagePreview(preview,()=>taskPreviewImages(job));
    figure.append(preview);article.append(figure);
    const actions=node('div',undefined,'image-task-actions'),edit=node('button','修改這張圖片');edit.type='button';edit.id='image-edit-'+job.id;
    edit.onclick=()=>{state.imagePreviousJobId=job.id;$('question').value='請以第 '+image.version+' 版圖片為基礎，修改：\n';$('question').focus();};
    const download=node('a','下載 PNG');download.href=preview.src;download.download=image.fileName;
    actions.append(edit,download);article.append(actions);
  }else article.append(node('span',job.status==='running'?'正在創作圖片…':job.result?.unknown?.join('；')||job.progress,'image-task-status'));
  detail.append(detailContent);article.append(detail);
}

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {createApp}=require('../server');

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5n8AAAAASUVORK5CYII=','base64');
const toolResponse=name=>Response.json({status:'completed',output:[{type:'function_call',call_id:'call-1',name,arguments:JSON.stringify(name==='finish_image_discussion'?{status:'completed',answer:'依文字整理構圖。',steps:[],conclusions:[],facts:[],inferences:[],unknown:[],agentUnderstanding:'文字構圖',discussion:'沒有收到圖片內容，無法觀察草稿圖。',prompt:'依文字構圖產生圖片'}:{status:'completed',answer:'已收到文字。',steps:[],conclusions:[],facts:[],inferences:[],unknown:[]})}],usage:{input_tokens:10,output_tokens:10}});

test('文字模式：圖片討論只送文字，生圖仍使用文字生成 API',async t=>{
  const base=await fs.mkdtemp(path.join(__dirname,'..','..','.text-only-image-'));
  const projectRoot=path.join(base,'project');await fs.mkdir(projectRoot);
  const calls=[];
  const instance=await createApp({runtime:path.join(base,'runtime'),imageProjectRoot:path.join(base,'image-projects'),adminToken:'abcdef',aiOptions:{env:{CDA_MODEL_MODE:'real',CDA_AI_MODEL:'gpt-5.6-luna',CDA_AI_KEY:'FAKE'},fetchImpl:async(url,options)=>{
    calls.push({url,options});
    if(url.endsWith('/responses')){
      const body=JSON.parse(options.body);
      if(!body.tools){const input=JSON.parse(body.input.find(item=>item.role==='user').content),result={selectedJobIds:[],reason:'沒有需要保留的舊討論',reasons:Object.fromEntries(input.candidates.map(item=>[item.id,'本次只依文字要求']))};return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(result)}]}],usage:{input_tokens:10,output_tokens:10}});}
      return toolResponse(body.tools.some(item=>item.name==='finish_image_discussion')?'finish_image_discussion':'finish');
    }
    return Response.json({data:[{b64_json:png.toString('base64')}]});
  }}});
  const server=instance.app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await instance.saved.queue;await fs.rm(base,{recursive:true,force:true,maxRetries:5,retryDelay:50});});
  const origin='http://127.0.0.1:'+server.address().port;
  const sessionResponse=await fetch(origin+'/api/session'),session=await sessionResponse.json();
  assert.equal(session.imageTextOnlyMode,true);
  const headers={cookie:sessionResponse.headers.get('set-cookie').split(';')[0],'x-cda-token':session.csrf,'content-type':'application/json'};
  const request=async(endpoint,body,method=body===undefined?'GET':'POST')=>{const response=await fetch(origin+endpoint,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,data:await response.json()};};
  const settings=await request('/api/image-settings');assert.equal(settings.data.textOnlyMode,true);assert.equal(settings.data.supportsImages,false);
  const imageProjectId='12345678-1234-4123-8123-abcdef123456';
  assert.equal((await request('/api/image-projects',{id:imageProjectId})).status,201);
  const grant=(await request('/api/roots/request',{path:projectRoot,write:true,ai:true,minutes:60})).data;
  const approval=await request('/api/roots/'+grant.id+'/approve',{adminToken:'abcdef'});assert.equal(approval.status,200,approval.data.error);
  const root=approval.data.root;
  headers['x-cda-project']=root.id;
  headers['x-cda-conversation']=(await request('/api/conversations')).data.id;
  const upload=await fetch(origin+'/api/image-draft',{method:'POST',headers:{...headers,'content-type':'image/png','x-cda-image-name':'test.png'},body:png});
  assert.equal(upload.status,201);const draft=await upload.json();
  const discussion=await request('/api/image-project-chat',{question:'只依文字討論構圖',imageProjectId,imageIds:[draft.id],includeLatestImage:true});
  assert.equal(discussion.status,202,discussion.data.error);assert.deepEqual(discussion.data.attachments,[]);
  const owner=headers.cookie.slice('cda_session='.length);
  await instance.engine.get(discussion.data.id,owner).finished;
  const chatCalls=calls.filter(call=>call.url.endsWith('/responses'));
  assert.equal(chatCalls.length,1);
  const chatBody=JSON.parse(chatCalls[0].options.body);
  assert.equal(JSON.stringify(chatBody).includes('input_image'),false);
  assert.deepEqual(JSON.parse(chatBody.input.find(item=>item.role==='user').content).images,[]);
  assert.equal((await request('/api/image-draft')).data.images.length,1,'未勾選的貼圖維持本機草稿');
  const project=(await request('/api/image-projects')).data.projects.find(item=>item.id===imageProjectId);
  const generation=await request('/api/image-project-generation',{prompt:'用文字提示詞產生幾何構圖',currentRequest:'幾何構圖',imageProjectId,seriesId:project.series[0].id,referenceImageIds:[draft.id],adminToken:'abcdef'});
  assert.equal(generation.status,202,generation.data.error);
  await instance.creations.jobs.get(generation.data.id).finished;
  const generationCalls=calls.filter(call=>call.url.endsWith('/generations'));
  assert.equal(generationCalls.length,1);
  assert.equal(calls.some(call=>call.url.endsWith('/edits')),false);
  assert.equal(generationCalls[0].options.headers['Content-Type'],'application/json');
  assert.equal(typeof JSON.parse(generationCalls[0].options.body).prompt,'string');
  const result=(await request('/api/jobs/'+generation.data.id)).data;
  assert.equal(result.status,'completed');assert.deepEqual(result.imageCreation.references,[]);
  const followup=await request('/api/image-project-chat',{question:'上一版產圖之後，繼續只依文字討論',imageProjectId,seriesId:project.series[0].id,imageIds:[draft.id],includeLatestImage:true});
  assert.equal(followup.status,202,followup.data.error);assert.deepEqual(followup.data.attachments,[]);
  await instance.engine.get(followup.data.id,owner).finished;
  for(const call of calls.filter(item=>item.url.endsWith('/responses')))assert.equal(JSON.stringify(JSON.parse(call.options.body)).includes('input_image'),false);
  const revision=await request('/api/image-project-generation',{prompt:'延續上一版的幾何構圖，但改為藍色',currentRequest:'改為藍色',imageProjectId,seriesId:project.series[0].id,previousJobId:generation.data.id,referenceImageIds:[draft.id],adminToken:'abcdef'});
  assert.equal(revision.status,202,revision.data.error);await instance.creations.jobs.get(revision.data.id).finished;
  assert.equal(calls.filter(call=>call.url.endsWith('/generations')).length,2);
  assert.equal(calls.some(call=>call.url.endsWith('/edits')),false,'上一版圖片不得變成 multipart 編輯輸入');
  const revised=(await request('/api/jobs/'+revision.data.id)).data;
  assert.equal(revised.status,'completed');assert.equal(revised.imageCreation.previousJobId,generation.data.id);assert.deepEqual(revised.imageCreation.references,[]);
  const regular=await request('/api/jobs',{question:'只處理文字',imageIds:[draft.id]});
  assert.equal(regular.status,202,regular.data.error);assert.deepEqual(regular.data.attachments,[]);
  await instance.engine.get(regular.data.id,owner).finished;
  for(const call of calls.filter(item=>item.url.endsWith('/responses')))assert.equal(JSON.stringify(JSON.parse(call.options.body)).includes('input_image'),false);

  const browser=await require('puppeteer').launch({executablePath:process.env.CDA_BROWSER||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,userDataDir:path.join(base,'chrome-profile'),args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage();await page.goto(origin,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>state.imageReady&&state.imageProjectId);
    await page.evaluate(()=>setImageWorkspaceActive(true));
    assert.deepEqual(await page.evaluate(()=>({mode:state.imageTextOnlyMode,createDisabled:document.getElementById('image-create-mode').disabled,createChecked:document.getElementById('image-create-mode').checked,latestDisabled:document.getElementById('image-use-latest').disabled,latestChecked:document.getElementById('image-use-latest').checked})),{mode:true,createDisabled:false,createChecked:false,latestDisabled:true,latestChecked:false});
    await page.evaluate(async encoded=>{const bytes=Uint8Array.from(atob(encoded),character=>character.charCodeAt(0)),response=await fetch('/api/image-draft',{method:'POST',headers:{'Content-Type':'image/png','X-CDA-Token':state.csrf,'X-CDA-Project':state.project,'X-CDA-Conversation':state.conversation,'X-CDA-Image-Name':'browser.png'},body:bytes});if(!response.ok)throw new Error((await response.json()).error);await loadImageDraft();},png.toString('base64'));
    assert.deepEqual(await page.$$eval('#image-draft .attachment-use input',elements=>elements.map(item=>({checked:item.checked,disabled:item.disabled}))),[{checked:false,disabled:true}]);
    await page.evaluate(()=>{const project=currentImageProject(),series=project.series[0];state.imageSeriesId=series.id;state.taskJobs.set('test-latest',{id:'test-latest',kind:'image',imageCreation:{imageProject:{id:project.id},seriesId:series.id,fileName:'preview.png',version:1,prompt:'上一版文字提示詞'}});renderImageDiscussionReferences();});
    assert.deepEqual(await page.$eval('#image-use-latest',element=>({checked:element.checked,disabled:element.disabled})),{checked:false,disabled:true},'已有上一版圖片時仍不能勾選');
    await page.evaluate(()=>{confirmImageCreation('僅使用文字',2,{projectMode:true});});
    await page.waitForSelector('#image-create-dialog[open]');
    assert.deepEqual(await page.$$eval('#image-create-reference-list input',elements=>elements.map(item=>({checked:item.checked,disabled:item.disabled}))),[{checked:false,disabled:true}], '確認視窗中的圖片材料不能勾選');
    await page.click('#image-create-back');
    await page.click('#image-create-mode');assert.equal(await page.$eval('#image-create-mode',element=>element.checked),true,'文字模式仍可選擇圖片創作');
    await page.evaluate(encoded=>{const bytes=Uint8Array.from(atob(encoded),character=>character.charCodeAt(0)),transfer=new DataTransfer();transfer.items.add(new File([bytes],'pasted.png',{type:'image/png'}));document.getElementById('question').dispatchEvent(new ClipboardEvent('paste',{clipboardData:transfer,bubbles:true,cancelable:true}));},png.toString('base64'));
    await page.waitForSelector('#image-text-only-dialog[open]');
    assert.match(await page.$eval('#image-text-only-dialog',element=>element.textContent),/圖片創作只使用文字提示詞/);
  }finally{await browser.close();}
});

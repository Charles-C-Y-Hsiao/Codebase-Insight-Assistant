const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {createApp}=require('../server');

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5n8AAAAASUVORK5CYII=','base64');

test('延續圖片整合紀錄可在取消產圖後回查，產圖時保存實際送出的文字',async t=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'cda-compose-api-'));
  const calls=[];
  const instance=await createApp({runtime:path.join(base,'runtime'),imageProjectRoot:path.join(base,'images'),adminToken:'abcdef',aiOptions:{env:{CDA_MODEL_MODE:'real',CDA_AI_MODEL:'gpt-5.6-luna',CDA_AI_KEY:'FAKE'},fetchImpl:async(url,options)=>{
    if(url.endsWith('/responses')){const body=JSON.parse(options.body);calls.push(body);const request=JSON.parse(body.input.at(-1).content);const text=request.parts?.some(part=>part.text.includes('格式錯誤'))?'not-json':JSON.stringify({prompt:'保留流程圖構圖，只把配色改為藍色',decisions:['沿用 v1 的構圖'],conflicts:[],unverified:[]});return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text}]}],usage:{input_tokens:12,output_tokens:8}});}
    return Response.json({data:[{b64_json:png.toString('base64')}]});
  }}});
  const server=instance.app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await instance.saved.queue;await fs.rm(base,{recursive:true,force:true});});
  const origin='http://127.0.0.1:'+server.address().port;
  const sessionResponse=await fetch(origin+'/api/session'),session=await sessionResponse.json();
  const headers={cookie:sessionResponse.headers.get('set-cookie').split(';')[0],'x-cda-token':session.csrf,'content-type':'application/json'};
  async function request(endpoint,body,method=body===undefined?'GET':'POST'){const response=await fetch(origin+endpoint,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,data:await response.json()};}
  const projectId='12345678-1234-4123-8123-abcdef123456';
  assert.equal((await request('/api/image-projects',{id:projectId,name:'測試圖片'})).status,201);
  headers['x-cda-conversation']=(await request('/api/conversations')).data.id;
  const series=(await request('/api/image-projects/'+projectId+'/series',{name:'流程圖'})).data.series;
  const first=(await request('/api/image-project-generation',{imageProjectId:projectId,seriesId:series.id,prompt:'保留流程圖構圖',currentRequest:'建立流程圖',adminToken:'abcdef'})).data;
  await instance.creations.jobs.get(first.id).finished;
  const compose=await request('/api/image-project-prompt-compositions',{imageProjectId:projectId,seriesId:series.id,previousJobId:first.id,currentRequest:'只把配色改為藍色'});
  assert.equal(compose.status,200,compose.data.error);
  assert.equal(compose.data.result.prompt,'保留流程圖構圖，只把配色改為藍色');
  assert.equal(calls.length,1);
  assert.equal(JSON.stringify(calls[0]).includes('input_image'),false);
  assert.equal(JSON.parse(calls[0].input.at(-1).content).imageTextOnlyMode,true);
  const history=await request('/api/image-projects/'+projectId+'/series/'+series.id+'/prompt-compositions');
  assert.equal(history.data.records[0].usedJobId,null,'取消產圖後整合紀錄仍保留');
  const detail=(await request('/api/image-project-prompt-compositions/'+compose.data.id)).data.record;
  assert.deepEqual(detail.chain.map(item=>item.jobId),[first.id]);
  assert.equal(detail.result.usage.inputTokens,12);
  const second=await request('/api/image-project-generation',{imageProjectId:projectId,seriesId:series.id,previousJobId:first.id,currentRequest:'只把配色改為藍色',prompt:compose.data.result.prompt,promptCompositionId:compose.data.id,adminToken:'abcdef'});
  assert.equal(second.status,202,second.data.error);
  assert.equal(second.data.imageCreation.prompt,compose.data.result.prompt,'後端不得再補寫延續規則');
  assert.equal(second.data.imageCreation.promptCompositionId,compose.data.id);
  await instance.creations.jobs.get(second.data.id).finished;
  const used=(await request('/api/image-project-prompt-compositions/'+compose.data.id)).data.record;
  assert.equal(used.usedJobId,second.data.id);
  assert.equal(used.finalSubmission.prompt,compose.data.result.prompt);
  const stale=await request('/api/image-project-generation',{imageProjectId:projectId,seriesId:series.id,previousJobId:first.id,currentRequest:'改為紅色',prompt:compose.data.result.prompt,promptCompositionId:compose.data.id,adminToken:'abcdef'});
  assert.equal(stale.status,400);
  assert.match(stale.data.error,/已過期/);
  const failed=await request('/api/image-project-prompt-compositions',{imageProjectId:projectId,seriesId:series.id,previousJobId:first.id,currentRequest:'格式錯誤'});
  assert.equal(failed.status,400);assert(failed.data.traceId);
  const failureTrace=(await request('/api/image-project-prompt-compositions/'+failed.data.traceId)).data.record;
  assert.equal(failureTrace.status,'failed');assert.equal(failureTrace.batches[0].status,'failed');assert.equal(failureTrace.batches[0].error.rawOutput,'not-json');
  const completedFirst=(await request('/api/jobs/'+first.id)).data;
  const browser=await require('puppeteer').launch({executablePath:process.env.CDA_BROWSER||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,userDataDir:path.join(base,'chrome-profile'),args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage();
    await page.setCookie({name:'cda_session',value:headers.cookie.slice('cda_session='.length),domain:'127.0.0.1',path:'/'});
    await page.goto(origin,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>state.imageReady);
    await page.evaluate(({projectId,seriesId,job})=>{state.imageProjectId=projectId;state.imageSeriesId=seriesId;state.taskJobs.set(job.id,job);setImageWorkspaceActive(true);window.compositionResult=confirmImageCreation('只把配色改為藍色',2,{projectMode:true,previous:job});},{projectId,seriesId:series.id,job:completedFirst});
    await page.waitForFunction(()=>document.getElementById('image-create-composition-status').textContent.includes('整合完成'));
    assert.equal(await page.$eval('#image-create-full-prompt',element=>element.value),compose.data.result.prompt);
    await page.evaluate(()=>{const full=document.getElementById('image-create-full-prompt');full.value+='，保留所有標題';full.dispatchEvent(new Event('input',{bubbles:true}));const request=document.getElementById('image-create-request');request.value='本次要求改為只換藍色配色';request.dispatchEvent(new Event('input',{bubbles:true}));});
    assert.match(await page.$eval('#image-create-composition-status',element=>element.textContent),/已變更/);
    assert.match(await page.$eval('#image-create-full-prompt',element=>element.value),/保留所有標題/);
    await page.click('#image-create-confirm');assert.match(await page.$eval('#image-create-error',element=>element.textContent),/已過期/);
    await page.click('#image-create-composition-accept');await page.type('#image-create-admin','abcdef');await page.click('#image-create-confirm');
    const confirmed=await page.evaluate(()=>window.compositionResult);
    assert.equal(confirmed.manualPromptAccepted,true);assert.equal(confirmed.staleManualAccepted,true);assert.match(confirmed.prompt,/保留所有標題/);
  }finally{await browser.close();}
});

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {createApp}=require('../server');

test('圖片摘要分批處理跨對話長提示詞，只計入已完成任務',async t=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'cda-image-summary-'));
  const calls=[];let browser;
  const instance=await createApp({runtime:path.join(base,'runtime'),imageProjectRoot:path.join(base,'images'),aiOptions:{env:{CDA_MODEL_MODE:'real',CDA_AI_MODEL:'gpt-5.6-luna',CDA_AI_KEY:'FAKE'},fetchImpl:async(url,options)=>{
    assert.match(url,/\/responses$/);
    const body=JSON.parse(options.body),payload=JSON.parse(body.input[1].content),size=body.input[1].content.length;
    if(size>16000)return Response.json({error:'input too long'},{status:400});
    calls.push({size,payload});
    return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({projectSummary:'專案摘要 '+calls.length,seriesSummary:'系列摘要 '+calls.length})}]}],usage:{input_tokens:100,output_tokens:20}});
  }}});
  const server=instance.app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(async()=>{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));await instance.saved.queue;await fs.rm(base,{recursive:true,force:true});});
  const origin='http://127.0.0.1:'+server.address().port,sessionResponse=await fetch(origin+'/api/session'),session=await sessionResponse.json();
  const cookie=sessionResponse.headers.get('set-cookie').split(';')[0],owner=cookie.split('=')[1],headers={cookie,'x-cda-token':session.csrf,'x-cda-project':'demo','content-type':'application/json'};
  async function request(url,body){const response=await fetch(origin+url,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,data:await response.json()};}
  const projectId=crypto.randomUUID(),created=await request('/api/image-projects',{id:projectId});assert.equal(created.status,201);
  const series=(await request('/api/image-projects/'+projectId+'/series',{name:'長提示詞系列'})).data.series;
  const first=(await request('/api/conversations',{})).data.id,second=(await request('/api/conversations',{})).data.id;
  const completed=[];
  for(let index=0;index<9;index++){
    const id=crypto.randomUUID();completed.push(id);
    await instance.saved.record({id,owner,projectId:'demo',conversationId:index<4?first:second,kind:'image',status:'completed',question:'第 '+index+' 版只修改配色',startedAt:Date.now()+index,finishedAt:Date.now()+index+1,result:{answer:'保留主題與構圖',conclusions:[]},imageCreation:{imageProject:{id:projectId},seriesId:series.id,version:index+1,currentRequest:'第 '+index+' 版只修改配色',prompt:'原始構圖\n'+'細節'.repeat(7400)+'\n最後保留流程圖'}});
  }
  await instance.saved.record({id:crypto.randomUUID(),owner,projectId:'demo',conversationId:second,kind:'image',status:'partial',question:'失敗的創作',startedAt:Date.now()+100,result:{answer:''},imageCreation:{imageProject:{id:projectId},seriesId:series.id,prompt:'不應納入'}});
  headers['x-cda-conversation']=second;
  browser=await require('puppeteer').launch({executablePath:process.env.CDA_BROWSER||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,userDataDir:path.join(base,'chrome-profile'),args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage();await page.setCookie({name:'cda_session',value:owner,url:origin});
  await page.goto(origin,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>state.conversation&&state.imageProjects.length);
  await page.click('#image-project-toggle');await page.click('#image-project-row-'+projectId+' .image-project-choice');
  await page.waitForFunction(()=>!document.getElementById('image-summary-update').disabled);
  await page.click('#image-summary-update');await page.waitForFunction(()=>document.getElementById('image-summary-dialog').open&&document.getElementById('image-summary-loading').hidden);
  assert.match(await page.$eval('#image-summary-source-info',element=>element.textContent),/9 筆已完成任務 · 2 次摘要請求/);
  assert.equal(await page.$eval('#image-summary-error',element=>element.textContent),'');
  await page.click('#image-summary-cancel');await browser.close();browser=null;
  calls.length=0;
  const endpoint='/api/image-projects/'+projectId+'/series/'+series.id;
  const candidate=await request(endpoint+'/summary-candidate',{});
  assert.equal(candidate.status,200);assert.deepEqual(candidate.data.candidate.sourceJobIds,completed);
  assert.equal(candidate.data.candidate.usage.requests,2);assert.equal(calls.length,2);
  assert(calls.every(call=>call.size<16000&&call.payload.turns.length<=6));
  assert(calls.every(call=>call.payload.turns.every(turn=>turn.fullPrompt.length<=800)));
  assert.equal(calls[1].payload.project.previousSummary,'專案摘要 1','第二批要接續第一批結果');
  const projectOnly=await request(endpoint+'/apply-summary',{applyProject:true,applySeries:false,projectSummary:candidate.data.candidate.projectSummary,sourceJobIds:candidate.data.candidate.sourceJobIds});
  assert.equal(projectOnly.status,200,'目前對話應可套用同系列其他對話的來源');
  const seriesPending=await request(endpoint+'/summary-candidate',{});
  assert.equal(seriesPending.status,200,'只套用專案摘要後，系列摘要仍應能繼續更新');
  assert.deepEqual(seriesPending.data.candidate.sourceJobIds,completed);
  const applied=await request(endpoint+'/apply-summary',{applyProject:false,applySeries:true,seriesSummary:seriesPending.data.candidate.seriesSummary,sourceJobIds:seriesPending.data.candidate.sourceJobIds});
  assert.equal(applied.status,200);
  const noPending=await request(endpoint+'/summary-candidate',{});assert.equal(noPending.status,400);assert.match(noPending.data.error,/沒有.*新內容/);
});

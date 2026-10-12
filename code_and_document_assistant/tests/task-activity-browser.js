const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createApp}=require('../server.js');
async function main(){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'cda-task-activity-'));let browser,server;
  try{
    const {app}=await createApp({runtime:path.join(root,'state')});server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    browser=await require('puppeteer').launch({executablePath:process.env.CDA_BROWSER||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,userDataDir:path.join(root,'chrome'),args:['--no-sandbox']});
    const page=await browser.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.setViewport({width:1440,height:900});await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
    await page.click('#demo-panel > summary');await page.click('[data-question="比較產品 B 2026 Q1 文件與資料"]');await page.click('#send');
    await page.waitForSelector('#history .task-activity.is-live');const liveStyle=await page.$eval('#history .task-activity.is-live > summary',element=>({background:getComputedStyle(element).backgroundColor,pulse:getComputedStyle(element.querySelector('.task-activity-label')).animationName}));assert.equal(liveStyle.background,'rgb(255, 255, 255)');assert.equal(liveStyle.pulse,'task-activity-text-fade');const id=await page.$eval('#history .task-activity',element=>element.id.slice('task-activity-'.length));
    await page.waitForFunction(()=>document.getElementById('progress').textContent.includes('completed'));
    await page.evaluate(jobId=>{const job=state.taskJobs.get(jobId);job.memoryUpdating=false;job.activitySummary={status:'completed',answer:'**工作摘要**\n\n已整理本次可公開的執行結果。'};job.events=Array.from({length:80},(_,index)=>({message:`公開事件 ${index+1}` }));show(job);},id);
    await new Promise(resolve=>setTimeout(resolve,700));
    await page.click('#task-activity-'+id+' > summary');await page.waitForFunction(jobId=>document.getElementById('task-activity-'+jobId)?.open&&document.getElementById('execution-activity-preview'),{},id);
    assert.equal(await page.$eval('[id^="execution-activity-events-"] > .execution-activity-toggle',element=>element.getAttribute('aria-expanded')),'false');
    await page.$eval('[id^="execution-activity-events-"] > .execution-activity-toggle',element=>element.click());assert.equal(await page.$eval('[id^="execution-activity-events-"] > .execution-activity-toggle',element=>element.getAttribute('aria-expanded')),'true');
    const scroll=await page.$eval('#execution-inspector-content',element=>{const before=element.scrollTop;element.scrollTop=element.scrollHeight;return {before,top:element.scrollTop,clientHeight:element.clientHeight,scrollHeight:element.scrollHeight};});
    await page.$eval('[id^="execution-activity-events-"] > .execution-activity-toggle',element=>element.click());assert.equal(await page.$eval('[id^="execution-activity-events-"] > .execution-activity-toggle',element=>element.getAttribute('aria-expanded')),'false');
    await page.click('#sidebarToggle');await page.waitForFunction(()=>document.querySelector('.layout').classList.contains('sidebar-collapsed'));
    const panes=await page.evaluate(()=>{const main=document.querySelector('main').getBoundingClientRect(),inspector=document.getElementById('execution-inspector').getBoundingClientRect();return {mainRight:main.right,inspectorLeft:inspector.left,inspectorWidth:inspector.width};});
    const polling=await page.evaluate(async jobId=>{
      const base=structuredClone(state.taskJobs.get(jobId)),live={...base,id:'poll-dedup',status:'running',progress:'處理中',activitySummary:{status:'running'}},completed={...live,status:'completed',progress:'已完成',activitySummary:{status:'completed',answer:'工作摘要完成'}};
      const originalFetch=window.fetch;let reads=0;
      window.fetch=async url=>{if(url==='/api/jobs/poll-dedup'){reads++;return new Response(JSON.stringify(completed),{headers:{'Content-Type':'application/json'}});}return originalFetch(url);};
      try{await Promise.all([poll(live),poll(live)]);return {reads,retained:state.polls.has(live.id)};}finally{window.fetch=originalFetch;}
    },id);
    assert.match(await page.$eval('#task-activity-'+id,element=>element.textContent),/已完成/);assert.equal(await page.$eval('#task-activity-'+id+' .task-activity-label',element=>getComputedStyle(element).animationName),'none');assert.match(await page.$eval('#execution-activity-preview',element=>element.textContent),/工作摘要/);assert.ok(scroll.scrollHeight>scroll.clientHeight,'執行詳情應在內容區產生捲動範圍');assert.ok(scroll.top>scroll.before,'執行詳情內容區應可捲動到底部');assert.ok(panes.inspectorWidth>=329,'收合左欄後右欄應保留目前寬度');assert.ok(panes.mainRight<=panes.inspectorLeft+1,'收合左欄後主內容不可與右欄重疊');assert.deepEqual(polling,{reads:1,retained:false});assert.deepEqual(errors,[]);
    console.log('PASS: task activity details, scrolling, panel collapse and deduplicated polling');
  }finally{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});

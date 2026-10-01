const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const assert=require('node:assert/strict');
const {createApp}=require('../server');

async function main(){
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'cda-task-card-'));
  let server,browser,instance;
  try{
    instance=await createApp({runtime:path.join(base,'runtime')});
    server=instance.app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    browser=await require('puppeteer').launch({executablePath:process.env.CDA_BROWSER||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,userDataDir:path.join(base,'chrome-profile'),args:['--no-sandbox','--disable-dev-shm-usage']});
    const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.setViewport({width:1440,height:900});
    await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>state.conversation&&state.imageReady);
    const memoryControl=await page.evaluate(()=>{
      const input=document.getElementById('ai-auto-memory'),label=document.getElementById('auto-memory-label');
      const initial={unchecked:!input.checked,mockHidden:label.hidden};
      document.getElementById('ai-edit-label').hidden=false;
      showConnectionStatus({ai:{model:'test',provider:'test',status:'connected'}},'real');
      const edit=document.getElementById('ai-edit-label').getBoundingClientRect(),auto=label.getBoundingClientRect();
      state.memory={confirmed:[],summary:'目標：測試摘要',summaryVersion:1,updates:[{version:1,status:'ok',reason:'conversation_update',startedAt:'test',estimatedTokens:100,budgetTokens:8000,summary:'目標：測試摘要',usage:[{inputTokens:20,outputTokens:5}]}]};renderMemory();
      const result={...initial,realVisible:!label.hidden,right:auto.left>=edit.right,usage:document.getElementById('memory-update-history').textContent.includes('輸入 20／輸出 5'),version:document.getElementById('memory-status').textContent.includes('v1')};
      showConnectionStatus({ai:{}},'mock');return result;
    });
    assert.deepEqual(memoryControl,{unchecked:true,mockHidden:true,realVisible:true,right:true,usage:true,version:true});
    const view=await page.evaluate(()=>{
      const task={id:'card-check',projectId:state.project,conversationId:state.conversation,question:'請檢查資料並整理重點',status:'running',progress:'搜尋資料中',startedAt:Date.now()-2000,finishedAt:null,archived:false,plan:['搜尋'],tools:[],events:[],iterations:[],evidence:[],ai:{model:'mock',requests:0,usage:[]},result:null};
      show(task);
      const first=document.getElementById('task-more-card-check');
      const running={open:first.open,status:document.querySelector('#task-card-check .task-card-status').textContent};
      const done={...task,status:'completed',progress:'已完成',finishedAt:Date.now(),result:{conclusions:['找到三項重點','第二項補充'],facts:[{text:'原始文件 A',evidenceIds:[]}],inferences:['可能需要後續追蹤'],unknown:['仍待確認日期'],mock:true}};
      show(done);
      const detail=document.getElementById('task-more-card-check');
      return {running,closed:!detail.open,icon:detail.querySelector('summary .fi').className,heading:document.querySelector('#task-card-check .task-card-heading').textContent,visible:document.querySelector('#task-card-check > [id$="-key-conclusion"]').textContent,hidden:!detail.querySelector('[id$="-facts"]').getClientRects().length,retained:detail.textContent.includes('原始文件 A')&&detail.textContent.includes('可能需要後續追蹤')&&detail.textContent.includes('仍待確認日期')};
    });
    assert.equal(view.running.open,false);assert.equal(view.running.status,'執行中');
    assert.equal(view.closed,true);assert.match(view.icon,/angle-small-right/);
    assert.match(view.heading,/已完成.*總經過/);assert.match(view.visible,/找到三項重點/);
    assert.equal(view.hidden,true);assert.equal(view.retained,true);
    const rich=await page.evaluate(()=>{
      const task=state.taskJobs.get('card-check');
      show({...task,result:{...task.result,answer:'完整說明：\n\n- **重點一**：`marker`\n- 重點二\n\n```js\nconst safe = 1;\n```\n\n<script>alert(1)</script>'}});
      const card=document.getElementById('task-card-check'),answer=card.querySelector('.task-rich-answer');
      return {text:answer.textContent,list:answer.querySelectorAll('li').length,code:answer.querySelector('pre code')?.textContent,unsafe:!!answer.querySelector('script'),compact:!!card.querySelector('[id$="-key-conclusion"]'),details:card.querySelector('[id$="-facts"]')?.textContent};
    });
    assert.equal(rich.list,2);assert.equal(rich.code,'const safe = 1;');assert.equal(rich.unsafe,false);assert.equal(rich.compact,false);assert.match(rich.text,/<script>alert\(1\)<\/script>/);assert.match(rich.details,/原始文件 A/);
    const question=await page.evaluate(()=>{
      const source=state.taskJobs.get('card-check');
      show({...source,id:'long-question',question:Array.from({length:40},(_,i)=>`第 ${i+1} 行：<link href="example">`).join('\n')});
      const card=document.getElementById('task-long-question'),preview=card.querySelector('.task-card-question-text');
      const css=getComputedStyle(preview),height=preview.getBoundingClientRect().height,lineHeight=parseFloat(css.lineHeight);
      return {clamp:css.webkitLineClamp,exactHeight:Math.abs(height-lineHeight*5)<1,view:card.querySelector('.task-question-view').textContent,duplicate:!!card.querySelector('[id$="-full-question"]')};
    });
    assert.deepEqual(question,{clamp:'5',exactHeight:true,view:'View',duplicate:false});
    await page.click('#task-question-view-long-question');
    const expanded=await page.$eval('#task-long-question',card=>{
      const question=card.querySelector('.task-card-question'),full=card.querySelector('.task-card-question-text'),button=card.querySelector('.task-question-view');
      return {expanded:question.classList.contains('is-expanded'),scrolls:full.scrollHeight>full.clientHeight,view:button.textContent,lines:full.textContent.split('\n').length,aria:button.getAttribute('aria-expanded'),unsafe:!!full.querySelector('link')};
    });
    assert.deepEqual(expanded,{expanded:true,scrolls:true,view:'Hide',lines:40,aria:'true',unsafe:false});
    await page.evaluate(()=>show(state.taskJobs.get('long-question')));
    assert.equal(await page.$eval('#task-long-question .task-card-question',element=>element.classList.contains('is-expanded')),true,'更新後維持展開狀態');
    await page.click('#task-question-view-long-question');
    assert.equal(await page.$eval('#task-long-question .task-card-question',element=>element.classList.contains('is-expanded')),false);
    await page.$eval('#task-more-card-check > summary',element=>element.click());
    await page.waitForFunction(()=>document.getElementById('task-more-card-check').open);
    assert.match(await page.$eval('#task-more-card-check > summary .fi',element=>element.className),/angle-small-down/);
    await page.evaluate(()=>show(state.taskJobs.get('card-check')));
    assert.equal(await page.$eval('#task-more-card-check',element=>element.open),true,'重新渲染維持手動展開');
    const approval=await page.evaluate(()=>{
      const task={id:'approval-check',projectId:state.project,conversationId:state.conversation,question:'請修改程式',status:'awaiting_approval',progress:'等待確認修改',startedAt:Date.now()-1000,finishedAt:null,archived:false,allowEdits:true,plan:[],tools:[],events:[],iterations:[],evidence:[],result:null};
      state.selectedTask=task.id;show(task);
      const open=document.getElementById('task-more-approval-check').open;
      const workbench=document.getElementById('task-workbench-approval-check').closest('#task-more-approval-check')!==null;
      show({...task,status:'completed',progress:'已完成',finishedAt:Date.now(),result:{conclusions:['已處理'],facts:[],inferences:[],unknown:[]}});
      return {open,workbench,closedAfterCompletion:!document.getElementById('task-more-approval-check').open};
    });
    assert.deepEqual(approval,{open:false,workbench:true,closedAfterCompletion:true});
    const failed=await page.evaluate(()=>{
      const source=state.taskJobs.get('approval-check');
      show({...source,status:'partial',progress:'驗證未通過',result:{conclusions:[],facts:[],inferences:[],unknown:['檢查未通過：語法錯誤']}});
      const card=document.getElementById('task-approval-check');
      return {closed:!card.querySelector('.task-main-details').open,status:card.querySelector('.task-card-status').textContent,attention:card.querySelector('[id$="-key-attention"]')?.textContent};
    });
    assert.equal(failed.closed,true);assert.equal(failed.status,'部分完成');assert.match(failed.attention,/語法錯誤/);
    const edited=await page.evaluate(async()=>{
      $('question').value='';state.questionBaseline='';state.editorBaseline=$('edit-content').value;
      const original=state.taskJobs.get('card-check');await editTask(original);const loaded=$('question').value;cancelEdit.click();const cancelled=$('question').value;
      show({...original,id:'revision-two',taskId:'card-check',revision:2,question:'新版完整需求',versions:[{...original,revision:1}]});
      const card=$('task-card-check');$('task-question-view-revision-two').click();
      return {loaded,cancelled,cards:document.querySelectorAll('#task-card-check').length,old:card.querySelector('.task-question-versions').textContent.includes(original.question),order:[...card.querySelector('.task-heading-actions').children].map(x=>x.textContent),latest:card.querySelector('.task-card-question-text').textContent};
    });
    assert.equal(edited.loaded,'請檢查資料並整理重點');assert.equal(edited.cancelled,'');assert.equal(edited.cards,1);assert.equal(edited.old,true);assert.deepEqual(edited.order,['Edit','Hide']);assert.equal(edited.latest,'新版完整需求');
    const sent=await page.evaluate(async()=>{
      $('question').value='讀取文件並整理來源';await submit({preventDefault(){}});const first=state.taskJobs.get(state.job),cleared=$('question').value;
      await editTask(first);$('question').value='讀取文件並整理新版來源';await submit({preventDefault(){}});
      const latest=state.taskJobs.get(state.job),history=await api('/api/conversations');
      return {cleared,after:$('question').value,revision:latest.revision,previous:latest.versions[0].question,jobs:history.jobs.length,cards:document.querySelectorAll('#task-'+first.id).length};
    });
    assert.deepEqual(sent,{cleared:'',after:'',revision:2,previous:'讀取文件並整理來源',jobs:1,cards:1});
    assert.deepEqual(errors,[]);
    console.log('PASS: task summary, retained details, accordion state, approval and completion defaults');
  }finally{
    if(browser)await browser.close();
    if(server)await new Promise(resolve=>server.close(resolve));
    if(instance)await instance.saved.queue;
    await fs.rm(base,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});

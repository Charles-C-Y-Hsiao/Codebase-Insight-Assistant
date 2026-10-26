const assert=require('node:assert/strict');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');const {createApp}=require('../server');
async function main(){const root=await fs.mkdtemp(path.join(os.tmpdir(),'cda-floating-'));let server,browser;try{
  const instance=await createApp({runtime:path.join(root,'runtime')});server=instance.app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  browser=await require('puppeteer').launch({executablePath:process.env.CDA_BROWSER||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,userDataDir:path.join(root,'chrome'),args:['--no-sandbox']});const page=await browser.newPage();
  const assets=new Map();for(const name of ['diff.min.js','diff2html-ui-slim.min.js','diff2html.min.css'])assets.set(name,await fs.readFile(path.join(__dirname,'../runtime/viewer-test-assets',name)));await page.setRequestInterception(true);page.on('request',request=>{const name=request.url().split('/').pop();if(assets.has(name))request.respond({status:200,contentType:name.endsWith('.css')?'text/css':'application/javascript',body:assets.get(name)});else request.continue();});
  await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>state.conversation&&state.imageReady);
  await page.evaluate(()=>show({id:'floating-check',projectId:state.project,conversationId:state.conversation,question:'更新程式',status:'awaiting_approval',progress:'等待確認修改',startedAt:Date.now(),archived:false,allowEdits:true,plan:[],tools:[],events:[],evidence:[],result:null,proposal:{path:'example.js',before:'const value = 1;\n',after:'const value = 2;\nconst added = true;\n'}}));
  assert.equal(await page.$eval('#task-update-floating',element=>element.hidden),false);assert.match(await page.$eval('#task-update-floating-label',element=>element.textContent),/\+2 行 · −1 行/);assert.equal(await page.$eval('#task-update-floating-action',element=>element.dataset.tooltip),'改程式');assert.ok(await page.$('#task-update-floating-action .fi-br-square-terminal'));assert.equal(await page.$eval('#task-update-floating-body',element=>element.hidden),true,'待確認內容預設收合');assert.equal(await page.$eval('#task-update-floating-collapse',element=>element.getAttribute('aria-expanded')),'false');await page.focus('#task-update-floating-action');assert.equal(await page.$eval('#file-tooltip',element=>element.textContent),'改程式');await page.click('#task-update-floating-label');await page.waitForSelector('#execution-update-preview');
  assert.ok(await page.$('#execution-inspector #execution-update-preview'));assert.ok(await page.$('#task-workbench-floating-check'));assert.ok(await page.$('#diff-view-toolbar-floating-check #apply-edit-floating-check'));
  await page.evaluate(()=>show({id:'floating-files',projectId:state.project,conversationId:state.conversation,question:'建立兩個檔案',status:'awaiting_approval',progress:'等待確認新檔',startedAt:Date.now(),archived:false,allowEdits:true,plan:[],tools:[],events:[],evidence:[],result:null,creations:[{id:'file-one',relativePath:'server.js',purpose:'啟動服務',content:'const express = require("express");',status:'pending'},{id:'file-two',relativePath:'package.json',purpose:'套件設定',content:'{"name":"example"}',status:'pending'}]}));
  assert.equal(await page.$eval('#task-update-floating-body',element=>element.hidden),true,'新增待確認任務不自動展開');
  await page.click('#task-update-floating-collapse');
  assert.equal(await page.$eval('#task-update-floating-task-select',element=>element.options.length),2);
  assert.ok(await page.$('#task-update-floating-preview #floating-new-file-create-file-one'));
  assert.equal(await page.$('#task-update-floating-preview #floating-new-file-create-file-two'),null,'新檔仍須依序確認');
  assert.ok(await page.$('#task-workbench-floating-files #new-file-create-file-one'),'原任務卡的建立按鈕仍保留');
  await page.click('#task-update-floating-collapse');assert.equal(await page.$eval('#task-update-floating-body',element=>element.hidden),true);assert.equal(await page.$eval('#task-update-floating',element=>element.hidden),false);
  await page.click('#task-update-floating-collapse');assert.equal(await page.$eval('#task-update-floating-body',element=>element.hidden),false);
  await page.click('#task-update-floating-collapse');
  await page.evaluate(()=>{const job=state.taskJobs.get('floating-files');show({...job,creations:job.creations.map((item,index)=>index?item:{...item,status:'created'})});});
  assert.equal(await page.$eval('#task-update-floating-body',element=>element.hidden),true,'下一份新檔待確認時維持收合');
  await page.click('#task-update-floating-collapse');
  assert.ok(await page.$('#task-update-floating-preview #floating-new-file-create-file-two'));
  await page.evaluate(()=>{const job=state.taskJobs.get('floating-files');show({...job,status:'completed',archived:true,creations:job.creations.map(item=>({...item,status:'created',content:undefined}))});document.getElementById('task-workbench-preview-floating-files').click();});
  assert.match(await page.$eval('#task-update-floating-preview',element=>element.textContent),/歷史提案內容不重播/);
  console.log('PASS: floating proposal, multiple pending tasks, sequential new-file preview, collapse and archived task reopening');
}finally{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}}
main().catch(error=>{console.error(error);process.exitCode=1;});

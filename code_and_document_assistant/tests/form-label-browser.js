const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createApp}=require('../server');

const controls=new Set(['textbox','searchbox','combobox','spinbutton','checkbox']);
async function assertNamedControls(cdp){
  const tree=await cdp.send('Accessibility.getFullAXTree');
  const raw=tree.nodes.filter(node=>controls.has(node.role?.value)&&!node.name?.value);
  const unnamed=await Promise.all(raw.map(async node=>{
    const detail=await cdp.send('DOM.describeNode',{backendNodeId:node.backendDOMNodeId});
    return node.role.value+' '+detail.node.localName+' '+detail.node.attributes.join(' ');
  }));
  assert.deepEqual(unnamed,[],'未命名控制項：'+JSON.stringify(unnamed));
}

async function main(){
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'cda-form-labels-'));
  let instance,server,browser;
  try{
    const project=path.join(base,'project'),config=path.join(base,'ai.json');await fs.mkdir(project);await fs.writeFile(config,JSON.stringify({imageGenerationModel:'gpt-image-1'}));
    instance=await createApp({runtime:path.join(base,'runtime'),adminToken:'abcdef',aiOptions:{env:{CDA_MODEL_MODE:'real',CDA_AI_CONFIG:config,CDA_AI_MODEL:'gpt-5.6-luna',CDA_AI_KEY:'FAKE'},fetchImpl:async()=>Response.json({data:[{b64_json:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5n8AAAAASUVORK5CYII='}]})}});
    server=instance.app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    browser=await require('puppeteer').launch({executablePath:process.env.CDA_BROWSER||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,userDataDir:path.join(base,'chrome'),args:['--no-sandbox']});
    const page=await browser.newPage(),issues=[],cdp=await page.target().createCDPSession();await cdp.send('Audits.enable');cdp.on('Audits.issueAdded',issue=>issues.push(issue));
    await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>state.conversation&&state.imageReady);assert.equal(await page.$eval('#ai-allow-edits',element=>element.checked),true,'首次載入應預設允許 AI 修改');await assertNamedControls(cdp);
    await page.$eval('#workspace-tools-panel',element=>{element.open=true;});
    await page.click('#verification-rules-panel > summary');assert.deepEqual(await page.$eval('#verification-rules-panel > summary',element=>({display:getComputedStyle(element).display,listStyleType:getComputedStyle(element).listStyleType,iconBasis:getComputedStyle(element.querySelector('.fi')).flexBasis})),{display:'flex',listStyleType:'none',iconBasis:'18px'});await page.click('#open-verification-rules');await page.waitForSelector('#verification-rules-dialog[open]');assert.ok(await page.$eval('#verification-rules-readonly',element=>element.textContent.includes('JavaScript 語法')));await assertNamedControls(cdp);await page.click('#close-verification-rules');
    await page.click('#open-permission');await assertNamedControls(cdp);
    await page.evaluate(directory=>{document.getElementById('folder').value=directory;document.getElementById('admin').value='abcdef';},project);await page.$eval('#request-root',element=>element.click());await page.waitForFunction(()=>document.getElementById('root-status').textContent.includes('待主機'));await page.$eval('#approve-root',element=>element.click());await page.waitForSelector('#open-granted-project:not([hidden])');await page.$eval('#open-granted-project',element=>element.click());await page.waitForFunction(()=>state.imageReady);assert.equal(await page.$eval('#ai-allow-edits',element=>element.checked),true,'切換專案後應維持預設允許 AI 修改');
    await page.type('#question','請製作圖片');await page.click('#send');await page.waitForSelector('#image-create-dialog[open]');await assertNamedControls(cdp);await page.$eval('#image-create-dialog',element=>element.close());
    await page.evaluate(()=>show({id:'form-label-diff',projectId:state.project,conversationId:state.conversation,question:'調整程式',status:'awaiting_approval',progress:'等待確認',startedAt:Date.now(),archived:false,allowEdits:true,plan:[],tools:[],events:[],evidence:[],activitySummary:{status:'completed',answer:'## 工作摘要\n- 已完成差異比較。'},result:null,proposal:{path:'example.js',before:'const before = true;\n',after:'const after = true;\n'}}));
    await page.waitForSelector('#diff-mode-form-label-diff');await assertNamedControls(cdp);
    await page.$eval('#task-activity-form-label-diff',element=>{element.dataset.activityMarker='preserved';if(element.open)element.querySelector('summary').click();});await page.evaluate(()=>document.querySelector('#task-activity-form-label-diff > summary').click());await page.waitForSelector('#execution-activity-preview');assert.equal(await page.$eval('#task-activity-form-label-diff',element=>element.dataset.activityMarker),'preserved','展開目前任務活動時不應重繪整張卡片');await assertNamedControls(cdp);
    for(let index=0;index<12;index++)await page.evaluate(index=>{const job={...state.taskJobs.get('form-label-diff'),progress:'輪詢更新 '+index,events:[{message:'更新執行詳情 '+index}]};show(job);openExecutionActivity(job.id);},index);
    await new Promise(resolve=>setTimeout(resolve,150));await assertNamedControls(cdp);
    assert.deepEqual(issues.filter(issue=>issue.issue.code.includes('FormLabel')),[],'操作流程不應產生未標示欄位 Issue');
    console.log('PASS: initial, permission, image and diff controls have accessible names');
  }finally{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));if(instance)await instance.saved.queue;await fs.rm(base,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});

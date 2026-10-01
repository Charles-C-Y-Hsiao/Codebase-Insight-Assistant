// Offline provider fixture: no real API key, endpoint call, or billing.
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const assert=require('node:assert/strict');
const {click}=require('./browser-controls');
const {createApp}=require('../server.js');
async function main(){
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'cda-ai-browser-'));let server,browser,instance;
  try{
    const folder=path.join(base,'project');await fs.mkdir(folder);const target=path.join(folder,'main.js');await fs.writeFile(target,'const marker=1;');
    const config=path.join(base,'ai.json');await fs.writeFile(config,JSON.stringify({provider:'openai-compatible',protocol:'responses',endpoint:'https://fixture.example/responses',model:'offline-fixture'}));
    const calls=[];const fetchImpl=async(url,options)=>{
      const body=JSON.parse(options.body);calls.push(body);let name,args;
      if(calls.length>3)await new Promise(r=>setTimeout(r,600));
      if(!body.tools)return Response.json({status:'completed',usage:{input_tokens:30,output_tokens:25},output:[{type:'message',content:[{type:'output_text',text:'已將 `marker` 更新為 2。\n\n- 靜態驗證通過。\n- 尚未執行瀏覽器功能測試。'}]}]});
      if(body.tools[0].name==='connection_check'){name='connection_check';args={ok:true};}
      else{
        const input=JSON.parse(body.input[1].content),file=input.files[0];
        if(!body.input.some(m=>m.type==='function_call_output')){name='read_file';args={fileId:file.fileId};}
        else{name='propose_edit';args={fileId:file.fileId,version:file.version,after:input.question.includes('再次')?'const marker=3;':'const marker=2;',summary:'修改 marker'};}
      }
      return Response.json({status:'completed',usage:{input_tokens:100,output_tokens:20},output:[{type:'function_call',name,call_id:'fixture-'+calls.length,arguments:JSON.stringify(args)}]});
    };
    instance=await createApp({runtime:path.join(base,'state'),adminToken:'abcdef',aiOptions:{env:{CDA_MODEL_MODE:'real',CDA_AI_CONFIG:config,CDA_AI_KEY:'FAKE_BROWSER_KEY'},fetchImpl}});
    server=instance.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
    browser=await require('puppeteer').launch({executablePath:process.env.CDA_BROWSER||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,userDataDir:path.join(base,'chrome-profile'),args:['--no-sandbox','--disable-dev-shm-usage']});
    const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:1440,height:1000});
    await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
    assert.match(await page.$eval('#mode-label',e=>e.textContent),/待連線驗證/);
    await page.click('#open-permission');await page.type('#admin','abcdef');await page.click('#ai-test');await page.waitForFunction(()=>document.getElementById('ai-test-status').textContent.includes('成功'));
    assert.equal(calls.length,1);assert.match(await page.$eval('#mode-label',e=>e.textContent),/連線已驗證/);
    await page.type('#folder',folder);await page.click('#allow-write');await page.click('#allow-verify');await page.click('#allow-ai');await page.click('#request-root');await page.waitForFunction(()=>document.getElementById('root-status').textContent.includes('待主機'));await page.click('#approve-root');await page.waitForSelector('#open-granted-project:not([hidden])');await page.click('#open-granted-project');await page.waitForFunction(()=>document.getElementById('files').textContent.includes('main.js'));
    await page.click('#mode-ai-edit');assert.equal(await page.$eval('#ai-allow-edits',e=>e.checked),true);await page.type('#question','請將 marker 改成 2');await page.click('#send');await page.waitForFunction(()=>document.getElementById('progress').textContent.includes('awaiting_approval'));
    assert.equal(await fs.readFile(target,'utf8'),'const marker=1;');assert.match(await page.$eval('#history',e=>e.textContent),/修改任務摘要/);
    const diffId=await page.$eval('#history article .task-diff',e=>e.id);
    assert.equal(await page.$eval('#'+diffId,e=>!!e.closest('main')),true);
    assert.match(await page.$eval('#history article',e=>e.textContent),/輸入 200 tokens · 輸出 40 tokens/);
    assert.equal(await page.$eval('.task-timeline',e=>e.open),true);
    assert.equal(await page.$eval('#history article .task-workbench',e=>!!e.closest('#history article')),true);
    await click(page,'.task-timeline > summary');
    await page.evaluate(()=>show(state.taskJobs.get(state.selectedTask)));
    assert.equal(await page.$eval('.task-timeline',e=>e.open),false,'更新不能覆蓋手動收合');
    await click(page,'#'+diffId+' button[id^="apply-edit-"]');await page.waitForFunction(id=>document.getElementById(id).textContent.includes('passed'),{},diffId);
    assert.equal(await fs.readFile(target,'utf8'),'const marker=2;');assert.equal(calls.length,4);assert.deepEqual(errors,[]);
    assert.match(await page.$eval('#history .task-rich-answer',e=>e.textContent),/靜態驗證通過/);
    assert.match(await page.$eval('#history article',e=>e.textContent),/已套用/);
    assert.match(await page.$eval('#'+diffId,e=>e.textContent),/未執行瀏覽器功能測試/);
    assert.match(await page.$eval('#'+diffId,e=>e.textContent),/--check/);
    const firstTask=await page.$eval('#history article',e=>e.id);
    await page.$eval('#question',e=>{e.value='請再次確認修改';});await page.click('#send');
    await page.waitForFunction(()=>document.querySelectorAll('#history article').length===2);
    const firstId=firstTask.slice(5);
    await page.evaluate(id=>{state.selectedTask=id;show(state.taskJobs.get(id));},firstId);
    await page.$eval('#task-more-'+firstId,e=>{e.open=true;});
    await page.waitForFunction(id=>state.selectedTask===id.slice(5),{},firstTask);
    await page.waitForFunction(()=>[...state.taskJobs.values()].at(-1).status==='awaiting_approval');
    assert.equal(await page.$eval('#inspector-question',e=>e.textContent),'請將 marker 改成 2','執行中更新不能搶走已選任務');
    await page.click('#cancel');await page.waitForFunction(()=>[...state.taskJobs.values()].at(-1).status==='cancelled');
    await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('#history article');
    assert.match(await page.$eval('#history .task-rich-answer',e=>e.textContent),/靜態驗證通過/,'完整完工說明重新載入後仍保留');
    assert.equal(await page.$$eval('.task-timeline',els=>els.every(e=>!e.open)),true,'歷史任務預設收合');
    await page.$eval('#task-more-'+firstId,e=>{e.open=true;});
    await page.$eval('#task-more-'+firstId,e=>e.scrollIntoView({block:'center'}));
    assert.match(await page.$eval('#'+diffId,e=>e.textContent),/--check/,'驗證紀錄可從持久化工具摘要讀回');
    assert.match(await page.$eval('#inspector-duration',e=>e.textContent),/總經過/);
    await page.setViewport({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.equal((await page.$eval('body',e=>e.textContent)).includes('FAKE_BROWSER_KEY'),false);
    console.log('PASS: offline real-mode UI, connection test, AI consent, model proposal, confirmation before write, static verify, no key in page');
  }finally{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));if(instance)await instance.saved.queue;await fs.rm(base,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});

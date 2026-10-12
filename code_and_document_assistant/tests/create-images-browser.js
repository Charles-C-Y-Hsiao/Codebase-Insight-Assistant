const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const assert=require('node:assert/strict');
const {createApp}=require('../server');
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5n8AAAAASUVORK5CYII=';
async function main(){
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'cda-create-images-browser-'));let server,browser,instance,calls=0;
  try{
    const dir=path.join(base,'project');await fs.mkdir(dir);
    instance=await createApp({runtime:path.join(base,'state'),adminToken:'abcdef',aiOptions:{env:{CDA_MODEL_MODE:'real',CDA_AI_MODEL:'gpt-5.6-luna',CDA_AI_KEY:'FAKE'},fetchImpl:async(url,o)=>{
      calls++;const body=JSON.parse(o.body);assert.equal(body.input[1].content[1].type,'input_image');
      return Response.json({status:'completed',output:[{type:'function_call',name:'propose_new_files',call_id:'call',arguments:JSON.stringify({files:[{path:'skip.js',purpose:'可略過',content:'const a=1;'},{path:'invalid.js',purpose:'驗證失敗仍保留',content:'const = ;'},{path:'index.html',purpose:'Cancel 與 Confirm',content:'<!doctype html><html lang="zh-Hant"><head><title>Buttons</title></head><body><button>Cancel</button><button>Confirm</button></body></html>'}]})}],usage:{input_tokens:100,output_tokens:100}});
    }}});
    server=instance.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
    browser=await require('puppeteer').launch({executablePath:process.env.CDA_BROWSER||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
    const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:1440,height:1000});
    await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
    await page.click('#open-permission');await page.type('#folder',dir);await page.type('#admin','abcdef');
    for(const id of ['allow-write','allow-ai','allow-verify'])await page.$eval('#'+id,element=>{if(!element.checked)element.click();});
    await page.click('#request-root');await page.waitForFunction(()=>document.getElementById('root-status').textContent.includes('待主機'));await page.click('#approve-root');await page.waitForSelector('#open-granted-project:not([hidden])');await page.click('#open-granted-project');await page.waitForFunction(()=>state.imageReady);
    await page.$eval('#image-limit',e=>{e.value='20';e.dispatchEvent(new Event('change'));});await page.waitForFunction(()=>state.imageLimitMB===20);
    await page.evaluate(data=>{
      const clipboard=new DataTransfer();clipboard.items.add(new File([Uint8Array.from(atob(data),c=>c.charCodeAt(0))],'buttons.png',{type:'image/png'}));
      document.getElementById('question').dispatchEvent(new ClipboardEvent('paste',{clipboardData:clipboard,bubbles:true,cancelable:true}));
    },png);
    await page.waitForSelector('#image-draft img');assert.equal(calls,0);
    await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('#image-draft img');assert.equal(await page.$eval('#image-limit',e=>e.value),'20');
    await page.waitForFunction(()=>document.querySelector('#image-draft img').naturalWidth===1);
    await page.click('#mode-ai-edit');await page.type('#question','按照圖片建立檔案');await page.click('#send');
    await page.waitForSelector('[id^="new-file-skip-"]');assert.equal(calls,1);assert.deepEqual(await fs.readdir(dir),[]);
    assert.equal(await page.$$eval('[id^="new-file-create-"]',els=>els.length),1);
    assert.equal(await page.$eval('#image-draft',e=>e.childElementCount),0);assert.equal(await page.$$eval('[id^="task-images-"] img',els=>els.length),1);
    // Reload retains pending decisions and images within the same service.
    await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('[id^="new-file-skip-"]');
    await page.$eval('#admin',e=>{e.value='abcdef';});
    const click=async selector=>{try{await page.$eval(selector,e=>e.scrollIntoView({block:'center'}));await page.click(selector);}catch(error){throw new Error(`無法點擊 ${selector}: ${error.message}`);}};
    await click('[id^="new-file-skip-"]');await page.waitForFunction(()=>document.querySelector('.new-file h4').textContent.includes('已略過'));
    await click('[id^="new-file-create-"]');await page.waitForFunction(()=>document.getElementById('diff').textContent.includes('failed'));
    assert.equal(await fs.readFile(path.join(dir,'invalid.js'),'utf8'),'const = ;');
    await click('[id^="new-file-create-"]');await page.waitForFunction(()=>!document.querySelector('[id^="new-file-create-"]'));
    assert.match(await fs.readFile(path.join(dir,'index.html'),'utf8'),/Confirm/);await assert.rejects(fs.access(path.join(dir,'skip.js')));
    assert.equal(calls,1);
    assert.equal(await page.$eval('#task-workbench',e=>getComputedStyle(e).display),'flex');
    assert.equal(await page.$eval('#task-workbench',e=>[...e.querySelectorAll('*')].every(x=>getComputedStyle(x).margin==='0px')),true);
    const timeline=await page.$eval('[id^="timeline-"]',e=>e.textContent);
    assert.match(timeline,/呼叫 gpt-5\.6-luna/);assert.match(timeline,/使用貼入圖片 buttons\.png 作為參考/);
    assert.match(timeline,/提出建立/);assert.match(timeline,/已建立 .*index\.html/);assert.match(timeline,/未執行瀏覽器功能測試/);
    assert.equal(await page.$eval('[id^="task-actions-"]',e=>getComputedStyle(e).display),'flex');
    assert.equal(await page.$$eval('[id^="task-actions-"] [id^="task-view-"]',els=>els.length>=2),true);
    await page.$eval('#task-workbench',e=>e.scrollIntoView({block:'start'}));
    await page.screenshot({path:path.join(os.tmpdir(),'cda-create-images-desktop.png')});
    await page.setViewport({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.deepEqual(errors,[]);console.log('PASS: pasted image/reload/settings/history; sequential skip/create; failed verification retained; flex/mobile; no paid API');
  }finally{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));if(instance)await instance.saved.queue;await fs.rm(base,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});

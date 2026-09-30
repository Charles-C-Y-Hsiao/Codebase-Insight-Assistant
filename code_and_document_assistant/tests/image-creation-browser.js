const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const assert=require('node:assert/strict');
const {createApp}=require('../server');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5n8AAAAASUVORK5CYII=','base64');

async function main(){
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'cda-image-creation-browser-'));
  let server,browser,instance,calls=0;
  try{
    const project=path.join(base,'project'),config=path.join(base,'ai.json');await fs.mkdir(project);
    await fs.writeFile(config,JSON.stringify({imageGenerationModel:'gpt-image-1'}));
    instance=await createApp({runtime:path.join(base,'runtime'),adminToken:'abcdef',aiOptions:{env:{CDA_MODEL_MODE:'real',CDA_AI_CONFIG:config,CDA_AI_MODEL:'gpt-5.6-luna',CDA_AI_KEY:'FAKE'},fetchImpl:async()=>{calls++;return Response.json({data:[{b64_json:png.toString('base64')}]});}}});
    server=instance.app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    browser=await require('puppeteer').launch({executablePath:process.env.CDA_BROWSER||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,userDataDir:path.join(base,'chrome-profile'),args:['--no-sandbox','--disable-dev-shm-usage']});
    const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.setViewport({width:1320,height:900});
    await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
    await page.click('#open-permission');await page.type('#folder',project);await page.type('#admin','abcdef');await page.click('#allow-ai');
    await page.click('#request-root');await page.waitForFunction(()=>document.getElementById('root-status').textContent.includes('待主機'));
    await page.click('#approve-root');await page.waitForSelector('#open-granted-project:not([hidden])');await page.click('#open-granted-project');
    await page.waitForFunction(()=>state.imageReady);
    await page.type('#question','請製作一張 CYE 流程圖圖片');await page.click('#send');
    await page.waitForSelector('#image-create-dialog[open]');assert.equal(calls,0);
    assert.equal(await page.$eval('#image-create-prompt',el=>el.textContent),'請製作一張 CYE 流程圖圖片');
    assert.equal(await page.$eval('#image-create-prompt',el=>getComputedStyle(el).scrollbarWidth),'thin');
    await page.click('#image-create-back');assert.equal(calls,0);
    await page.type('#question','，白底藍紫綠');await page.click('#send');
    await page.waitForSelector('#image-create-dialog[open]');await page.click('#image-create-confirm');
    await page.waitForSelector('.image-task-result img');assert.equal(calls,1);
    await page.waitForFunction(()=>document.querySelector('.image-task-result img')?.naturalWidth===1);
    const edit=await page.$eval('.image-task-actions button',el=>el.id);await page.click('#'+edit);
    await page.type('#question','讓箭頭加粗');await page.click('#send');
    await page.waitForSelector('#image-create-dialog[open]');assert.equal(await page.$eval('#image-create-version',el=>el.textContent),'2');
    await page.click('#image-create-confirm');await page.waitForFunction(()=>document.querySelectorAll('.image-task-result img').length===2);
    assert.equal(calls,2);await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.querySelectorAll('.image-task-result img').length===2);
    assert.deepEqual(errors,[]);console.log('PASS: image confirmation, editable prompt, persisted versions, timeline rendering');
  }finally{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));if(instance)await instance.saved.queue;await fs.rm(base,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});

const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {createApp}=require('../server.js');

async function main(){
  const root=path.join(__dirname,'..','test-run');await fs.mkdir(root,{recursive:true});const base=await fs.mkdtemp(path.join(root,'image-summary-scroll-'));
  let instance,server,browser;
  try{
    instance=await createApp({runtime:path.join(base,'runtime'),imageProjectRoot:path.join(base,'pictures')});
    server=instance.app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    browser=await require('puppeteer').launch({executablePath:process.env.CDA_BROWSER||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,userDataDir:path.join(base,'chrome'),args:['--no-sandbox','--disable-dev-shm-usage']});
    const page=await browser.newPage();await page.setViewport({width:1000,height:600});await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
    await page.evaluate(()=>document.getElementById('image-summary-dialog').showModal());
    const before=await page.evaluate(()=>{const dialog=document.getElementById('image-summary-dialog'),body=document.getElementById('image-summary-scroll');return {heading:dialog.querySelector('.dialog-heading').getBoundingClientRect().top,actions:dialog.querySelector('.dialog-actions').getBoundingClientRect().top,bodyHeight:body.clientHeight,bodyScrollHeight:body.scrollHeight,dialogScrollHeight:dialog.scrollHeight,dialogHeight:dialog.clientHeight};});
    assert.ok(before.bodyScrollHeight>before.bodyHeight,'中間內容必須可捲動');
    const after=await page.evaluate(()=>{const dialog=document.getElementById('image-summary-dialog'),body=document.getElementById('image-summary-scroll');body.scrollTop=body.scrollHeight;return {heading:dialog.querySelector('.dialog-heading').getBoundingClientRect().top,actions:dialog.querySelector('.dialog-actions').getBoundingClientRect().top,scrollTop:body.scrollTop};});
    assert.ok(after.scrollTop>0);assert.equal(after.heading,before.heading);assert.equal(after.actions,before.actions);assert.equal(before.dialogScrollHeight,before.dialogHeight);
    await page.click('#image-summary-close');assert.equal(await page.$eval('#image-summary-dialog',dialog=>dialog.open),false);
    console.log('圖片摘要標題與操作列固定，中間內容獨立捲動：通過');
  }finally{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));if(instance)await instance.saved.queue;await fs.rm(base,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});

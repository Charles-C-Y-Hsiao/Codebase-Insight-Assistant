const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {createApp}=require('../server.js');

async function main(){
  const testRoot=path.join(__dirname,'..','test-run');await fs.mkdir(testRoot,{recursive:true});const base=await fs.mkdtemp(path.join(testRoot,'image-delete-browser-'));
  let browser,server,instance;
  try{
    instance=await createApp({runtime:path.join(base,'runtime'),imageProjectRoot:path.join(base,'pictures')});
    server=instance.app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    browser=await require('puppeteer').launch({executablePath:process.env.CDA_BROWSER||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,userDataDir:path.join(base,'chrome'),args:['--no-sandbox','--disable-dev-shm-usage']});
    const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>state.conversation);
    await page.click('#image-project-toggle');await page.click('#image-project-add');await page.waitForSelector('#sidebar-create-dialog[open]');await page.click('#sidebar-create-confirm');
    await page.waitForFunction(()=>state.imageProjects.length===1);
    const project=await page.evaluate(()=>({id:state.imageProjectId,folderName:state.imageProjects[0].folderName}));
    await page.click('.image-project-actions-toggle');await page.waitForSelector('#image-project-actions-menu:popover-open');
    assert.equal(await page.$eval('#image-project-action-delete i',item=>item.className),'fi fi-rc-trash');
    await page.click('#image-project-action-delete');await page.waitForSelector('#image-project-delete-dialog[open]');
    assert.equal(await page.evaluate(()=>state.imageProjects.length),1,'第一次點擊只開確認視窗');
    await page.waitForFunction(()=>!document.getElementById('image-project-delete-confirm').disabled);
    await page.click('#image-project-delete-confirm');await page.waitForFunction(()=>state.imageProjects.length===0);
    assert.equal(await page.$eval('#image-project-delete-dialog',item=>item.open),false);
    assert.equal((await fs.readdir(path.join(base,'pictures',project.folderName))).includes('.cda'),true);
    assert.deepEqual(errors,[]);
    console.log('圖片專案選單、二次確認與保留磁碟資料夾：通過');
  }finally{
    if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));if(instance)await instance.saved.queue;
    await fs.rm(base,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});

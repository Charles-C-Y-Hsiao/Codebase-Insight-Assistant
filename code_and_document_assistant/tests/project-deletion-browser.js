const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {createApp}=require('../server.js');

async function main(){
  const testRoot=path.join(__dirname,'..','test-run');await fs.mkdir(testRoot,{recursive:true});
  const base=await fs.mkdtemp(path.join(testRoot,'cda-project-delete-browser-'));
  let browser,server,instance;
  try{
    const project=path.join(base,'project'),config=path.join(base,'projects.json');await fs.mkdir(project);await fs.writeFile(path.join(project,'keep.txt'),'keep');await fs.writeFile(config,JSON.stringify({projects:[{path:project,name:'待刪專案'}]}));
    instance=await createApp({runtime:path.join(base,'runtime'),projectConfig:config,aiOptions:{env:{CDA_MODEL_MODE:'mock'}}});
    const root=instance.workspace.roots.find(item=>item.path===project);assert.ok(root);
    server=instance.app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    browser=await require('puppeteer').launch({executablePath:process.env.CDA_BROWSER||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,pipe:true,args:['--no-sandbox']});
    const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>state.conversation&&state.catalog.length>1);
    await page.hover('#project-row-'+root.id);await page.click('#project-item-'+root.id+'-actions');await page.click('#project-delete');
    await page.waitForSelector('#project-delete-dialog[open]');assert.match(await page.$eval('#project-delete-message',element=>element.textContent),/待刪專案/);
    assert.ok(instance.workspace.roots.some(item=>item.id===root.id),'確認前仍保留登錄');
    await page.click('#project-delete-cancel');assert.ok(instance.workspace.roots.some(item=>item.id===root.id),'取消後仍保留登錄');
    await page.hover('#project-row-'+root.id);await page.click('#project-item-'+root.id+'-actions');await page.click('#project-delete');await page.waitForSelector('#project-delete-dialog[open]');await page.click('#project-delete-confirm');
    await page.waitForFunction(id=>!state.catalog.some(item=>item.id===id),{},root.id);
    assert.equal(await fs.readFile(path.join(project,'keep.txt'),'utf8'),'keep');assert.deepEqual(JSON.parse(await fs.readFile(config,'utf8')).projects,[]);
    assert.deepEqual(errors,[]);console.log('PASS: project delete preview, cancel, second confirmation and retained files');
  }finally{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));if(instance)await instance.saved.queue;await fs.rm(base,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});

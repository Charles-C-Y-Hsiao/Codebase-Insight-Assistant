const {createApp}=require('../server.js');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
async function main(){
  const base=require('node:os').tmpdir(),temp=await fs.mkdtemp(path.join(base,'sidebar-test-'));
  let instance,server,browser;
  const start=async()=>{instance=await createApp({runtime:path.join(temp,'state'),adminToken:'abcdef'});server=instance.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));return 'http://127.0.0.1:'+server.address().port;};
  try{
    const folder=path.join(temp,'project-a');await fs.mkdir(folder);await fs.writeFile(path.join(folder,'main.js'),'const projectA = 1;');
    let origin=await start();browser=await require('puppeteer').launch({executablePath:process.env.CDA_BROWSER||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
    const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:1440,height:1000});
    await page.goto(origin,{waitUntil:'networkidle0'});await page.waitForSelector('.project-choice');
    assert.equal(await page.$eval('.project-choice',e=>e.getAttribute('aria-expanded')),'false');assert.equal(await page.$eval('.project-choice .fi',e=>e.className),'fi fi-rc-folder');
    await page.click('#project-section-toggle');assert.equal(await page.$eval('#project-section-toggle i',e=>e.className),'fi fi-br-angle-small-right');await page.click('#project-section-toggle');assert.equal(await page.$eval('#project-section-toggle i',e=>e.className),'fi fi-br-angle-small-down');
    await page.click('#open-permission');await page.type('#folder',folder);await page.$eval('#allow-write',element=>{if(!element.checked)element.click();});await page.$eval('#allow-verify',element=>{if(!element.checked)element.click();});await page.$eval('#grant-minutes',e=>e.value='7');await page.type('#admin','abcdef');await page.click('#request-root');await page.waitForFunction(()=>document.getElementById('root-status').textContent.includes('待主機'));await page.click('#approve-root');await page.waitForSelector('.project-renew');
    const id=instance.workspace.roots.find(r=>r.path===folder).id;
    assert.deepEqual(instance.saved.data.projects.find(p=>p.id===id).grantDefaults,{write:true,verify:true,ai:false,minutes:7});
    await page.click('#open-granted-project');await page.waitForFunction(()=>document.getElementById('files').textContent.includes('main.js'));
    await page.click('.project-item[data-project-id="'+id+'"] .project-choice');await page.waitForSelector('.project-item[data-project-id="'+id+'"] .conversation-new',{visible:true});await new Promise(r=>setTimeout(r,100));
    await page.$eval('.project-item[data-project-id="'+id+'"] .project-row',e=>e.click());await page.waitForFunction(id=>document.querySelector('#conversations-'+id).hidden,{},id);
    await page.click('.project-item[data-project-id="'+id+'"] .project-choice');await page.waitForSelector('.project-item[data-project-id="'+id+'"] .conversation-new',{visible:true});assert.equal(await page.$eval('.project-item[data-project-id="'+id+'"] .project-choice .fi',e=>e.className),'fi fi-rc-folder-open');await page.locator('.project-item[data-project-id="'+id+'"] .conversation-new').click();
    await page.reload({waitUntil:'networkidle0'});assert.equal(await page.$eval('.project-item[data-project-id="'+id+'"] .project-choice',e=>e.getAttribute('aria-expanded')),'true');
    assert.equal(await page.$eval('.project-item[data-project-id="'+id+'"] .project-actions',e=>getComputedStyle(e).opacity),'0');await page.hover('.project-item[data-project-id="'+id+'"] .project-row');await page.waitForFunction(id=>Number(getComputedStyle(document.querySelector('.project-item[data-project-id="'+id+'"] .project-actions')).opacity)>.99,{},id);assert.match(await page.$eval('.project-item[data-project-id="'+id+'"] .project-grant-time',e=>e.textContent),/[56] mins/);
    await page.click('.project-item[data-project-id="'+id+'"] .project-actions');assert.match(await page.$eval('#project-expiry',e=>e.textContent),/[56] mins/);await page.click('#quick-renew');assert.match(await page.$eval('#quick-grant-settings',e=>e.textContent),/7 分鐘.*修改 允許.*靜態驗證 允許/);
    await page.type('#quick-grant-code','000000');await page.click('#quick-grant-confirm');await page.waitForFunction(()=>document.getElementById('quick-grant-status').textContent.includes('管理碼授權'));
    await page.$eval('#quick-grant-code',e=>e.value='abcdef');await page.click('#quick-grant-confirm');await page.waitForFunction(()=>document.getElementById('quick-grant-status').textContent.includes('授權完成'));assert.equal(await page.$eval('#active-project',e=>e.value),id);await page.click('#close-quick-grant');
    // Global read grant includes sibling projects, but does not become a target.
    const sibling=path.join(temp,'project-b');await fs.mkdir(sibling);await fs.writeFile(path.join(sibling,'reference.md'),'global reference marker');
    await page.click('#open-permission');await page.select('#root-kind','global-reference');
    assert.equal(await page.$eval('#allow-write',e=>e.disabled&&!e.checked),true);
    await page.$eval('#folder',(e,value)=>e.value=value,temp);await page.click('#request-root');await page.waitForFunction(()=>document.getElementById('root-status').textContent.includes('待主機'));await page.click('#approve-root');
    await page.waitForFunction(()=>document.getElementById('root-status').textContent.includes('全域唯讀授權完成'));
    await page.waitForFunction(()=>document.getElementById('files').textContent.includes('reference.md'));
    assert.equal(await page.$eval('#active-project',e=>e.value),id);assert.equal(await page.$eval('#open-granted-project',e=>e.hidden),true);
    assert.match(await page.$eval('#reference-chips',e=>e.textContent),/Global:/);
    await page.click('#close-permission');
    const global=instance.workspace.roots.find(r=>r.kind==='global-reference');global.expiresAt=Date.now()+800;
    await page.evaluate(()=>catalog());await page.waitForFunction(()=>!document.getElementById('files').textContent.includes('reference.md'));
    assert.match(await page.$eval('#files',e=>e.textContent),/main.js/);
    // Accelerate a real grant's expiry, then exercise the browser's deadline scheduler.
    instance.workspace.roots.find(p=>p.id===id).expiresAt=Date.now()+800;
    await page.evaluate(()=>catalog());await page.waitForFunction(()=>document.getElementById('index-status').textContent.includes('到期'));
    assert.equal(await page.$eval('#files',e=>e.textContent),'');assert.match(await page.$eval('#project-list',e=>e.textContent),/已到期/);
    await page.screenshot({path:path.join(base,'sidebar-preview.png'),fullPage:true});
    await page.setViewport({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.deepEqual(errors,[]);assert.ok(await page.$eval('link[href*="cdn-uicons.flaticon.com/3.0.0/uicons-regular-chubby"]',e=>!!e));
    await new Promise(r=>server.close(r));server=null;await instance.saved.queue;await start();const p=instance.workspace.roots.find(p=>p.id===id);assert.equal(instance.workspace.active(p),false);assert.equal(p.grantDefaults.minutes,7);assert.equal(p.grantDefaults.write,true);
    console.log('PASS: Flaticon UIcons, collapsed default, saved expansion, per-project chat, grant defaults, quick renewal, bad code rejection, expiry hides files, restart revokes capability but keeps defaults, mobile width');
  }finally{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));if(instance)await instance.saved.queue;if(path.dirname(temp)===base&&path.basename(temp).startsWith('sidebar-test-'))await fs.rm(temp,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});

// A real browser walkthrough; keeps the generated example for manual use.
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {createApp}=require('../server.js');

async function main(){
  const base=require('node:os').tmpdir();
  const run=await fs.mkdtemp(path.join(base,'select2-walkthrough-'));
  const parent=path.join(run,'projects');await fs.mkdir(parent);
  const {app,adminToken}=await createApp({runtime:path.join(run,'assistant')});
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  let browser;
  try{
    browser=await require('puppeteer').launch({executablePath:process.env.CDA_BROWSER||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
    console.log('Chrome started');
    const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.setViewport({width:1440,height:1000});
    await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'networkidle0'});
    await page.waitForSelector('#files input');
    console.log('Assistant loaded');
    await page.click('#open-permission');
    await page.type('#folder',parent);await page.$eval('#allow-write',element=>{if(!element.checked)element.click();});await page.$eval('#allow-verify',element=>{if(!element.checked)element.click();});await page.type('#admin',adminToken);
    await page.click('#request-root');await page.waitForFunction(()=>document.querySelector('#root-status').textContent.includes('待主機'));
    assert.deepEqual(await fs.readdir(parent),[],'授權請求不可寫入');
    await page.click('#approve-root');await page.waitForFunction(()=>document.querySelector('#root-status').textContent.includes('已依請求授權'));
    console.log('Folder approved');
    await page.waitForFunction(()=>document.querySelectorAll('#active-project option').length===2);
    const target=await page.$eval('#active-project',e=>[...e.options].find(o=>o.value!=='demo').value);
    await page.click('#open-granted-project');await page.waitForFunction(()=>document.getElementById('active-project').value===document.querySelector('.project-choice[aria-current="true"]').dataset.projectId&&document.getElementById('index-status').textContent.includes('0 份檔案'));
    assert.equal(await page.$eval('#active-project',e=>e.value),target);
    await page.click('#demo-panel > summary');
    await page.evaluate(()=>document.querySelector('#project-builder').open=true);
    await page.waitForFunction(()=>document.querySelectorAll('#project-root option').length===1);
    assert.deepEqual(await page.$eval('#project-builder-content',element=>({display:getComputedStyle(element).display,direction:getComputedStyle(element).flexDirection,gap:getComputedStyle(element).gap,children:element.children.length})),{display:'flex',direction:'column',gap:'3px',children:8});
    assert.deepEqual(await page.$eval('#project-root',element=>({height:getComputedStyle(element).height,paddingTop:getComputedStyle(element).paddingTop,paddingBottom:getComputedStyle(element).paddingBottom})),{height:'30px',paddingTop:'3px',paddingBottom:'3px'});
    await page.click('#project-propose');await page.waitForSelector('#project-apply');
    console.log('Proposal previewed');
    const project=path.join(parent,'select2_product_picker'),file=path.join(project,'index.html');
    await assert.rejects(fs.access(project),'預覽前不得建立資料夾');
    assert.match(await page.$eval('#project-output',e=>e.textContent),/MOCK/);
    await page.click('#project-apply');await page.waitForSelector('#project-preview');
    console.log('Project created');
    assert.ok((await fs.readFile(file,'utf8')).includes('select2'));
    await page.waitForFunction(()=>document.querySelector('#files').textContent.includes('select2_product_picker'));
    // Open via the user-facing preview link and inspect the actual popup.
    const popup=new Promise(resolve=>page.once('popup',resolve));await page.click('#project-preview');
    const preview=await popup;preview.on('pageerror',e=>errors.push(e.message));
    await preview.waitForSelector('#cdn-status[data-state]',{timeout:45000});
    assert.equal(await preview.$eval('#cdn-status',e=>e.dataset.state),'ready',await preview.$eval('#cdn-status',e=>e.textContent));
    assert.equal(await preview.evaluate(()=>window.jQuery.fn.jquery),'3.7.1');
    await preview.click('.select2-selection');await preview.type('.select2-search__field','標準');
    await preview.waitForFunction(()=>document.querySelectorAll('.select2-results__option[aria-selected]').length===1);
    await preview.click('.select2-results__option[aria-selected]');
    await preview.click('.select2-search__field');await preview.keyboard.down('Control');await preview.keyboard.press('KeyA');await preview.keyboard.up('Control');await preview.keyboard.press('Backspace');await preview.type('.select2-search__field','進階');
    await preview.waitForFunction(()=>document.querySelector('.select2-results__option[aria-selected]')?.textContent.includes('進階'));
    await preview.click('.select2-results__option[aria-selected]');
    assert.match(await preview.$eval('#summary',e=>e.textContent),/已選 2 項.*產品 A.*產品 B/);
    await preview.keyboard.press('Escape');await preview.screenshot({path:path.join(base,'select2-preview.png'),fullPage:true});
    await preview.click('#clear');assert.equal(await preview.$eval('#summary',e=>e.textContent),'尚未選擇產品');
    await preview.click('.select2-selection');await preview.type('.select2-search__field','不存在');
    await preview.waitForFunction(()=>document.querySelector('.select2-results__message')?.textContent.includes('找不到'));
    await preview.keyboard.press('Escape');await preview.setViewport({width:390,height:844});
    assert.equal(await preview.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await preview.screenshot({path:path.join(base,'select2-mobile.png'),fullPage:true});
    // Verify the generated file itself, without the assistant preview route.
    const standalone=await browser.newPage();await standalone.goto(pathToFileURL(file).href,{waitUntil:'networkidle0'});
    assert.equal(await standalone.$eval('#cdn-status',e=>e.dataset.state),'ready');
    // Real network failures are deliberately injected; no fake Select2 implementation.
    const offline=await browser.newPage();await offline.setRequestInterception(true);
    offline.on('request',r=>/^https:\/\/(code\.jquery\.com|cdn\.jsdelivr\.net)\//.test(r.url())?r.abort():r.continue());
    await offline.goto(pathToFileURL(file).href,{waitUntil:'networkidle0'});
    assert.equal(await offline.$eval('#cdn-status',e=>e.dataset.state),'error');
    assert.equal(await offline.$eval('#products',e=>e.disabled),true);
    assert.deepEqual(errors,[]);
    const result={status:'passed',generatedFile:file,checks:['UI 路徑授權','預覽前無磁碟寫入','主機確認建立','自動索引','新分頁隔離預覽','實際 CDN/SRI 載入','搜尋、多選、摘要、清除、查無項目','390px 版面','直接開啟生成檔','CDN 阻斷錯誤顯示'],mode:'固定 Mock 範本；檔案建立與 CDN/瀏覽器操作為實測'};
    await fs.writeFile(path.join(base,'select2-walkthrough-result.json'),JSON.stringify(result,null,2));
    console.log(JSON.stringify(result,null,2));
  }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});

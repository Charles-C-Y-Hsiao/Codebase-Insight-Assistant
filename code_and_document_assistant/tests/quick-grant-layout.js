// Layout-only check using the actual markup/styles; no service or API call.
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
async function main(){
  const publicDir=path.join(__dirname,'../public');
  const html=await fs.readFile(path.join(publicDir,'index.html'),'utf8');
  const dialog=html.match(/<dialog id="quick-grant-dialog"[\s\S]*?<\/dialog>/)[0];
  const css=await Promise.all(['styles.css','sidebar.css'].map(name=>fs.readFile(path.join(publicDir,name),'utf8')));
  const browser=await require('puppeteer').launch({executablePath:process.env.CDA_BROWSER||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try{
    const page=await browser.newPage();
    await page.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css.join('\n')+'</style></head><body>'+dialog+'</body></html>');
    assert.equal(await page.$eval('#quick-grant-dialog',e=>getComputedStyle(e).display),'none');
    for(const width of [1440,390]){
      await page.setViewport({width,height:844});
      await page.$eval('#quick-grant-dialog',e=>{
        e.querySelector('#quick-grant-path').textContent='C:\\Web_Practice\\ReAct\\'+ 'long-project-name-'.repeat(12);
        e.querySelector('#quick-grant-settings').textContent='60 分鐘 · 修改允許 · 靜態驗證允許 · AI 允許。';
        e.showModal();
      });
      const layout=await page.$eval('#quick-grant-dialog',e=>({
        display:getComputedStyle(e).display,direction:getComputedStyle(e).flexDirection,gap:getComputedStyle(e).gap,
        margins:[...e.querySelectorAll('*')].map(x=>getComputedStyle(x).margin),
        labelDisplay:getComputedStyle(e.querySelector('label')).display,labelGap:getComputedStyle(e.querySelector('label')).gap,
        statusHidden:getComputedStyle(e.querySelector('#quick-grant-status')).display==='none',
        fits:e.scrollWidth<=e.clientWidth&&e.getBoundingClientRect().left>=0&&e.getBoundingClientRect().right<=innerWidth
      }));
      assert.equal(layout.display,'flex');assert.equal(layout.direction,'column');assert.equal(layout.gap,'16px');
      assert.ok(layout.margins.every(m=>m==='0px'));assert.equal(layout.labelDisplay,'flex');assert.equal(layout.labelGap,'8px');
      assert.ok(layout.statusHidden);assert.ok(layout.fits);
      await page.$eval('#quick-grant-status',e=>{e.textContent='授權完成';});
      assert.notEqual(await page.$eval('#quick-grant-status',e=>getComputedStyle(e).display),'none');
      await page.$eval('#quick-grant-dialog',e=>{e.querySelector('#quick-grant-status').textContent='';e.close();});
      assert.equal(await page.$eval('#quick-grant-dialog',e=>getComputedStyle(e).display),'none');
    }
    console.log('PASS: quick-grant flex/gap, zero content margins, open/close, status visibility, desktop/mobile long path');
  }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});

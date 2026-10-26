const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createApp}=require('../server');

async function main(){
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'cda-header-reveal-'));let browser,server,instance;
  try{
    instance=await createApp({runtime:path.join(base,'runtime'),aiOptions:{env:{CDA_MODEL_MODE:'mock'}}});
    server=instance.app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    browser=await require('puppeteer').launch({executablePath:process.env.CDA_BROWSER||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,pipe:true,args:['--no-sandbox']});
    const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.setViewport({width:1440,height:900});await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>state.conversation&&state.imageReady);
    const metrics=()=>page.evaluate(()=>({strip:document.getElementById('app-header-shell').getBoundingClientRect().height,top:document.querySelector('.layout').getBoundingClientRect().top,visibility:getComputedStyle(document.getElementById('app-header')).visibility,inert:document.getElementById('app-header').inert,expanded:document.getElementById('app-header-toggle').getAttribute('aria-expanded')}));
    const initial=await metrics();assert.equal(initial.strip,12);assert.equal(initial.top,12);assert.equal(initial.visibility,'hidden');assert.equal(initial.inert,true);assert.equal(initial.expanded,'false');
    await page.mouse.move(300,6);
    await page.waitForFunction(()=>document.getElementById('app-header').getBoundingClientRect().top===0&&document.getElementById('app-header-toggle').getAttribute('aria-expanded')==='true');
    assert.deepEqual(await page.$eval('#app-header-toggle',element=>({top:element.getBoundingClientRect().top,background:getComputedStyle(element).backgroundColor,border:getComputedStyle(element).borderBottomWidth})),{top:0,background:'rgba(0, 0, 0, 0)',border:'0px'},'展開時觸發條堆疊於頁首上方，沒有額外底色與留白');
    assert.equal((await metrics()).top,initial.top,'展開覆蓋工作區，不改變版面位置');assert.equal((await metrics()).inert,false);
    await page.mouse.move(300,35);await new Promise(resolve=>setTimeout(resolve,500));assert.equal((await metrics()).expanded,'true','移到展開內容不觸發離開');
    await page.mouse.move(300,200);await new Promise(resolve=>setTimeout(resolve,150));assert.equal((await metrics()).expanded,'true','離開不立即收合');
    await page.mouse.move(300,35);await new Promise(resolve=>setTimeout(resolve,500));assert.equal((await metrics()).expanded,'true','移回取消收合計時');
    await page.mouse.move(300,200);await page.waitForFunction(()=>document.getElementById('app-header-toggle').getAttribute('aria-expanded')==='false');await page.waitForFunction(()=>getComputedStyle(document.getElementById('app-header')).visibility==='hidden');assert.equal((await metrics()).top,initial.top);
    await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'app-header-toggle');assert.equal((await metrics()).expanded,'true','鍵盤進入自動展開');
    await new Promise(resolve=>setTimeout(resolve,600));assert.equal((await metrics()).expanded,'true','鍵盤焦點停留時不收合');
    await page.keyboard.press('Escape');assert.equal((await metrics()).expanded,'false','可明確按 Escape 收合');
    await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'sidebarToggle','收合內容不攔截後續 Tab');
    await page.setViewport({width:400,height:800,hasTouch:true});
    await page.touchscreen.tap(100,6);await page.waitForFunction(()=>document.getElementById('app-header-toggle').getAttribute('aria-expanded')==='true');
    const mobile=await page.$eval('#app-header',el=>({left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right,width:innerWidth}));assert.equal(mobile.left,0);assert.equal(mobile.right,mobile.width,'窄螢幕頁首仍符合視窗寬度');assert.equal((await metrics()).top,12);
    await page.touchscreen.tap(300,700);await page.waitForFunction(()=>document.getElementById('app-header-toggle').getAttribute('aria-expanded')==='false');
    assert.deepEqual(errors,[]);console.log('PASS: 12px collapsed strip, hover overlay without layout shift, delayed collapse and cancellation, keyboard focus, Escape, touch and narrow viewport');
  }finally{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));if(instance)await instance.saved.queue;await fs.rm(base,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});

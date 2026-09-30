const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const assert=require('node:assert/strict');
const {createApp}=require('../server');
async function main(){
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'cda-viewers-'));let server,browser,instance;
  try{
    instance=await createApp({runtime:path.join(base,'runtime')});server=instance.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
    browser=await require('puppeteer').launch({executablePath:process.env.CDA_BROWSER||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,userDataDir:path.join(base,'chrome'),args:['--no-sandbox','--disable-dev-shm-usage']});
    const page=await browser.newPage();await page.setViewport({width:1280,height:900});const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const cached=new Map();for(const name of ['diff.min.js','diff2html-ui-slim.min.js','diff2html.min.css','github.min.css']){try{cached.set(name,await fs.readFile(path.join(__dirname,'../runtime/viewer-test-assets',name)));}catch{}}
    let imageBody=null;await page.setRequestInterception(true);page.on('request',request=>{const name=request.url().split('/').pop();if(request.url().startsWith('https://cdn.jsdelivr.net/')&&cached.has(name))request.respond({status:200,contentType:name.endsWith('.css')?'text/css':'application/javascript',body:cached.get(name)});else if(imageBody&&/\/(attachments|generated-images)\//.test(request.url()))request.respond({status:200,contentType:'image/png',body:imageBody});else if(request.url().includes('cdn-uicons.flaticon.com'))request.abort();else request.continue();});
    await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>state.conversation&&state.imageReady);
    const original=await page.evaluate(()=>{
      const before=Array.from({length:40},(_,i)=>`const item${i} = ${i};`).join('\n')+'\n',after=before.replace('const item20 = 20;','const item20 = 42;\nconst added = "<script>unsafe</script>";');
      const job={id:'compare',projectId:state.project,conversationId:state.conversation,question:'修改資料',status:'awaiting_approval',progress:'確認',startedAt:Date.now(),plan:[],tools:[],events:[],evidence:[],proposal:{path:'example.js',before,after,mock:true},result:null};state.selectedTask=job.id;show(job);return before;
    });
    await page.waitForSelector('#diff-output-compare .d2h-file-wrapper',{timeout:25000}).catch(async e=>{console.error(await page.$eval('#diff-output-compare',el=>el.textContent.slice(0,400)));throw e;});
    const diff=await page.$eval('#diff-output-compare',e=>({ins:!!e.querySelector('.d2h-ins'),del:!!e.querySelector('.d2h-del'),folds:e.querySelectorAll('.diff-fold-row').length,hidden:e.querySelectorAll('tr[hidden]').length,unsafe:!!e.querySelector('script'),highlight:!!e.querySelector('[class*="hljs-"]')}));
    assert.equal(diff.ins,true);assert.equal(diff.del,true);assert.ok(diff.folds>0);assert.ok(diff.hidden>0);assert.equal(diff.unsafe,false);assert.equal(diff.highlight,true);
    await page.$eval('#diff-details-compare',e=>e.scrollIntoView({block:'center'}));await (await page.$('#diff-details-compare')).screenshot({path:path.join(__dirname,'../runtime/review-diff-preview.png')});
    await page.click('#diff-output-compare .diff-fold-row button');assert.ok(await page.$eval('#diff-output-compare .diff-fold-row button',e=>e.getAttribute('aria-expanded')==='true'));
    await page.select('#diff-mode-compare','side-by-side');await page.waitForSelector('#diff-output-compare .d2h-file-side-diff');
    await page.evaluate(()=>{window.copied='';Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copied=text;}}});});
    await page.evaluate(()=>[...document.querySelectorAll('.diff-view-toolbar button')].find(b=>b.textContent==='複製修改前').click());assert.equal(await page.evaluate(()=>window.copied),original);
    await page.evaluate(()=>{const original=state.taskJobs.get('compare');show({...original,status:'completed'});show({...original,id:'second-comparison',status:'completed'});});
    await page.click('#task-more-compare > summary');await page.click('#task-view-workbench-compare');
    await page.waitForFunction(()=>$('diff-details-compare')?.open&&$('task-workbench').getClientRects().length>0);
    assert.equal(await page.$eval('#task-workbench',e=>e.closest('.task-main-details').id),'task-more-compare');
    await page.click('#task-view-workbench-compare');assert.equal(await page.$eval('#diff-details-compare',e=>e.open),true);
    await page.evaluate(()=>{const source=state.taskJobs.get('compare');show({...source,id:'historical-comparison',proposal:undefined,archived:true,allowEdits:true,tools:[{name:'apply_edit',status:'ok',verification:{status:'passed',message:'歷史靜態驗證通過'}}]});$('task-more-historical-comparison').open=true;$('task-view-workbench-historical-comparison').click();});
    assert.match(await page.$eval('#diff',e=>e.textContent),/未保存修改前後原文/);assert.match(await page.$eval('#diff',e=>e.textContent),/歷史靜態驗證通過/);
    // Broken CDN must preserve both complete source texts.
    const fallback=await page.evaluate(async()=>{const load=loadDiffLibraries;loadDiffLibraries=()=>Promise.reject(new Error('CDN unavailable'));const j={...state.taskJobs.get('compare'),id:'fallback',status:'awaiting_approval'};const view=createDiffViewer(j);document.body.append(view);await new Promise(r=>setTimeout(r,20));const text=view.textContent;view.remove();loadDiffLibraries=load;return text;});assert.match(fallback,/CDN unavailable/);assert.match(fallback,/item39/);
    const png=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=800;canvas.height=500;const ctx=canvas.getContext('2d');ctx.fillStyle='#edf4ff';ctx.fillRect(0,0,800,500);ctx.fillStyle='#265aa0';ctx.fillRect(100,100,600,300);return canvas.toDataURL().split(',')[1];});
    imageBody=Buffer.from(png,'base64');
    await page.evaluate(()=>{
      const template={...state.taskJobs.get('compare'),proposal:undefined,id:'pictures',status:'completed',result:{conclusions:[],facts:[],inferences:[],unknown:[]},attachments:[{id:'img1',name:'第一張',width:800,height:500,size:100},{id:'img2',name:'第二張',width:800,height:500,size:100}]};show(template);show({...template,id:'other-pictures',attachments:[{id:'img3',name:'其他任務',width:800,height:500,size:100}]});
    });
    await page.click('#task-more-pictures > summary');await page.click('#task-images-pictures img');await page.waitForSelector('.pswp');
    await page.waitForFunction(()=>activeImageViewer?.opener.isOpen);
    await page.screenshot({path:path.join(__dirname,'../runtime/review-image-preview.png')});
    assert.equal(await page.evaluate(()=>activeImageViewer.getNumItems()),2);
    const zoom=await page.evaluate(()=>activeImageViewer.currSlide.currZoomLevel);await page.click('.pswp__zoom-controls button:last-child');await new Promise(r=>setTimeout(r,300));assert.ok(await page.evaluate(()=>activeImageViewer.currSlide.currZoomLevel)>zoom);
    await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>activeImageViewer.currIndex===1);await page.keyboard.press('ArrowLeft');await page.waitForFunction(()=>activeImageViewer.currIndex===0);await page.keyboard.press('Escape');await page.waitForFunction(()=>!activeImageViewer);
    await page.evaluate(()=>{state.articles.forEach(article=>article.hidden=true);for(let version=1;version<=2;version++)showImageJob({id:'generated'+version,kind:'image',projectId:state.project,conversationId:state.conversation,question:'圖片',status:'completed',startedAt:Date.now(),imageCreation:{seriesId:'one-series',slug:'流程',version,fileName:'flow-v'+version+'.png',width:800,height:500},result:{unknown:[]}});$('task-generated1').hidden=true;});
    await page.click('#task-generated2 .image-task-result img');await page.waitForFunction(()=>activeImageViewer?.currIndex===1&&activeImageViewer.opener.isOpen).catch(async e=>{console.error(await page.evaluate(()=>({index:activeImageViewer?.currIndex,open:activeImageViewer?.opener.isOpen,notice:$('notice').textContent,errors:!!document.querySelector('.pswp')})));throw e;});assert.equal(await page.evaluate(()=>activeImageViewer.getNumItems()),2);await page.click('.pswp__button--close');await page.waitForFunction(()=>!activeImageViewer);
    assert.deepEqual(errors,[]);console.log('PASS: highlighted diff, folding, side-by-side, exact copy, CDN fallback, task-scoped PhotoSwipe, zoom, keys, close and generated versions');
  }finally{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));if(instance)await instance.saved.queue;await fs.rm(base,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});

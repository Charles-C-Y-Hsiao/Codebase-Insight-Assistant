const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createApp}=require('../server');

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5n8AAAAASUVORK5CYII=','base64');

async function main(){
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'cda-image-source-'));
  let instance,server,browser;const imageCalls=[];
  try{
    instance=await createApp({runtime:path.join(base,'runtime'),imageProjectRoot:path.join(base,'images'),adminToken:'abcdef',aiOptions:{env:{CDA_MODEL_MODE:'real',CDA_AI_MODEL:'gpt-5.6-luna',CDA_AI_KEY:'FAKE'},fetchImpl:async(url,options)=>{
      if(url.endsWith('/responses')){
        const body=JSON.parse(options.body);
        if(body.tools)return Response.json({status:'completed',output:[{type:'function_call',call_id:'call-1',name:'finish_image_discussion',arguments:JSON.stringify({status:'completed',answer:'已整理構圖',steps:[],conclusions:[],facts:[],inferences:[],unknown:[],agentUnderstanding:'舊主題：幾何構圖',discussion:'舊主題討論',prompt:'舊主題候選提示詞：藍綠色幾何構圖'})}],usage:{input_tokens:1,output_tokens:1}});
        const system=body.input?.[0]?.content||'';
        const text=system.includes('圖片對話歷史篩選器')?JSON.stringify({selectedJobIds:[],reason:'無關',reasons:{}}):'專案風格摘要';
        return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text}]}],usage:{input_tokens:1,output_tokens:1}});
      }
      imageCalls.push(url);return Response.json({data:[{b64_json:png.toString('base64')}]});
    }}});
    server=instance.app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    browser=await require('puppeteer').launch({executablePath:process.env.CDA_BROWSER||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,userDataDir:path.join(base,'chrome-profile'),args:['--no-sandbox','--disable-dev-shm-usage']});
    const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>state.conversation&&state.imageProjectGeneration.enabled);
    await page.click('#image-project-add');await page.click('#sidebar-create-confirm');await page.waitForFunction(()=>state.imageProjectId&&state.imageWorkspaceActive);
    await page.type('#question','建立舊主題構圖');await page.click('#send');await page.waitForFunction(()=>[...state.taskJobs.values()].some(job=>job.imageProjectDraft?.status==='completed'));
    await page.type('#question','本次要畫新的流程圖');await page.click('#image-draft-create');await page.waitForSelector('#image-create-dialog[open]');
    assert.equal(await page.$eval('#image-create-draft-select',element=>element.value),'','按鈕不能預選最新候選');
    assert.equal(await page.$eval('#image-create-candidate',element=>element.hidden),true);
    assert.doesNotMatch(await page.$eval('#image-create-full-prompt',element=>element.value),/舊主題候選提示詞/);
    assert.match(await page.$eval('#image-create-full-prompt',element=>element.value),/本次要畫新的流程圖/);
    assert.match(await page.$eval('#image-create-prompt-count',element=>element.textContent),/15000 字/);
    const draftId=await page.$eval('#image-create-draft-select option[value^="draft:"]',element=>element.value);
    await page.select('#image-create-draft-select',draftId);
    assert.match(await page.$eval('#image-create-source-info',element=>element.textContent),/舊主題/);
    assert.doesNotMatch(await page.$eval('#image-create-source-info',element=>element.textContent),/時間不詳/);
    assert.match(await page.$eval('#image-create-full-prompt',element=>element.value),/舊主題候選提示詞/);
    assert.match(await page.$eval('#image-create-full-prompt',element=>element.value),/本次要畫新的流程圖/);
    await page.type('#image-create-admin','abcdef');await page.click('#image-create-confirm');
    await page.waitForFunction(()=>[...state.taskJobs.values()].some(job=>job.imageCreation?.fileName));
    await page.type('#question','改成紫色');await page.click('#image-draft-create');await page.waitForSelector('#image-create-dialog[open]');
    assert.equal(await page.$eval('#image-create-draft-select',element=>element.value),'','已有圖片時仍不預選上一版');
    const previousId=await page.$eval('#image-create-draft-select option[value^="previous:"]',element=>element.value);
    await page.select('#image-create-draft-select',previousId);
    assert.match(await page.$eval('#image-create-source-info',element=>element.textContent),/延續圖片 v1/);
    assert.match(await page.$eval('#image-create-source-mode',element=>element.textContent),/圖片不會傳送/);
    assert.match(await page.$eval('#image-create-full-prompt',element=>element.value),/上一版完整提示詞/);
    assert.match(await page.$eval('#image-create-full-prompt',element=>element.value),/改成紫色/);
    assert.equal(await page.$eval('#image-create-candidate',element=>element.hidden),true,'延續上一版時不得混入候選提示詞');
    await page.evaluate(()=>{state.imageTextOnlyMode=false;document.getElementById('image-create-draft-select').dispatchEvent(new Event('change',{bubbles:true}));});
    assert.match(await page.$eval('#image-create-source-mode',element=>element.textContent),/圖片會作為生圖編輯基礎/);
    assert.match(await page.$eval('#image-create-full-prompt',element=>element.value),/修改優先規則/);
    await page.evaluate(()=>{state.imageTextOnlyMode=true;document.getElementById('image-create-draft-select').dispatchEvent(new Event('change',{bubbles:true}));});
    const priorPrompt=await page.$eval('#image-create-full-prompt',element=>element.value);
    await page.$eval('#image-create-full-prompt',element=>{element.value='字'.repeat(15001);element.dispatchEvent(new Event('input',{bubbles:true}));});
    assert.equal(await page.$eval('#image-create-prompt-count',element=>element.classList.contains('over-limit')),true);
    await page.click('#image-create-confirm');assert.match(await page.$eval('#image-create-error',element=>element.textContent),/15001/);
    await page.$eval('#image-create-full-prompt',(element,value)=>{element.value=value;element.dispatchEvent(new Event('input',{bubbles:true}));},priorPrompt);
    await page.type('#image-create-admin','abcdef');await page.click('#image-create-confirm');
    await page.waitForFunction(()=>[...state.taskJobs.values()].filter(job=>job.imageCreation?.fileName).length===2);
    const versions=await page.evaluate(()=>[...state.taskJobs.values()].filter(job=>job.imageCreation?.fileName).sort((a,b)=>a.imageCreation.version-b.imageCreation.version).map(job=>({id:job.id,previousJobId:job.imageCreation.previousJobId})));
    assert.equal(versions[1].previousJobId,versions[0].id,'文字模式仍須保留明選的上一版關聯');
    assert.deepEqual(imageCalls.map(url=>url.slice(url.lastIndexOf('/'))),['/generations','/generations'],'文字模式只走文字生圖 API');
    console.log('PASS: explicit image prompt source, prior-version continuation and character limit');
  }finally{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));if(instance)await instance.saved.queue;await fs.rm(base,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});

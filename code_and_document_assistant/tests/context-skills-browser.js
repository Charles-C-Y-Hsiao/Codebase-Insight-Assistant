const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const assert=require('node:assert/strict');
const {createApp}=require('../server');

async function main(){
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'cda-context-browser-'));let server,browser,page,instance,stage='setup';const requests=[];
  try{
    const dir=path.join(base,'project');await fs.mkdir(dir);
    instance=await createApp({runtime:path.join(base,'state'),adminToken:'abcdef',aiOptions:{env:{CDA_MODEL_MODE:'real',CDA_AI_MODEL:'test-model',CDA_AI_KEY:'FAKE'},fetchImpl:async(url,o)=>{
      const body=JSON.parse(o.body);requests.push(body);
      return Response.json({status:'completed',output:[{type:'function_call',name:'finish',call_id:'call',arguments:JSON.stringify({status:'needs_input',answer:'誰會使用登入功能？成功條件是什麼？',steps:['釐清需求'],conclusions:['誰會使用登入功能？','成功條件是什麼？'],facts:[],inferences:[],unknown:[]})}],usage:{input_tokens:20,output_tokens:10}});
    }}});
    server=instance.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
    browser=await require('puppeteer').launch({executablePath:process.env.CDA_BROWSER||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
    page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:1280,height:900});
    stage='goto';await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>typeof state!=='undefined'&&state.csrf&&document.querySelector('#project-list .project-item'));
    stage='loaded';
    await page.click('#open-permission');await page.type('#folder',dir);await page.type('#admin','abcdef');await page.click('#allow-ai');
    await page.click('#request-root');await page.waitForFunction(()=>document.getElementById('root-status').textContent.includes('待主機'));await page.click('#approve-root');await page.waitForSelector('#open-granted-project:not([hidden])');await page.click('#open-granted-project');await page.waitForFunction(()=>state.project!=='demo'&&state.imageReady);
    stage='authorized';
    await page.type('#question','建立登入功能');await page.waitForSelector('#start-skill-clarify-requirements');
    stage='suggested';
    assert.equal(requests.length,0,'技能只能建議，不能自動呼叫模型');
    await page.click('#start-skill-clarify-requirements');await page.waitForFunction(()=>document.getElementById('history').textContent.includes('誰會使用登入功能'));
    stage='clarified';
    assert.equal(requests.length,1);assert.deepEqual(requests[0].tools.map(x=>x.name),['finish']);
    await page.click('[id^="task-confirm-requirement-"]');await page.waitForFunction(()=>document.getElementById('memory-status').textContent.includes('1 項已確認'));
    stage='confirmed';
    assert.match(await page.$eval('#memory-summary',e=>e.textContent),/建立登入功能/);
    await page.reload({waitUntil:'networkidle0'});await page.waitForFunction(()=>document.getElementById('memory-status').textContent.includes('1 項已確認'));
    stage='reloaded';
    assert.match(await page.$eval('#confirmed-requirements',e=>e.textContent),/建立登入功能/);
    assert.deepEqual(errors,[]);console.log('PASS: skill suggestion requires start; clarification is read-only; confirmed memory survives reload');
  }catch(e){const diagnostic=page?await page.evaluate(()=>({notice:document.getElementById('notice')?.textContent,question:document.getElementById('question')?.value,skill:document.getElementById('skill-suggestions')?.textContent,hidden:document.getElementById('skill-panel')?.hidden})).catch(()=>null):null;throw new Error('browser stage '+stage+': '+e.message+' '+JSON.stringify(diagnostic),{cause:e});}finally{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));if(instance)await instance.saved.queue;await fs.rm(base,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});

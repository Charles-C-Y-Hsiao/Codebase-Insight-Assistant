const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createApp}=require('../server');

async function main(){
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'cda-image-context-'));
  let instance,server,browser;
  try{
    instance=await createApp({runtime:path.join(base,'runtime'),imageProjectRoot:path.join(base,'images'),adminToken:'abcdef',aiOptions:{env:{CDA_MODEL_MODE:'real',CDA_AI_MODEL:'gpt-5.6-luna',CDA_AI_KEY:'FAKE'},fetchImpl:async(url,options)=>{
      if(!url.endsWith('/responses'))throw Error('Unexpected API: '+url);
      const body=JSON.parse(options.body);
      if(body.tools)return Response.json({status:'completed',output:[{type:'function_call',call_id:'call-1',name:'finish_image_discussion',arguments:JSON.stringify({status:'completed',answer:'已整理',steps:[],conclusions:[],facts:[],inferences:[],unknown:[],agentUnderstanding:'構圖',discussion:'討論',prompt:'流程圖'})}],usage:{input_tokens:1,output_tokens:1}});
      return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'摘要'}]}],usage:{input_tokens:1,output_tokens:1}});
    }}});
    server=instance.app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    browser=await require('puppeteer').launch({executablePath:process.env.CDA_BROWSER||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,userDataDir:path.join(base,'chrome-profile'),args:['--no-sandbox','--disable-dev-shm-usage']});
    const page=await browser.newPage();await page.setViewport({width:1410,height:540});await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>state.conversation&&state.imageProjectGeneration.enabled);
    await page.click('#image-project-add');await page.click('#sidebar-create-confirm');await page.waitForFunction(()=>state.imageProjectId&&state.imageWorkspaceActive);
    await page.type('#question','建立流程圖');await page.click('#send');await page.waitForFunction(()=>[...state.taskJobs.values()].some(job=>job.imageProjectDraft?.status==='completed'));
    await page.type('#question','將流程圖改成藍色');await page.click('#image-draft-create');await page.waitForSelector('#image-create-dialog[open]');
    await page.click('#image-create-tab-context');
    await page.evaluate(()=>{
      window.readContextDropdownPosition=()=>{const instance=window.jQuery('#image-create-context-select').data('select2'),selection=instance.$container.find('.select2-selection')[0].getBoundingClientRect(),dropdown=instance.dropdown.$dropdown[0].getBoundingClientRect(),host=instance.dropdown.$dropdownContainer[0];return {position:host.style.position,left:dropdown.left-selection.left,top:Math.min(Math.abs(dropdown.top-selection.bottom),Math.abs(dropdown.bottom-selection.top)),width:dropdown.width-selection.width,selectionTop:selection.top,dropdownTop:dropdown.top,dropdownHeight:dropdown.height,hostStyle:host.getAttribute('style')};};
      window.contextDropdownPositions=[];
      window.jQuery('#image-create-context-select').on('select2:open.positionTest',()=>{window.contextDropdownPositions.push(window.readContextDropdownPosition());const sample=()=>{window.contextDropdownPositions.push(window.readContextDropdownPosition());if(window.contextDropdownPositions.length<5)requestAnimationFrame(sample);};requestAnimationFrame(sample);});
    });
    await page.click('#image-create-context-select + .select2-container .select2-selection');
    await page.waitForFunction(()=>window.contextDropdownPositions.length===5);
    const positions=await page.evaluate(()=>window.contextDropdownPositions);
    for(const result of positions){
      assert.equal(result.position,'fixed','Dropdown should use viewport coordinates');
      assert.ok(Math.abs(result.left)<=2,'Dropdown should stay horizontally aligned: '+JSON.stringify(positions));
      assert.ok(result.top<=2,'Dropdown should stay next to the selection: '+JSON.stringify(positions));
      assert.ok(Math.abs(result.width)<=2,'Dropdown should match selection width: '+JSON.stringify(positions));
    }
    console.log('PASS: image creation context dropdown stays aligned through opening and subsequent frames');
  }finally{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));if(instance)await instance.saved.queue;await fs.rm(base,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});

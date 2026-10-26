const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {createApp}=require('../server.js');

async function main(){
  const testRoot=path.join(__dirname,'..','test-run');await fs.mkdir(testRoot,{recursive:true});const base=await fs.mkdtemp(path.join(testRoot,'image-history-preview-'));
  let browser,server,instance;
  try{
    instance=await createApp({runtime:path.join(base,'runtime'),imageProjectRoot:path.join(base,'pictures'),aiOptions:{env:{CDA_MODEL_MODE:'real',CDA_AI_MODEL:'gpt-5.6-luna',CDA_AI_KEY:'FAKE'}}});
    server=instance.app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    browser=await require('puppeteer').launch({executablePath:process.env.CDA_BROWSER||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,userDataDir:path.join(base,'chrome'),args:['--no-sandbox','--disable-dev-shm-usage']});
    const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>state.conversation);
    const ids=await page.evaluate(async()=>{
      const project=(await api('/api/image-projects',{id:crypto.randomUUID()})).project;
      const series=(await api('/api/image-projects/'+encodeURIComponent(project.id)+'/series',{name:'預覽系列'})).series;
      await loadImageProjects();state.imageProjectId=project.id;state.imageSeriesId=series.id;setImageWorkspaceActive(true);
      document.getElementById('image-project-memory-summary').click();
      return {projectId:project.id,seriesId:series.id,owner:state.session,conversationId:state.conversation,generalProjectId:state.project};
    });
    const owner=(await page.cookies()).find(item=>item.name==='cda_session').value;
    const conversation=instance.saved.data.conversations.find(item=>item.owner===owner&&item.id===ids.conversationId);
    assert.ok(conversation);
    conversation.jobs.push({id:'candidate-one',status:'completed',question:'第一筆討論',result:{answer:'有藍色構圖',conclusions:[],inferences:[],unknown:[]},imageProjectChat:{projectId:ids.projectId,seriesId:ids.seriesId}});
    await instance.saved.save();
    await page.click('#image-history-preview > summary');
    await page.waitForFunction(()=>document.querySelectorAll('#image-history-preview-select option').length===4);
    assert.equal(await page.$eval('#image-history-preview-select',element=>element.value),'project-summary');
    assert.equal(await page.$eval('#image-history-preview-content',element=>element.textContent),'尚無摘要');
    await page.select('#image-history-preview-select','candidate-candidate-one');
    assert.match(await page.$eval('#image-history-preview-content',element=>element.textContent),/第一筆討論/);
    await page.evaluate(()=>{window.previewSelectBefore=document.getElementById('image-history-preview-select');});
    await page.type('#question','新的需求');
    await page.waitForFunction(()=>document.getElementById('image-history-preview-select')!==window.previewSelectBefore&&document.getElementById('image-history-preview-content')?.textContent.includes('第一筆討論'));
    assert.equal(await page.$eval('#image-history-preview-select',element=>element.value),'candidate-candidate-one');
    assert.equal(await page.$eval('#image-history-preview-content',element=>getComputedStyle(element).maxHeight),'180px');
    assert.deepEqual(errors,[]);
    console.log('圖片歷史預覽 Select2、內容切換與選取保留：通過');
  }finally{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));if(instance)await instance.saved.queue;await fs.rm(base,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});

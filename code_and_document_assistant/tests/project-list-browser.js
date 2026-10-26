const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {createApp}=require('../server');

async function main(){
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'cda-project-list-'));let browser,server,instance;
  try{
    instance=await createApp({runtime:path.join(base,'runtime'),aiOptions:{env:{CDA_MODEL_MODE:'mock'}}});
    server=instance.app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    browser=await require('puppeteer').launch({executablePath:process.env.CDA_BROWSER||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,pipe:true,args:['--no-sandbox']});
    const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.setViewport({width:1440,height:1000});
    const origin='http://127.0.0.1:'+server.address().port;await page.goto(origin,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>state.conversation&&state.imageReady);
    const owner=instance.saved.data.sessions[0].id,day=86400000,start=Date.now()-20*day,date=index=>new Date(start+index*day).toISOString();
    const host=instance.saved.data.conversations.find(conversation=>conversation.owner===owner);assert.ok(host);host.createdAt=date(0);host.updatedAt=date(19);
    const images=Array.from({length:7},(_,index)=>({id:crypto.randomUUID(),name:'Image '+index,folderName:'image-'+index,createdAt:date(0),series:[]}));instance.saved.data.imageProjects.push(...images);
    const job=(id,projectId,conversationId,index)=>({id,taskId:id,owner,projectId,conversationId,question:'Task '+index,status:'completed',archived:true,startedAt:start+index*day,finishedAt:start+index*day,plan:[],tools:[],events:[],evidence:[],result:{conclusions:['done'],facts:[],inferences:[],unknown:[]}});
    for(let index=0;index<7;index++){
      const id='list-project-'+index;instance.workspace.roots.push({id,path:path.join(base,id),label:'Project '+index,kind:'project',expiresAt:1,permissions:{read:false,write:false,verify:false,ai:false}});
      const conversation={id:crypto.randomUUID(),owner,projectId:id,createdAt:date(0),updatedAt:date(index+1),jobs:[]};conversation.jobs.push(job('general-'+index,id,conversation.id,index+1));instance.saved.data.conversations.push(conversation);
      host.jobs.push({...job('image-'+index,host.projectId,host.id,index+1),imageProjectChat:{projectId:images[index].id,seriesId:'series-'+index}});
    }
    await instance.saved.save();
    await page.evaluate(async()=>{await switchProject('list-project-6',{force:true,approved:true});await reloadImageProjects();});
    const generalIds=()=>page.$$eval('#project-list > .project-item',rows=>rows.map(row=>row.dataset.projectId));
    const imageIds=()=>page.$$eval('#image-project-list > .image-project-row .image-project-choice',rows=>rows.map(row=>row.dataset.projectId));
    assert.deepEqual(await generalIds(),[6,5,4,3,2].map(index=>'list-project-'+index));assert.deepEqual(await imageIds(),[6,5,4,3,2].map(index=>images[index].id));
    await page.click('#project-item-list-project-6 .project-choice');assert.equal(await page.$eval('#conversations-list-project-6',element=>element.hidden),false,'原有對話展開仍正常');assert.ok(await page.$('#project-item-list-project-6 .conversation-choice'));assert.ok(await page.$('#project-item-list-project-6-new-conversation'));assert.ok(await page.$('#project-item-list-project-6-actions'));
    await page.click('#project-list-more');assert.equal((await generalIds()).length,8);assert.equal((await imageIds()).length,5,'兩組顯示數量獨立');
    await page.click('#project-list-more');assert.equal((await generalIds()).length,5);
    await page.click('#image-project-toggle');await page.click('#image-project-list-more');assert.equal((await imageIds()).length,7);assert.equal((await generalIds()).length,5);
    await page.click('#image-project-list-more');assert.equal((await imageIds()).length,5);
    await page.evaluate(()=>switchProject('list-project-0',{force:true,approved:true}));assert.equal((await generalIds()).length,8,'選取前五名之外的一般專案會自動展開');assert.equal((await generalIds())[6],'list-project-0','選取不改變時間順序');
    await page.click('#project-list-more');await page.evaluate(()=>renderProjectList());assert.equal((await generalIds()).length,5,'明確收合後背景更新不會自動重開');
    await page.evaluate(id=>{state.imageProjectId=id;state.sidebarSelection={type:'image-project',imageProjectId:id};setImageWorkspaceActive(true);},images[0].id);
    await page.waitForFunction(id=>document.querySelector('#image-project-list .image-project-choice[data-project-id="'+id+'"]'),{},images[0].id);assert.equal((await imageIds()).length,7,'選取較舊圖片專案會自動展開');assert.equal((await imageIds())[6],images[0].id);
    await page.click('#image-project-list-more');await page.evaluate(()=>renderImageProjects());assert.equal((await imageIds()).length,5,'圖片清單也保留明確收合狀態');
    const edited=instance.saved.data.conversations.find(conversation=>conversation.projectId==='list-project-0');await instance.saved.record({...job('general-edit',edited.projectId,edited.id,0),taskId:'general-0',revision:2,startedAt:Date.now(),finishedAt:Date.now()});
    assert.equal(edited.jobs[0].versions.length,1);assert.ok(edited.jobs[0].updatedAt);await page.evaluate(()=>catalog());assert.equal((await generalIds())[0],'list-project-0','Edit 更新專案排序');assert.equal((await imageIds())[0],images[6].id,'一般 Edit 不影響圖片排序');
    await page.evaluate(async()=>{await api('/api/conversations',{},'list-project-1');await catalog();});assert.equal((await generalIds())[0],'list-project-1','新對話也更新專案排序');
    await instance.saved.record({...job('image-edit',host.projectId,host.id,0),taskId:'image-0',revision:2,startedAt:Date.now(),finishedAt:Date.now(),imageProjectChat:{projectId:images[0].id,seriesId:'series-0'}});
    await page.evaluate(async()=>{await reloadImageProjects();await catalog();});assert.equal((await imageIds())[0],images[0].id,'圖片討論更新圖片排序');assert.equal((await generalIds())[0],'list-project-1','圖片更新不會將承載專案推到最上方');
    await page.evaluate(()=>setImageWorkspaceActive(false));await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>state.conversation&&state.imageReady&&state.imageProjects.length===7);assert.equal((await generalIds()).length,5);assert.equal((await imageIds()).length,5);assert.equal((await generalIds())[0],'list-project-1');assert.equal((await imageIds())[0],images[0].id,'重新載入後仍按後端歷史時間排序');
    assert.deepEqual(await page.$eval('#project-row-list-project-1',row=>[...row.children].map(child=>child.className)),['conversation-new','project-choice','project-actions'],'新對話按鈕位於專案圖示與名稱前');
    const conversationCount=instance.saved.data.conversations.length;await page.hover('#project-row-list-project-1');await page.click('#project-item-list-project-1-new-conversation');await page.waitForSelector('#sidebar-create-dialog[open]');assert.equal(instance.saved.data.conversations.length,conversationCount,'確認前不建立對話');await page.click('#sidebar-create-cancel');assert.equal(instance.saved.data.conversations.length,conversationCount,'取消後不建立對話');
    const previousConversation=await page.evaluate(()=>state.conversation);await page.hover('#project-row-list-project-1');await page.click('#project-item-list-project-1-new-conversation');await page.click('#sidebar-create-confirm');await page.waitForFunction(previous=>state.conversation!==previous&&!document.getElementById('sidebar-create-dialog').open,{},previousConversation);assert.equal(instance.saved.data.conversations.length,conversationCount+1,'確認後才建立新對話');
    assert.deepEqual(errors,[]);console.log('PASS: independent latest-five lists, show all/collapse, selected-project reveal without pinning, retained collapse, Edit/new-conversation/image recency, host separation and reload');
  }finally{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));if(instance)await instance.saved.queue;await fs.rm(base,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});

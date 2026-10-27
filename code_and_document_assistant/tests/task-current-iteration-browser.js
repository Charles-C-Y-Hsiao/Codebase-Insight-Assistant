const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createApp}=require('../server');

async function main(){
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'cda-current-iteration-'));let browser,server,instance;
  try{
    instance=await createApp({runtime:path.join(base,'runtime'),aiOptions:{env:{CDA_MODEL_MODE:'mock'}}});
    server=instance.app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    browser=await require('puppeteer').launch({executablePath:process.env.CDA_BROWSER||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,pipe:true,args:['--no-sandbox']});
    const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.setViewport({width:1440,height:900});await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>state.conversation&&state.imageReady);
    await page.evaluate(()=>{
      const startedAt=Date.now()-1000;
      show({id:'current-check',taskId:'current-check',projectId:state.project,conversationId:state.conversation,question:'整理資料並建立文件',status:'running',progress:'AI 規劃與核對 · 第 1 輪',startedAt,archived:false,allowEdits:true,plan:[],events:[{time:new Date(startedAt-1).toISOString(),message:'開始處理需求'}],evidence:[],iterations:[{index:1,startedAt,status:'running',decision:null,action:null,observation:null}],tools:[{name:'ai.request',iterationIndex:1,status:'running',startedAt}],result:null});
    });
    const stages=()=>page.$$eval('#task-current-iteration-current-check .agent-stage-label',els=>els.map(el=>el.textContent));
    assert.deepEqual(await stages(),[],'模型等待中不得預先產生任何 step');
    assert.equal(await page.$$eval('#task-current-iteration-current-check .agent-iteration',els=>els.length),0);
    assert.match(await page.$eval('#task-current-iteration-current-check',el=>el.textContent),/正在取得下一步操作/);
    assert.equal(await page.$('#task-current-check-key-conclusion'),null,'執行中不把進度當成最終結論');
    await page.evaluate(()=>{
      const job=state.taskJobs.get('current-check');show({...job,iterations:[{...job.iterations[0],purpose:'讀取第一份原文',decision:{tool:'read_file'}}]});
    });
    assert.deepEqual(await stages(),['Decide'],'只有實際決策先出現');
    assert.equal(await page.$eval('#task-execution-purpose-current-check',el=>el.textContent),'讀取第一份原文');
    assert.equal(await page.$eval('#task-current-iteration-current-check',el=>el.previousElementSibling.id),'task-execution-purpose-current-check','方向提示位於最新執行區上方');
    assert.equal(await page.$eval('#task-current-iteration-current-check .agent-iteration > summary',el=>el.textContent),'Iteration 1');
    await page.evaluate(()=>{
      const job=state.taskJobs.get('current-check');show({...job,iterations:[{...job.iterations[0],target:'first.js',action:{tool:'read_file',status:'running'}}]});
    });
    assert.deepEqual(await stages(),['Decide','Act'],'工具執行中不顯示 Observe 或 Stop');
    await page.evaluate(()=>{
      const startedAt=Date.now()-1000,iteration={index:1,startedAt,status:'repeat',purpose:'讀取第一份原文',target:'first.js',decision:{tool:'read_file'},action:{tool:'read_file',status:'ok'},observation:'已取得第一份原文',next:'繼續核對'};
      show({...state.taskJobs.get('current-check'),startedAt,iterations:[iteration],tools:[{name:'read_file',iterationIndex:1,status:'ok',path:'first.js',startedAt,result:'已取得第一份原文'}]});
    });
    assert.deepEqual(await stages(),['Decide','Act','Observe','Repeat']);
    assert.equal(await page.$eval('#task-activity-current-check',el=>el.open),true);
    assert.match(await page.$eval('#task-current-iteration-current-check',el=>el.textContent),/Decide.*讀取第一份原文.*Act.*first.js.*Observe/s);
    assert.equal(await page.$eval('#task-activity-current-check > summary',el=>el.textContent.includes('第 1 輪')),false);
    await page.$eval('#task-activity-current-check > summary',el=>el.click());
    await page.evaluate(()=>{
      const job=state.taskJobs.get('current-check'),startedAt=job.startedAt;
      show({...job,iterations:[...job.iterations,{index:2,startedAt,status:'running',decision:null,action:null,observation:null}],tools:[...job.tools,{name:'ai.request',iterationIndex:2,status:'running',startedAt}]});
    });
    assert.equal(await page.$eval('#task-current-iteration-current-check',el=>el.dataset.iterationIndex),'1','下一輪尚無 Decide 時保留上一輪');
    assert.equal(await page.$$eval('#task-current-iteration-current-check > section',els=>els.length),1);
    assert.match(await page.$eval('#task-current-iteration-current-check',el=>el.textContent),/first.js.*正在取得下一步操作/s);
    assert.equal(await page.$eval('#task-execution-purpose-current-check',el=>el.textContent),'讀取第一份原文','等待時保留上一輪方向');
    assert.deepEqual(await stages(),['Decide','Act','Observe','Repeat'],'等待時不產生新的空殼');
    await page.evaluate(()=>{
      const job=state.taskJobs.get('current-check'),startedAt=job.startedAt;
      const iteration={index:2,startedAt,status:'running',purpose:'產生第二份文件',target:'docs/second.md',decision:{tool:'propose_new_files'},action:{tool:'propose_new_files',status:'running'},observation:null};
      show({...job,iterations:[job.iterations[0],iteration],tools:[...job.tools,{name:'propose_new_files',iterationIndex:2,status:'running',startedAt,files:[{path:'docs/second.md',purpose:'功能說明'}]}]});
    });
    assert.equal(await page.$eval('#task-activity-current-check',el=>el.open),false,'手動收合跨輪保留');
    const current=await page.$eval('#task-current-iteration-current-check',el=>({text:el.textContent,count:el.querySelectorAll('.agent-iteration').length,index:el.dataset.iterationIndex}));
    assert.equal(current.count,1);assert.equal(current.index,'2');assert.equal(current.text.includes('first.js'),false);assert.equal(current.text.includes('讀取第一份原文'),false);assert.match(current.text,/docs\/second.md/);
    assert.equal(await page.$$eval('#task-current-iteration-current-check > section',els=>els.length),1,'新 Decide 替換舊 section');
    assert.deepEqual(await page.$$eval('#task-current-iteration-current-check .agent-iteration',els=>els.map(el=>el.open)),[true],'新輪次自動展開');
    assert.equal(await page.$eval('#task-execution-purpose-current-check',el=>el.textContent),'產生第二份文件');
    assert.deepEqual(await page.$$eval('#task-current-iteration-current-check [data-iteration-index="2"] .agent-stage-label',els=>els.map(el=>el.textContent)),['Decide','Act']);
    await page.$eval('#task-current-iteration-current-check .agent-iteration[data-iteration-index="2"] > summary',el=>el.click());
    await page.evaluate(()=>show({...state.taskJobs.get('current-check')}));
    assert.equal(await page.$eval('#task-current-iteration-current-check .agent-iteration[data-iteration-index="2"]',el=>el.open),false,'同輪輪詢保留手動收合');
    await page.$eval('#task-current-iteration-current-check .agent-iteration[data-iteration-index="2"] > summary',el=>el.click());
    assert.equal(await page.$$eval('#timeline-current-check > .agent-iteration',els=>els.length),2,'原時間線保留全部輪次');
    await page.$eval('#task-activity-current-check > summary',el=>el.click());await page.waitForSelector('#execution-activity-preview');
    await page.evaluate(()=>{
      const job=state.taskJobs.get('current-check');show({...job,iterations:job.iterations.map(iteration=>iteration.index===2?{...iteration,purpose:'產生第二份文件，保留全部既有內容並整理這次新增的功能與驗證方式。'.repeat(12)}:iteration)});
    });
    assert.equal(await page.$eval('#task-execution-purpose-current-check',el=>{const style=getComputedStyle(el);return style.whiteSpace==='pre-wrap'&&el.getBoundingClientRect().height>parseFloat(style.lineHeight)*2&&el.scrollWidth<=el.clientWidth;}),true,'方向提示完整換行，不省略或水平溢出');
    await page.evaluate(()=>{
      const job=state.taskJobs.get('current-check');show({...job,iterations:job.iterations.map(iteration=>iteration.index===2?{...iteration,status:'stop',observation:'已提出文件，尚未建立',next:'請逐檔確認建立'}:iteration),status:'awaiting_approval',progress:'等待逐檔確認建立',result:{conclusions:['已提出新檔案'],facts:[],inferences:[],unknown:['尚未寫入']},creations:[{id:'current-file',relativePath:'docs/second.md',purpose:'功能說明',content:'# 功能說明',status:'pending'}]});
    });
    assert.deepEqual(await page.$$eval('#task-current-iteration-current-check .agent-iteration[data-iteration-index="2"] .agent-stage-label',els=>els.map(el=>el.textContent)),['Decide','Act','Observe','Stop']);
    assert.equal(await page.$eval('#task-activity-current-check',el=>el.open),true,'待確認保留展開狀態');assert.match(await page.$eval('#task-activity-current-check',el=>el.textContent),/需要你的確認/);
    await page.$eval('#task-current-confirm-current-check',el=>el.click());assert.equal(await page.$eval('#task-update-floating',el=>el.hidden),false);assert.ok(await page.$('#floating-new-file-create-current-file'));
    await page.evaluate(()=>{
      const job=state.taskJobs.get('current-check');state.detailOpen.set(job.id+':timeline',true);
      show({...job,status:'completed',progress:'檔案處理完成',finishedAt:Date.now(),activitySummary:{status:'completed',answer:'已建立第二份文件，另一份由使用者略過。'},result:{answer:'最終回答：本次文件已處理。',conclusions:['文件處理完成'],facts:[],inferences:[],unknown:[]},creations:[{id:'current-file',relativePath:'docs/second.md',purpose:'功能說明',status:'created',result:{verification:{status:'passed',message:'Markdown 通過'}}},{id:'skipped-file',relativePath:'docs/skipped.md',status:'skipped'}]});
    });
    assert.equal(await page.$eval('#task-activity-current-check',el=>el.open),false,'完成後收合本輪執行區');assert.equal(await page.$eval('#timeline-current-check',el=>el.open),false,'完成後收合完整時間線');
    assert.match(await page.$eval('#task-outcome-completed-current-check',el=>el.textContent),/已建立 docs\/second.md/);assert.match(await page.$eval('#task-outcome-pending-current-check',el=>el.textContent),/已略過，未建立：docs\/skipped.md/);assert.match(await page.$eval('#task-outcome-verification-current-check',el=>el.textContent),/靜態驗證：通過.*瀏覽器功能驗證：未執行/s);
    assert.equal(await page.$eval('#task-current-check',el=>!!(el.querySelector('.task-rich-answer').compareDocumentPosition(el.querySelector('.task-outcome'))&Node.DOCUMENT_POSITION_FOLLOWING)),true,'最終回答位於結果整理之前');
    assert.equal(await page.$eval('#task-current-check',el=>!!(el.querySelector('.task-activity').compareDocumentPosition(el.querySelector('.task-rich-answer'))&Node.DOCUMENT_POSITION_FOLLOWING)),true,'完整修改結果放在執行區下方');
    await page.evaluate(()=>{
      const startedAt=Date.now();
      show({id:'image-discussion-check',projectId:state.project,conversationId:state.conversation,question:'保留流程圖構圖，只調整為藍色系',status:'running',progress:'AI 規劃與核對 · 第 1 輪',startedAt,archived:false,plan:[],events:[],evidence:[],iterations:[{index:1,startedAt,status:'running',decision:null}],tools:[{name:'ai.request',iterationIndex:1,status:'running',startedAt}],result:null,imageProjectChat:{projectId:'image-project-check',seriesId:'image-series-check'},imageProjectDraft:{status:'pending'}});
    });
    assert.equal(await page.$eval('#task-activity-image-discussion-check',el=>el.open),true,'圖片討論執行中展開活動區');
    assert.equal(await page.$$eval('#task-current-iteration-image-discussion-check .agent-stage',els=>els.length),0,'等待圖片討論模型時不預填步驟');
    assert.match(await page.$eval('#task-current-iteration-image-discussion-check',el=>el.textContent),/正在取得下一步操作/);
    await page.evaluate(()=>{
      const job=state.taskJobs.get('image-discussion-check'),iteration={...job.iterations[0],purpose:'核對本次構圖與系列需求',target:'系列構圖資料',decision:{tool:'read_file'},action:{tool:'read_file',status:'ok'},observation:'已取得系列構圖資料',status:'repeat',next:'整理圖片候選提示詞'};
      show({...job,iterations:[iteration],tools:[{name:'read_file',iterationIndex:1,status:'ok',startedAt:iteration.startedAt,path:'layout.md',result:'已取得系列構圖資料'}]});
    });
    assert.equal(await page.$eval('#task-execution-purpose-image-discussion-check',el=>el.textContent),'核對本次構圖與系列需求');
    assert.equal(await page.$eval('#task-current-iteration-image-discussion-check',el=>el.previousElementSibling.id),'task-execution-purpose-image-discussion-check');
    assert.deepEqual(await page.$$eval('#task-current-iteration-image-discussion-check .agent-stage-label',els=>els.map(el=>el.textContent)),['Decide','Act','Observe','Repeat']);
    await page.$eval('#task-current-iteration-image-discussion-check .agent-stage > summary',el=>el.click());
    assert.equal(await page.$eval('#task-current-iteration-image-discussion-check .agent-stage',el=>el.open),true,'圖片討論可展開步驟細節');
    assert.match(await page.$eval('#task-current-iteration-image-discussion-check .agent-stage-full',el=>el.textContent),/核對本次構圖/);
    await page.evaluate(()=>{const job=state.taskJobs.get('image-discussion-check');show({...job,iterations:[...job.iterations,{index:2,startedAt:Date.now(),status:'running',decision:null}]});});
    assert.equal(await page.$eval('#task-current-iteration-image-discussion-check',el=>el.dataset.iterationIndex),'1','下一輪沒有實際方向前保留上一輪');
    assert.match(await page.$eval('#task-current-iteration-image-discussion-check',el=>el.textContent),/正在取得下一步操作/);
    await page.evaluate(()=>{
      const job=state.taskJobs.get('image-discussion-check'),iteration={...job.iterations[1],purpose:'整理藍色系流程圖的候選提示詞',target:'本輪圖片討論',decision:{tool:'finish_image_discussion'},action:{tool:'finish_image_discussion',status:'ok'},observation:'候選提示詞已整理',status:'stop',next:'完成圖片討論'};
      show({...job,iterations:[job.iterations[0],iteration]});
    });
    assert.equal(await page.$$eval('#task-current-iteration-image-discussion-check > section',els=>els.length),1,'圖片討論只顯示最新執行方向');
    assert.equal(await page.$eval('#task-current-iteration-image-discussion-check',el=>el.dataset.iterationIndex),'2');
    assert.match(await page.$eval('#task-execution-purpose-image-discussion-check',el=>el.textContent),/整理藍色系流程圖/);
    assert.deepEqual(await page.$$eval('#task-current-iteration-image-discussion-check .agent-stage-label',els=>els.map(el=>el.textContent)),['Decide','Act','Observe','Stop']);
    assert.equal(await page.$$eval('#timeline-image-discussion-check .agent-iteration',els=>els.length),2,'完整 timeline 保留圖片討論的所有輪次');
    await page.evaluate(()=>{
      const job=state.taskJobs.get('image-discussion-check');
      show({...job,status:'completed',progress:'圖片討論完成',finishedAt:Date.now(),result:{answer:'已保留流程圖構圖，整理藍色系配色。',conclusions:['已完成圖片討論'],facts:[],inferences:[],unknown:[]},imageProjectDraft:{status:'completed',agentUnderstanding:'保留構圖並改用藍色系',discussion:'系列構圖不變',prompt:'藍色系流程圖候選提示詞'}});
    });
    assert.equal(await page.$eval('#task-activity-image-discussion-check',el=>el.open),false,'圖片討論完成後自動收合');
    assert.match(await page.$eval('#task-image-discussion-check .task-rich-answer',el=>el.textContent),/已保留流程圖構圖/);
    assert.match(await page.$eval('#image-project-draft-image-discussion-check',el=>el.textContent),/保留構圖並改用藍色系.*系列構圖不變/s,'原候選提示詞資訊仍顯示');
    assert.equal(await page.$eval('#task-image-discussion-check',el=>!!(el.querySelector('.task-activity').compareDocumentPosition(el.querySelector('.task-rich-answer'))&Node.DOCUMENT_POSITION_FOLLOWING)),true,'圖片討論結果在執行區下方');
    assert.equal(await page.evaluate(()=>{const activity=renderTaskActivity({...state.taskJobs.get('current-check'),id:'image-generation-unchanged',kind:'image'});return !!activity.querySelector('.task-current-iteration');}),false,'圖片生成不套用文字討論步驟');
    assert.deepEqual(errors,[]);console.log('PASS: latest iteration, progressive stages, retained direction while waiting, expandable image discussion, final collapse, preserved discussion/draft, full timeline and unchanged image generation');
  }finally{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));if(instance)await instance.saved.queue;await fs.rm(base,{recursive:true,force:true});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});

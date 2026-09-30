const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function timelineRows(job){
  const source=fs.readFileSync(path.join(__dirname,'../public/task-timeline.js'),'utf8');
  const context={setInterval(){},state:{},console};
  vm.createContext(context);vm.runInContext(source,context);
  return context.timelineRows(job);
}

test('時間線以模型、附件、檔案操作與驗證結果為主，不顯示模型原文',()=>{
  const job={
    id:'job-1',status:'completed',startedAt:1000,finishedAt:9000,
    ai:{model:'gpt-5.6-luna'},attachments:[{name:'image.png',mime:'image/png',size:10}],
    events:[{time:'2026-01-01T00:00:00Z',message:'開始處理需求'},{time:'2026-01-01T00:00:01Z',message:'AI 規劃與核對 · 第 1 輪'},{time:'2026-01-01T00:00:02Z',message:'等待逐檔確認建立'}],
    creations:[{relativePath:'index.html',purpose:'Cancel、Confirm 按鈕',result:{path:'C:\\Web_Practice\\ReAct\\message\\index.html'}}],
    tools:[
      {name:'ai.request',status:'ok',startedAt:1100,elapsedMs:200},
      {name:'propose_new_files',status:'ok',startedAt:1300,elapsedMs:2},
      {name:'create_file',file:'index.html',status:'ok',startedAt:8000,elapsedMs:5,verification:{status:'passed',kind:'HTML 基本結構',message:'檢查通過'}}
    ]
  };
  const labels=timelineRows(job).map(row=>row.text);
  assert(labels.some(text=>text.includes('呼叫 gpt-5.6-luna')));
  assert(labels.includes('使用貼入圖片 image.png 作為參考'));
  assert(labels.some(text=>text.includes('提出建立 index.html（Cancel、Confirm 按鈕）')));
  assert(labels.some(text=>text.includes('已建立 message\\index.html')));
  assert(labels.some(text=>text.includes('HTML 基本結構通過')));
  assert(labels.includes('未執行瀏覽器功能測試'));
  assert.equal(labels.some(text=>text.includes('AI 規劃與核對')),false);
});

test('Agent Loop 迭代資料可保存並以 Decide、Act、Observe、Repeat 呈現',()=>{
  const app=fs.readFileSync(path.join(__dirname,'../src/app-state.js'),'utf8');
  const timeline=fs.readFileSync(path.join(__dirname,'../public/task-timeline.js'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'../public/styles.css'),'utf8');
  assert.match(app,/iterations:job\.iterations/);
  assert.match(timeline,/function renderAgentIterations\(job,panel\)/);
  assert.match(timeline,/Decide ·/);assert.match(timeline,/Act ·/);assert.match(timeline,/Observe ·/);assert.match(timeline,/Repeat/);
  assert.match(css,/\.agent-iteration\s*\{[\s\S]*?border:1px solid/);
  assert.match(css,/\.agent-stage\s*\{[\s\S]*?display:flex[\s\S]*?align-items:center/);
});

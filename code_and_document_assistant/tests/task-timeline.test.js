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
  assert.match(timeline,/'decide','ai','Decide'/);assert.match(timeline,/'act','edit','Act'/);assert.match(timeline,/'observe','read','Observe'/);assert.match(timeline,/Repeat/);
  assert.match(css,/\.agent-iteration\s*\{[\s\S]*?border:1px solid/);
  assert.match(css,/\.agent-stage\s*\{[\s\S]*?display:grid[\s\S]*?align-items:center/);
});

function timelineContext(){const context={setInterval(){},state:{},console};vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/task-timeline.js'),'utf8'),context);return context;}
test('本輪資料使用輪次連結，時間相同仍排除前輪與額外摘要請求',()=>{
  const context=timelineContext(),job={iterations:[{index:1,startedAt:1000,purpose:'讀取檔案'},{index:2,startedAt:1000,purpose:'修改檔案'}],tools:[{name:'read_file',iterationIndex:1,startedAt:1000,status:'ok',path:'first.js'},{name:'propose_edit',iterationIndex:2,startedAt:1000,status:'ok',path:'second.js',verification:{status:'passed',message:'第二輪預檢'}},{name:'ai.activity_summary',startedAt:1100,status:'ok'},{name:'ai.request',iterationIndex:2,startedAt:1000,status:'ok'}]};
  const entries=context.taskExecutionEntries(job),rows=entries.find(entry=>entry.iteration?.index===2).rows;assert.equal(rows.length,3);assert.equal(rows.some(row=>row.text.includes('first.js')),false);assert(rows.some(row=>row.text.includes('second.js')));assert(rows.some(row=>row.verification?.message==='第二輪預檢'));assert.equal(rows.some(row=>row.tool?.name==='ai.activity_summary'),false);assert.equal(entries.filter(entry=>entry.iteration).length,2);assert(entries.some(entry=>entry.row?.tool?.name==='ai.activity_summary'));
});
test('舊紀錄按輪次時間區間分配，輪次以外事件依序保留',()=>{
  const entries=timelineContext().taskExecutionEntries({iterations:[{index:1,startedAt:1000,purpose:'讀取舊檔'},{index:2,startedAt:2000,purpose:'讀取新檔'}],events:[{time:new Date(500).toISOString(),message:'開始處理需求'}],tools:[{name:'read_file',startedAt:1100,path:'old.js'},{name:'read_file',startedAt:2100,path:'new.js'}]});assert.equal(entries[0].row.text,'開始處理需求');assert.equal(entries[1].rows.length,1);assert.match(entries[1].rows[0].text,/old.js/);assert.equal(entries[2].rows.length,1);assert.match(entries[2].rows[0].text,/new.js/);
});

test('模型尚未回傳時保留實際請求列，不建立空的 Iteration',()=>{
  const entries=timelineContext().taskExecutionEntries({iterations:[{index:1,startedAt:1000,status:'running',decision:null,action:null,observation:null}],tools:[{name:'ai.request',iterationIndex:1,startedAt:1000,status:'running'}]});assert.equal(entries.length,1);assert.equal(entries[0].iteration,undefined);assert.equal(entries[0].row.tool.name,'ai.request');
});
test('完成結果區分已建立、已略過與實際驗證，不把預檢當成寫入成功',()=>{
  const context=timelineContext(),outcome=context.taskOutcome({status:'completed',creations:[{relativePath:'docs/created.md',status:'created',result:{verification:{status:'passed',message:'Markdown 檢查通過'}}},{relativePath:'docs/skipped.md',status:'skipped'}],tools:[],result:{conclusions:['完成建立流程'],unknown:['docs/created.md：Markdown 檢查通過']}});
  assert(outcome.completed.some(text=>text.includes('docs/created.md')));assert.equal(outcome.completed.some(text=>text.includes('skipped.md')),false);assert(outcome.pending.some(text=>text.includes('已略過，未建立')));assert.equal(outcome.pending.some(text=>text.includes('Markdown 檢查通過')),false);assert(outcome.verification.some(text=>text.includes('靜態驗證：通過')));assert(outcome.verification.includes('瀏覽器功能驗證：未執行。'));
  const failed=context.taskOutcome({status:'partial',proposal:{path:'app.js'},tools:[{name:'propose_edit',status:'ok',verification:{status:'passed',message:'預檢通過'}}],result:{unknown:['尚未套用']}});assert(failed.pending.some(text=>text.includes('修改提案尚未套用')));assert(failed.verification.some(text=>text.includes('候選修改預檢：通過')));assert.equal(context.taskOutcome({status:'running'}),null);assert.equal(context.taskOutcome({status:'completed',imageProjectChat:{}}),null);
});

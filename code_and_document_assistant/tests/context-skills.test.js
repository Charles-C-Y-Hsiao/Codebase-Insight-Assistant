const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {AppState}=require('../src/app-state.js');
const skills=require('../src/skills.js');

const job=(id,question,conclusion='完成')=>({
  id,owner:'owner',projectId:'project',conversationId:'conversation',referenceProjectIds:[],question,status:'completed',progress:'完成',plan:[],events:[],tools:[],evidence:[],result:{conclusions:[conclusion],facts:[],inferences:[],unknown:[]},startedAt:1,finishedAt:2
});

test('完整原始紀錄保留，長對話建立摘要並只取最近與相關舊內容',async t=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'cda-memory-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));
  const state=await new AppState(base).init(),c=state.conversation('owner','project');c.id='conversation';
  for(let i=0;i<8;i++)await state.record(job('job-'+i,i===1?'討論登入逾時需求':'一般需求 '+i,'結論 '+i));
  const context=state.context(c,'登入逾時怎麼處理');
  assert.equal(c.jobs.length,8);assert.equal(context.recent.length,4);assert.equal(context.retrieved.length,1);
  assert.match(context.retrieved[0].question,/登入逾時/);assert.match(context.summary,/較早對話摘要/);
  const disk=JSON.parse(await fs.readFile(state.file,'utf8')),saved=disk.conversations[0];assert.equal(saved.jobs[1].question,'討論登入逾時需求');
});

test('確認需求更新摘要；變更語句先要求確認再保留取代關係',async t=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'cda-confirm-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));
  const state=await new AppState(base).init(),c=state.conversation('owner','project');c.id='conversation';
  await state.record(job('one','建立兩個按鈕'));await state.record(job('two','改成三個按鈕'));
  const first=state.confirmRequirement('owner','project','conversation','one');assert.match(first.memory.summary,/建立兩個按鈕/);
  const pending=state.confirmRequirement('owner','project','conversation','two');assert.equal(pending.requiresReplacementConfirmation,true);
  const second=state.confirmRequirement('owner','project','conversation','two',{replace:true});
  assert.equal(second.memory.confirmed.find(x=>x.sourceJobId==='one').status,'superseded');
  assert.deepEqual(second.confirmed.replaces,[first.confirmed.id]);assert.match(second.memory.summary,/改成三個按鈕/);
});

test('技能建議不自動執行且技能工具維持唯讀',()=>{
  const suggested=skills.suggest('幫我實作並測試新的登入功能');
  assert.ok(suggested.some(x=>x.id==='plan-task'));assert.ok(suggested.some(x=>x.id==='verify-result'));
  assert.equal(suggested.some(x=>'prompt' in x||'tools' in x),false);
  for(const skill of Object.values(skills.catalog))assert.equal(skill.tools.some(x=>x.startsWith('propose_')),false);
});

const test=require('node:test');
const assert=require('node:assert/strict');
const {imagePromptLineage}=require('../src/image-prompt-lineage.js');
const {composeImagePrompt}=require('../src/image-prompt-composition.js');

function version(id,number,prompt,previousJobId=null,currentRequest=''){return {id,kind:'image',status:'completed',question:currentRequest,imageCreation:{imageProject:{id:'project'},seriesId:'series',version:number,fileName:`v${number}.png`,previousJobId,prompt,currentRequest}};}

test('只追溯所選版本祖先鏈，精確移除內嵌父版原文並保留原始來源',()=>{
  const root=version('v1',1,'初版構圖',null,'建立構圖');
  const sibling=version('v2',2,'另一分支',root.id,'改成紅色');
  const child=version('v3',3,'延續規則\n初版構圖\n只改藍色\n初版構圖',root.id,'只改藍色');
  const chain=imagePromptLineage([root,sibling,child],'project','series',child.id);
  assert.deepEqual(chain.map(item=>item.jobId),['v1','v3']);
  assert.equal(chain[1].originalPrompt,child.imageCreation.prompt);
  assert.equal(chain[1].uniquePrompt,'延續規則\n\n只改藍色');
  assert.equal(chain[1].inheritedExact,true);
});

test('缺失父版與循環會明確拒絕',()=>{
  assert.throws(()=>imagePromptLineage([version('v2',2,'內容','missing')],'project','series','v2'),/缺少/);
  assert.throws(()=>imagePromptLineage([version('v1',1,'內容','v1')],'project','series','v1'),/循環/);
});

test('分批整合送入完整來源並保存每批輸入、輸出及用量',async()=>{
  const root=version('v1',1,'初版構圖'.repeat(5000),null,'建立構圖');
  const child=version('v3',3,root.imageCreation.prompt+'\n只改藍色',root.id,'只改藍色');
  const trace={},calls=[],model={config:{overallTimeoutMs:1000},async composeImagePrompt(input){calls.push(input);return {prompt:'保留初版構圖，只改藍色',decisions:['採用 v3'],conflicts:[],unverified:[],usage:{inputTokens:5,outputTokens:3}};}};
  const result=await composeImagePrompt({jobs:[root,child],project:{id:'project',memory:{summary:'專案色彩規則',version:2}},series:{id:'series',memory:{summary:'系列構圖規則',version:3}},previousJobId:'v3',currentRequest:'只調整色彩',model,checkPermission:()=>{},trace});
  assert(calls.length>1);
  assert.equal(result.prompt,'保留初版構圖，只改藍色');
  assert.equal(trace.chain[0].originalPrompt,root.imageCreation.prompt);
  assert.equal(trace.chain[1].uniquePrompt,'只改藍色');
  assert.equal(trace.batches.length,calls.length);
  assert.equal(trace.batches.every(item=>item.status==='completed'),true);
  assert.equal(result.usage.requests,calls.length);
  assert.equal(calls.at(-1).parts.at(-1).type,'current-request');
});

test('超過生圖上限只再壓縮一次，壓縮前後都留在紀錄',async()=>{
  const root=version('v1',1,'原始構圖',null,'初版');
  const trace={},model={config:{overallTimeoutMs:1000},async composeImagePrompt(input){return {prompt:input.batch==='compression'?'精簡後的完整構圖':'甲'.repeat(15100),decisions:[],conflicts:[],unverified:[],usage:{inputTokens:1,outputTokens:1}};}};
  const result=await composeImagePrompt({jobs:[root],project:{id:'project',memory:{summary:'',version:0}},series:{id:'series',memory:{summary:'',version:0}},previousJobId:'v1',currentRequest:'保留構圖',model,checkPermission:()=>{},trace});
  assert.equal(result.prompt,'精簡後的完整構圖');
  assert.equal(trace.batches.length,2);
  assert.equal(trace.batches[0].result.prompt.length,15100);
  assert.equal(trace.batches[1].index,'compression');
});

const fs=require('node:fs/promises');
const path=require('node:path');
const {performance}=require('node:perf_hooks');
const {Workspace}=require('../src/workspace.js');
const {rank}=require('./baseline.js');
const dataset=require('./cases.json');
const limits=require('../config/example.json').limits;
async function main(){
  const parent=path.resolve(__dirname,'../runtime');await fs.mkdir(parent,{recursive:true});
  const root=await fs.mkdtemp(path.join(parent,'evaluation-'));
  try {
    const docs=path.join(root,'corpus');await fs.mkdir(docs);
    for(const d of dataset.documents)await fs.writeFile(path.join(docs,d.name),d.text);
    const ws=new Workspace(path.join(root,'state'),limits);await ws.init(path.resolve(__dirname,'../examples'),[path.resolve(__dirname,'../docs/example_data')]);await ws.authorize(docs);
    // Use only the fixed evaluation corpus, never company files or mutable demo.
    ws.files=ws.files.filter(f=>f.rootId!=='demo');
    const results=[];
    for(const c of dataset.cases){
      const ids=c.selected?[ws.files.find(f=>f.name===c.selected).id]:[];
      const bStart=performance.now();const baseline=rank(c.question,ws.files,ids);const baselineMs=performance.now()-bStart;
      const start=performance.now();const retrieved=await ws.search(c.question,ids);const currentMs=performance.now()-start;
      const names=retrieved.map(e=>ws.files.find(f=>f.id===e.fileId).name);
      const correctCitations=retrieved.filter(e=>{const f=ws.files.find(f=>f.id===e.fileId);const s=f?.segments[e.segmentIndex];return s&&e.version===f.hash&&e.location===s.location&&e.excerpt===s.text&&e.path===f.path;}).length;
      results.push({id:c.id,split:c.split,expected:c.expected,baselineTop1:baseline[0]?.f.name||null,currentTop1:names[0]||null,baselinePass:(baseline[0]?.f.name||null)===c.expected,currentPass:(names[0]||null)===c.expected,hitAt3:c.expected?names.slice(0,3).includes(c.expected):names.length===0,citations:retrieved.length,correctCitations,baselineScoringMs:baselineMs,currentSearchWithIOms:currentMs});
    }
    const metrics={};for(const split of ['development','holdout']){const rows=results.filter(r=>r.split===split);metrics[split]={total:rows.length,baselineTop1Pass:rows.filter(r=>r.baselinePass).length,currentTop1Pass:rows.filter(r=>r.currentPass).length,hitAt3:rows.filter(r=>r.hitAt3).length};}
    const report={timestamp:new Date().toISOString(),datasetVersion:require('../src/workspace.js').hash(JSON.stringify(dataset)),scope:dataset.provenance,metrics,results,citations:results.reduce((n,r)=>n+r.citations,0),correctCitations:results.reduce((n,r)=>n+r.correctCitations,0),aiCalls:0,aiTokens:null,aiCost:null,limitations:['僅合成檢索案例，非公司真實問題品質評估','baseline 僅計分時間，current 含檔案 I/O，不能直接比較效能','功能驗證、AI 語意及真實連線未納入此檢索分數']};
    const file=path.join(parent,process.argv[2]==='before'?'evaluation-before.json':'evaluation.json');await fs.writeFile(file,JSON.stringify(report,null,2));
    console.log(JSON.stringify({file,metrics,citations:report.citations,correctCitations:report.correctCitations,failed:results.filter(r=>!r.currentPass).map(r=>r.id)},null,2));
    if(process.argv[2]!=='before'&&(results.some(r=>!r.currentPass)||report.citations!==report.correctCitations))process.exitCode=1;
  } finally {if(path.dirname(root)===parent&&path.basename(root).startsWith('evaluation-'))await fs.rm(root,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});

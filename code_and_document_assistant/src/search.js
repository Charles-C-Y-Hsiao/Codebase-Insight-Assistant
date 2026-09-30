// Local lexical retrieval only. Permission filtering is performed by Workspace.
const normalize=s=>s.normalize('NFKC').toLowerCase();
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function rank(question,files,ids=[]){
  const q=normalize(question);
  const words=[...new Set(q.match(/[a-z0-9_]+/g)||[])];
  const chinese=[...new Set(q.match(/[\u4e00-\u9fff]+/g)||[])];
  const pairs=new Set();for(const chunk of chinese)for(let i=0;i<chunk.length-1;i++)pairs.add(chunk.slice(i,i+2));
  const patterns=words.map(w=>new RegExp('(^|[^a-z0-9_])'+escape(w)+'(?=$|[^a-z0-9_])'));
  return files.filter(f=>!ids.length||ids.includes(f.id)).flatMap(f=>{
    const filename=normalize(f.name);
    const fileScore=q.includes(filename)?8:0;
    return f.segments.map((segment,index)=>{
      const text=normalize(segment.text);
      const score=fileScore+patterns.reduce((n,p)=>n+(p.test(text)?3:0),0)+[...pairs].reduce((n,p)=>n+(text.includes(p)?1:0),0)+chinese.reduce((n,p)=>n+(p.length>1&&text.includes(p)?2:0),0)+(ids.length?1:0);
      return {f,segment,index,score};
    });
  }).filter(r=>r.score>0).sort((a,b)=>b.score-a.score).slice(0,12);
}
module.exports={rank};

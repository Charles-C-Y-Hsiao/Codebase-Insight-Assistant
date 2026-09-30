// Frozen phase-2 scoring, captured before phase-3 changes. Do not optimize this baseline.
function rank(question,files,ids=[]){
  const tokens=[...(question.match(/[a-z0-9]+/gi)||[])];for(const chunk of question.match(/[\u4e00-\u9fff]+/g)||[])for(let i=0;i<chunk.length-1;i++)tokens.push(chunk.slice(i,i+2));
  return files.filter(f=>!ids.length||ids.includes(f.id)).flatMap(f=>f.segments.map((segment,index)=>({f,segment,index,score:tokens.reduce((n,t)=>n+(segment.text.toLowerCase().includes(t.toLowerCase())?1:0),0)+(ids.length?1:0)}))).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,12);
}
module.exports={rank};

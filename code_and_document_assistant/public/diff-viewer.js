// Diff2Html UI and jsdiff are loaded only when a comparison is opened.
const diffPreferences=new Map();
let diffLibraries;
function loadDiffLibraries(){
  if(window.Diff&&window.Diff2HtmlUI)return Promise.resolve();
  if(!diffLibraries){
    const load=(src,ready)=>ready()?Promise.resolve():new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src=src;
      const timer=setTimeout(()=>{script.remove();reject(new Error('差異套件載入逾時'));},12000);
      script.onload=()=>{clearTimeout(timer);ready()?resolve():reject(new Error('差異套件未初始化'));};
      script.onerror=()=>{clearTimeout(timer);script.remove();reject(new Error('差異套件 CDN 無法載入'));};document.head.append(script);
    });
    diffLibraries=Promise.all([
      load('https://cdn.jsdelivr.net/npm/diff@5.2.0/dist/diff.min.js',()=>!!window.Diff),
      load('https://cdn.jsdelivr.net/npm/diff2html@3.4.52/bundles/js/diff2html-ui-slim.min.js',()=>!!window.Diff2HtmlUI)
    ]).catch(error=>{diffLibraries=null;throw error;});
  }
  return diffLibraries;
}
function foldDiffRows(output,prefs,onChange){
  const groups=[];
  output.querySelectorAll('tbody').forEach((body,tableIndex)=>{
    const rows=[...body.rows];let start=0,ordinal=0;
    while(start<rows.length){
      if(!rows[start].querySelector('.d2h-cntx')||rows[start].querySelector('.d2h-ins,.d2h-del')){start++;continue;}
      let end=start;while(end<rows.length&&rows[end].querySelector('.d2h-cntx')&&!rows[end].querySelector('.d2h-ins,.d2h-del'))end++;
      const from=start+(start?3:0),to=end-(end<rows.length?3:0),hidden=rows.slice(from,to);
      if(hidden.length>3){
        const key=tableIndex+':'+from+':'+hidden.length,row=document.createElement('tr'),cell=document.createElement('td');cell.colSpan=rows[start].cells.length;row.className='diff-fold-row';
        const button=node('button');button.type='button';
        const sync=()=>{const expanded=prefs.all||prefs.blocks.has(key);hidden.forEach(r=>r.hidden=!expanded);button.textContent=(expanded?'收合':'展開')+' '+hidden.length+' 行未修改內容';button.setAttribute('aria-expanded',String(expanded));};
        const group={key,ordinal:ordinal++,sync};groups.push(group);
        button.onclick=()=>{const expanded=prefs.all||prefs.blocks.has(key);if(prefs.all){prefs.all=false;groups.forEach(g=>prefs.blocks.add(g.key));}for(const linked of groups.filter(g=>g.ordinal===group.ordinal)){if(expanded)prefs.blocks.delete(linked.key);else prefs.blocks.add(linked.key);}groups.forEach(g=>g.sync());onChange();};cell.append(button);row.append(cell);hidden[0].before(row);sync();
      }
      start=end;
    }
  });
}
function createDiffViewer(job,prefix=''){
  const comparison=node('details');comparison.id=prefix+'diff-details-'+job.id;comparison.open=job.status==='awaiting_approval';
  const prefs=diffPreferences.get(job.id)||{mode:'line-by-line',all:false,blocks:new Set()};diffPreferences.set(job.id,prefs);
  const summary=node('summary'),icon=node('i',undefined,'fi fi-br-angle-small-'+(comparison.open?'down':'right'));icon.id=prefix+'diff-details-toggle-'+job.id;icon.setAttribute('aria-hidden','true');summary.append(icon,node('span','展開／收合修改前後內容'));comparison.append(summary);
  const toolbar=node('div',undefined,'diff-view-toolbar'),mode=node('select');mode.setAttribute('aria-label','差異比較方式');mode.id=prefix+'diff-mode-'+job.id;
  for(const [value,label] of [['line-by-line','逐行差異'],['side-by-side','左右並排']]){const option=node('option',label);option.value=value;mode.append(option);}mode.value=prefs.mode;
  const expand=node('button',prefs.all?'收合未修改內容':'展開全部未修改內容');expand.type='button';
  const output=node('div',undefined,'diff-view-output');output.id=prefix+'diff-output-'+job.id;output.setAttribute('aria-live','polite');
  toolbar.id=prefix+'diff-view-toolbar-'+job.id;
  const counts=node('span',undefined,'diff-counts');toolbar.append(mode,expand,counts);
  for(const [label,content] of [['複製修改前',job.proposal.before],['複製修改後',job.proposal.after]]){const copy=node('button',label);copy.type='button';copy.onclick=async()=>{try{await navigator.clipboard.writeText(content);copy.textContent='已複製';setTimeout(()=>copy.textContent=label,1200);}catch{copy.textContent='複製失敗';}};toolbar.append(copy);}
  comparison.append(toolbar,output);let renderVersion=0,drawn=false;
  const fallback=message=>{output.replaceChildren(node('span',message,'muted'));const columns=node('div',undefined,'diff-columns');for(const [label,content,cls] of [['修改前',job.proposal.before,'diff-before'],['修改後',job.proposal.after,'diff-after']]){const section=node('section'),pre=node('pre',content,cls);section.append(node('h4',label),pre);columns.append(section);decorateTaskPre(pre);}output.append(columns);};
  const draw=async()=>{
    const token=++renderVersion;drawn=true;output.replaceChildren(node('span','載入差異比較…','muted'));
    try{
      const before=job.proposal.before,after=job.proposal.after;
      if(before===after){output.replaceChildren(node('span','內容相同，沒有修改差異。'));return;}
      if(before.length+after.length>262144||before.split('\n').length+after.split('\n').length>6000){fallback('內容較大，顯示完整原文比較。');return;}
      await loadDiffLibraries();if(token!==renderVersion)return;
      const name=job.proposal.path.split(/[\\/]/).pop();
      const patch=Diff.createTwoFilesPatch('a/'+name,'b/'+name,before,after,undefined,undefined,{context:Math.max(before.split('\n').length,after.split('\n').length),timeout:1500});
      if(!patch)throw new Error('差異計算逾時');
      const lines=patch.slice(patch.indexOf('@@')).split('\n');counts.replaceChildren(node('span','+'+lines.filter(line=>line.startsWith('+')).length,'diff-count-added'),node('span','−'+lines.filter(line=>line.startsWith('-')).length,'diff-count-removed'));
      output.replaceChildren();const ui=new Diff2HtmlUI(output,patch,{drawFileList:false,fileContentToggle:false,outputFormat:prefs.mode,matching:'lines',diffStyle:'word',synchronisedScroll:true,highlight:true});
      ui.draw();ui.highlightCode();foldDiffRows(output,prefs,()=>expand.textContent=prefs.all?'收合未修改內容':'展開全部未修改內容');
    }catch(error){if(token===renderVersion){fallback(error.message+'；仍可查看與複製原文。');const retry=node('button','重試差異比較');retry.type='button';retry.onclick=draw;output.prepend(retry);}}
  };
  mode.onchange=()=>{prefs.mode=mode.value;prefs.blocks.clear();draw();};
  expand.onclick=()=>{prefs.all=!prefs.all;prefs.blocks.clear();expand.textContent=prefs.all?'收合未修改內容':'展開全部未修改內容';draw();};
  comparison.addEventListener('toggle',()=>{icon.className='fi fi-br-angle-small-'+(comparison.open?'down':'right');if(comparison.open&&!drawn)draw();});
  if(comparison.open)draw();return comparison;
}

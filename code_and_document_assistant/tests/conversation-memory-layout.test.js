const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const css=fs.readFileSync(path.join(__dirname,'../public/styles.css'),'utf8');

test('收合的 conversation-memory 使用單列，展開後保留摘要內容',()=>{
  assert.match(css,/#conversation-memory:not\(:has\(#memory-details\[open\]\)\)\s*\{[\s\S]*?flex-direction:row/);
  assert.match(css,/#conversation-memory:not\(:has\(#memory-details\[open\]\)\) #memory-details > summary\s*\{[\s\S]*?white-space:nowrap/);
  assert.match(css,/#memory-details\[open\]::details-content\s*\{[\s\S]*?display:flex/);
});

test('收合的 skill-panel 與 conversation-memory 使用相同高度與內距',()=>{
  assert.match(css,/#skill-panel:not\(\[open\]\)\s*\{[\s\S]*?height:39px[\s\S]*?min-height:39px[\s\S]*?padding:8px 12px/);
  assert.match(css,/#skill-panel:not\(\[open\]\)\s*\{[\s\S]*?gap:10px/);
  assert.match(css,/#skill-panel:not\(\[open\]\) > summary\s*\{[\s\S]*?width:100%[\s\S]*?padding:0/);
  assert.match(css,/#conversation-memory:not\(:has\(#memory-details\[open\]\)\)\s*\{[\s\S]*?height:39px[\s\S]*?min-height:39px[\s\S]*?padding:8px 12px/);
});

test('對話記憶與技能預設並排，展開後依規則共用下方全寬',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
  assert.match(html,/id="composer-context"/);
  assert.match(css,/#composer-context\s*\{[\s\S]*?display:grid[\s\S]*?grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/);
  assert.match(css,/#composer-context:has\(#memory-details\[open\]\),[\s\S]*?#composer-context:has\(#skill-panel\[open\]\)\s*\{[\s\S]*?grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css,/#composer-context:has\(#memory-details\[open\]\) #skill-panel:not\(\[open\]\),[\s\S]*?grid-row:1/);
  assert.match(css,/#composer-context:has\(#memory-details\[open\]\):has\(#skill-panel\[open\]\) #conversation-memory\s*\{\s*grid-row:1/);
  assert.match(css,/#composer-context:has\(#memory-details\[open\]\):has\(#skill-panel\[open\]\) #skill-panel\s*\{\s*grid-row:2/);
});

test('scope-banner 使用32px單行版面並保留範圍內容',()=>{
  assert.match(css,/#scope-banner\s*\{[\s\S]*?display:flex[\s\S]*?height:32px[\s\S]*?min-height:32px[\s\S]*?padding:0 3px 0 10px[\s\S]*?overflow:hidden/);
  assert.match(css,/#target-badge\s*\{[\s\S]*?text-overflow:ellipsis[\s\S]*?white-space:nowrap/);
  assert.match(css,/.scope-references\s*\{[\s\S]*?flex-wrap:nowrap[\s\S]*?overflow:hidden/);
});

test('skill-panel 使用專案相同的 Flaticon 展開收合圖示',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
  const app=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
  assert.match(html,/id="skill-panel-toggle-icon" class="fi fi-br-angle-small-right"/);
  assert.match(app,/skill-panel-toggle-icon[\s\S]*?fi fi-br-angle-small-['"]\+/);
  assert.match(css,/#skill-panel-heading\s*\{[\s\S]*?gap:2px/);
});

test('scope-banner 整合到 composer-actions，位於操作按鈕之間',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
  const app=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
  assert.match(html,/<div id="composer-actions" class="compose-actions">[\s\S]*?<div class="composer-leading-actions">[\s\S]*?<\/div>\s*<section id="scope-banner"[\s\S]*?<button id="cancel"/);
  assert.doesNotMatch(html,/id="scope-model"/);
  assert.match(html,/id="model-help"[^>]*hidden/);
  assert.match(html,/<div id="target-badge"><span id="target-label">Target:<\/span><span id="target-name">Loading<\/span><\/div>/);
  assert.match(html,/<div class="scope-references"><span id="scope-references-label">Refs:<\/span>[\s\S]*?<button id="add-reference" type="button">Add<\/button>/);
  assert.doesNotMatch(app,/\$\('scope-model'\)/);
  assert.match(app,/\$\('target-name'\)\.textContent=[\s\S]*?'Loading'[\s\S]*?' · Wait'[\s\S]*?' · Read-only'/);
  assert.match(app,/node\('span','No refs','reference-empty'\)/);
  assert.doesNotMatch(app,/node\('span','No refs','muted'\)/);
  assert.match(css,/#reference-chips \.reference-empty\s*\{[\s\S]*?color:#657589[\s\S]*?font-size:14px/);
  assert.match(css,/#composer-actions\s*\{[\s\S]*?flex-wrap:nowrap[\s\S]*?container-type:inline-size/);
  assert.match(css,/#composer-actions\s*\{[\s\S]*?gap:9px/);
  assert.match(css,/#composer-actions > #scope-banner\s*\{[\s\S]*?flex:0 0 500px[\s\S]*?width:500px[\s\S]*?max-width:500px/);
  assert.match(css,/@container \(max-width:680px\)\s*\{[\s\S]*?#composer-actions > #scope-banner\s*\{\s*display:none/);
  assert.match(css,/#scope-banner #add-reference,[\s\S]*?#scope-banner #reference-chips button\s*\{[\s\S]*?height:25px[\s\S]*?min-height:25px[\s\S]*?padding:0 10px/);
});

test('專案列高度39px、操作按鈕有專屬ID且滑入才顯示',()=>{
  const sidebar=fs.readFileSync(path.join(__dirname,'../public/sidebar.js'),'utf8');
  const sidebarCss=fs.readFileSync(path.join(__dirname,'../public/sidebar.css'),'utf8');
  assert.match(sidebar,/group\.id='project-item-'\+p\.id/);
  for(const suffix of ['-choice','-new-conversation','-renew','-actions'])assert.match(sidebar,new RegExp("group\\.id\\+'"+suffix.replace('-', '\\-')+"'"));
  assert.match(sidebarCss,/\.project-row\s*\{[\s\S]*?min-height:39px[\s\S]*?height:39px/);
  assert.match(sidebarCss,/\.project-row:hover \.conversation-new[\s\S]*?opacity:1/);
});

test('project-section-toggle 使用展開收合圖示並垂直置中',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
  const sidebar=fs.readFileSync(path.join(__dirname,'../public/sidebar.js'),'utf8');
  const sidebarCss=fs.readFileSync(path.join(__dirname,'../public/sidebar.css'),'utf8');
  assert.match(html,/id="project-section-toggle"[\s\S]*fi fi-br-angle-small-down/);
  assert.match(sidebar,/project-section-toggle[\s\S]*fi fi-br-angle-small-['"]\+/);
  assert.match(sidebarCss,/#project-section-toggle\s*\{[\s\S]*?display:flex[\s\S]*?align-items:center/);
  assert.match(sidebarCss,/#project-section-toggle > \.fi\s*\{[\s\S]*?translateY\(2px\)/);
  assert.match(css,/#skill-panel > summary #skill-panel-toggle-icon\s*\{[\s\S]*?transform:none/);
  assert.match(css,/#skill-panel > summary #skill-panel-toggle-icon\.fi-br-angle-small-right\s*\{[\s\S]*?translateY\(0px\)/);
});

test('workspace-sidebar 內每個 details 都有專屬 ID',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
  const sidebar=html.slice(html.indexOf('<aside id="workspace-sidebar"'),html.indexOf('</aside>',html.indexOf('<aside id="workspace-sidebar"')));
  const details=[...sidebar.matchAll(/<details\b([^>]*)>/g)];
  assert.ok(details.length>0);
  for(const detail of details)assert.match(detail[1],/\bid="[^"]+"/);
  for(const id of ['project-panel','global-reference-panel','files-panel','connections-panel','issues-panel','registry-panel'])assert.match(sidebar,new RegExp('id="'+id+'"'));
});

test('sidebar details 使用展開收合圖示並垂直置中',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
  const app=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
  for(const id of ['global-reference','files','connections','issues','registry']){
    assert.match(html,new RegExp('id="'+id+'-toggle-icon" class="fi fi-br-angle-small-(right|down)"'));
    assert.match(app,new RegExp(id+'-panel[\\s\\S]*?'+id+'-toggle-icon'));
  }
  assert.match(css,/#global-reference-panel>summary[\s\S]*?display:flex[\s\S]*?align-items:center/);
});

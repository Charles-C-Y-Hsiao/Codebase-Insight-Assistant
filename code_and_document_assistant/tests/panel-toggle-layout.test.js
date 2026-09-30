const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../public/styles.css'),'utf8');
const app=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');

test('側欄開關使用 Flaticon 箭頭，並與展開標題同列',()=>{
  assert.match(html,/<div class="panel-heading"><button id="sidebarToggle"[\s\S]*?fi fi-br-angle-small-left[\s\S]*?<span class="panel-title">工作區<\/span><\/div>/);
  assert.match(html,/<div class="panel-heading"><button id="inspectorToggle"[\s\S]*?fi fi-br-angle-small-right[\s\S]*?<span class="panel-title">執行詳情<\/span><\/div>/);
  assert.match(app,/button\.querySelector\('\.fi'\)\.className='fi fi-br-angle-small-'/);
  assert.match(css,/#workspace-sidebar > \.panel-heading,[\s\S]*?top:0[\s\S]*?display:flex[\s\S]*?align-items:center[\s\S]*?margin:0[\s\S]*?padding:22px 10px 10px 18px[\s\S]*?background:inherit/);
  assert.match(css,/#workspace-sidebar > \.panel-heading > \.panel-toggle\s*,[\s\S]*?width:32px[\s\S]*?height:30px[\s\S]*?min-height:30px/);
  assert.match(css,/#workspace-sidebar > \.panel-heading > \.panel-toggle > \.fi,[\s\S]*?font-size:16px/);
});

test('收合側欄以零水平內距與百分比定位置中垂直標題',()=>{
  assert.match(css,/\.sidebar-collapsed \.sidebar,\.inspector-collapsed \.inspector\s*\{\s*padding:0/);
  assert.match(css,/\.sidebar-collapsed \.sidebar::after,\.inspector-collapsed \.inspector::after\s*\{[\s\S]*?left:50%[\s\S]*?translateX\(-26%\)/);
  assert.match(css,/\.sidebar-collapsed \.sidebar > \.panel-heading,[\s\S]*?width:100%[\s\S]*?justify-content:center[\s\S]*?margin:0[\s\S]*?padding:12px 0 10px 10px/);
  assert.match(css,/\.sidebar-collapsed \.sidebar > \.panel-heading > \.panel-toggle,[\s\S]*?flex-basis:27px[\s\S]*?width:27px[\s\S]*?min-width:27px/);
  assert.doesNotMatch(css,/\.panel-toggle-left|\.panel-toggle-right|\.toggle-label/);
  assert.match(css,/\.sidebar-collapsed #workspace-sidebar > \.panel-heading > \.panel-title,[\s\S]*?\.inspector-collapsed #execution-inspector > \.panel-heading > \.panel-title\s*\{\s*display:none/);
  assert.match(css,/\.sidebar-collapsed \.sidebar::after,\.inspector-collapsed \.inspector::after\s*\{[\s\S]*?top:54px/);
});

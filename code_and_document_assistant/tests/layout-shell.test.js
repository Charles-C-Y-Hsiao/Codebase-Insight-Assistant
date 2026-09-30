const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../public/styles.css'),'utf8');

test('桌面三欄固定在視窗內，中間內容獨立捲動且 composer 位於捲動區外',()=>{
  const scrollStart=html.indexOf('<div id="main-scroll">');
  const scrollEnd=html.indexOf('</div>\n  <form id="composer">',scrollStart);
  const composer=html.indexOf('<form id="composer">');
  assert(scrollStart>=0&&scrollEnd>scrollStart);
  assert(composer>scrollEnd,'composer 必須是 main-scroll 的同層元素');
  assert.match(css,/body\s*\{[^}]*display:flex;[^}]*overflow:hidden/s);
  assert.match(css,/\.layout\s*\{[^}]*height:100%;[^}]*min-height:0;[^}]*overflow:hidden/s);
  assert.match(css,/\.sidebar,.inspector\s*\{[^}]*height:100%;[^}]*overflow-y:auto/s);
  assert.match(css,/#main-scroll\s*\{[^}]*flex:1 1 auto;[^}]*overflow-y:auto/s);
  assert.match(css,/#composer\s*\{[^}]*flex:0 0 auto;[^}]*max-height:50%;[^}]*overflow:visible/s);
});

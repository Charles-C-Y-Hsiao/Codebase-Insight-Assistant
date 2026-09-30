const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('public/index.html','utf8');
const css = fs.readFileSync('public/styles.css','utf8');

test('intro 與其第一層內容都有 ID，主標題與說明使用 span',()=>{
  assert.match(html,/<div id="intro" class="intro">\s*<span id="intro-eyebrow" class="eyebrow">/);
  assert.match(html,/<span id="intro-title">從檔案開始，把問題處理清楚。<\/span>/);
  assert.match(html,/<span id="intro-description" class="muted">查詢附上來源；修改先看差異；驗證清楚列出已做與未做。<\/span>/);
  assert.doesNotMatch(html,/<div[^>]*class="intro"[^>]*>[\s\S]*?<h1[\s>]/);
  assert.match(css,/#intro-title\s*,[\s\S]*?display:block/);
  assert.match(css,/#intro-title\s*\{\s*margin-bottom:0/);
  assert.match(css,/@media\(max-width:650px\)[\s\S]*?#intro-title\s*,[\s\S]*?font-size:22px/);
  assert.match(css,/.muted\s*\{[\s\S]*?display:block/);
});

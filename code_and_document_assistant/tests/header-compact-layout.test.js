const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../public/styles.css'),'utf8');

test('header 使用完整 ID 並維持緊湊高度',()=>{
  for(const id of ['app-header','header-identity','header-title-row','app-title','app-subtitle','current-model','mode-label'])assert(html.includes(`id="${id}"`),`缺少 ${id}`);
  assert.match(css,/#app-header\s*\{[\s\S]*?min-height:64px[\s\S]*?padding:8px 20px/);
  assert.match(css,/#main-content\s*\{[\s\S]*?padding:16px 20px/);
});

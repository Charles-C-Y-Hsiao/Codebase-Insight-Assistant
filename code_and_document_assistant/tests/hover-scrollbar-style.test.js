const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const css=fs.readFileSync(path.join(__dirname,'../public/styles.css'),'utf8');

test('所有既有可捲動區域使用 hover reveal scrollbar 樣式',()=>{
  const selectors=['body','dialog','.sidebar','.inspector','#main-scroll','#composer','#composer-request','#image-draft','#memory-summary','.diff-columns pre','.task-detail pre','#inspector-verification pre'];
  for(const selector of selectors)assert(css.includes(selector),`缺少 ${selector} 的捲軸樣式`);
  assert.match(css,/scrollbar-color:transparent transparent/);
  assert.match(css,/::-webkit-scrollbar-thumb\s*\{[\s\S]*?background:transparent/);
  assert.match(css,/:hover::-webkit-scrollbar-thumb[\s\S]*?background-color:var\(--hover-scrollbar-thumb\)/);
  assert.match(css,/::-webkit-scrollbar-thumb:hover[\s\S]*?background-color:var\(--hover-scrollbar-thumb-active\)/);
});

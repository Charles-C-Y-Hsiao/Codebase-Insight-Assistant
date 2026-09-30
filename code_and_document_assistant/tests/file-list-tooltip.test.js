const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const app=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../public/styles.css'),'utf8');

test('檔案清單只顯示檔名，完整路徑使用浮動 tooltip',()=>{
  assert.match(app,/label\.dataset\.tooltip=f\.path/);
  assert.match(app,/node\('span',f\.name\)/);
  assert.match(app,/label\.addEventListener\('pointerenter'/);
  assert.match(css,/\.file\s*\{[\s\S]*?width:100%[\s\S]*?min-width:0/);
  assert.match(css,/\.file-tooltip\s*\{[\s\S]*?position:fixed[\s\S]*?max-height:3\.1em[\s\S]*?overflow:hidden/);
});

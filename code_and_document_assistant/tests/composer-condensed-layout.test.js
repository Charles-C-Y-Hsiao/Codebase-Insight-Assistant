const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../public/styles.css'),'utf8');

test('composer 預設精簡，功能集中在浮動選單且保留既有控制 ID',()=>{
  assert.match(html,/<button id="composer-more"[^>]*aria-controls="composer-menu"/);
  assert.match(html,/<div id="composer-menu" class="composer-menu" hidden>/);
  for(const id of ['composer-files','composer-images','composer-reference','composer-permission','ai-edit-label','model-help','cancel','send'])assert(html.includes(`id="${id}"`),`缺少 ${id}`);
  assert.match(html,/<button id="send"(?![^>]*class="primary")[^>]*>/);
  assert.match(html,/<div id="composer-submit-actions">\s*<button id="cancel"[\s\S]*?<button id="send"[\s\S]*?<\/div>/);
  assert.match(css,/#composer-actions button\s*\{[\s\S]*?min-width:32px[\s\S]*?min-height:32px/);
  assert.match(css,/#send,#cancel\s*\{[\s\S]*?width:32px[\s\S]*?height:32px[\s\S]*?padding:0/);
  assert.doesNotMatch(css,/#send\s*\{\s*width:/);
  assert.match(css,/#send i,#cancel i\s*\{[\s\S]*?font-size:25px/);
  assert.match(css,/#composer-leading-actions,\.composer-leading-actions\s*\{[\s\S]*?gap:0/);
  assert.match(css,/#composer-submit-actions\s*\{[\s\S]*?gap:2px[\s\S]*?margin-left:auto/);
  assert.match(css,/#composer-actions #composer-more\s*\{[\s\S]*?width:20px[\s\S]*?height:32px[\s\S]*?min-width:20px[\s\S]*?min-height:32px[\s\S]*?padding:0/);
  assert.match(css,/#ai-edit-label:not\(\[hidden\]\)[\s\S]*?gap: 1px/);
  assert.match(css,/#ai-edit-label input\s*\{\s*transform:translateY\(1px\)/);
  assert.match(css,/.composer-menu\s*\{[\s\S]*?position:absolute[\s\S]*?bottom:calc\(100% \+ 8px\)/);
  assert.match(css,/.composer-menu\[hidden\]\s*\{\s*display:none/);
  assert.match(css,/#composer-request #selected:empty[\s\S]*?display:none/);
  assert.match(html,/<div id="question-editor">\s*<div id="image-draft" class="attachment-gallery"><\/div>\s*<label class="visually-hidden" for="question">[\s\S]*?<textarea id="question"/);
  assert.match(html,/<div id="composer-context">[\s\S]*?<section id="conversation-memory"[\s\S]*?<\/section>\s*<details id="skill-panel"[\s\S]*?<\/details>\s*<\/div>\s*<div id="composer-request">/);
  assert.doesNotMatch(html,/<div id="composer-request">[\s\S]*?<details id="skill-panel"/);
  assert.match(css,/#composer-request\s*\{[\s\S]*?max-height:min\(200px,30vh\)[\s\S]*?overflow-y:auto/);
  assert.match(css,/#image-draft\.attachment-gallery\s*\{[\s\S]*?flex-wrap:nowrap[\s\S]*?overflow-x:auto/);
  assert.match(css,/#image-draft \.attachment-preview img\s*\{[\s\S]*?width:120px[\s\S]*?height:84px/);
  assert.match(css,/#question-editor\s*\{[\s\S]*?border:1px solid #c4d2df[\s\S]*?border-radius:12px/);
  assert.match(css,/#scope-banner #add-reference,[\s\S]*?#scope-banner #reference-chips button\s*\{[\s\S]*?height:25px[\s\S]*?min-height:25px/);
});

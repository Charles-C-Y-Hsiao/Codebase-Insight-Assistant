const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {AppState}=require('../src/app-state.js');

test('狀態檔暫時被 Windows 鎖定時重試並保留對話',async()=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'cda-state-retry-'));
  const originalRename=fs.rename;
  let attempts=0;
  try{
    const state=await new AppState(base).init();
    const conversation=state.conversation('owner','project');
    fs.rename=async(...args)=>{
      attempts++;
      if(attempts<=2)throw Object.assign(new Error('temporarily locked'),{code:'EPERM'});
      return originalRename(...args);
    };
    await state.save();
    assert.equal(attempts,3);
    const restored=await new AppState(base).init();
    assert.equal(restored.data.conversations[0].id,conversation.id);
  }finally{
    fs.rename=originalRename;
    await fs.rm(base,{recursive:true,force:true});
  }
});

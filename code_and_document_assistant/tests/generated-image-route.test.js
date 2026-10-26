const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createApp}=require('../server.js');

test('generated image route rejects anonymous requests and returns 404 for unknown images',async t=>{
  const runtime=await fs.mkdtemp(path.join(os.tmpdir(),'cda-generated-route-'));
  const instance=await createApp({runtime});
  const server=instance.app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await instance.saved.queue;await fs.rm(runtime,{recursive:true,force:true});});
  const origin='http://127.0.0.1:'+server.address().port;
  assert.equal((await fetch(origin+'/generated-images/missing')).status,403);
  const session=await fetch(origin+'/api/session');
  const cookie=session.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(origin+'/generated-images/missing',{headers:{cookie}})).status,404);
});

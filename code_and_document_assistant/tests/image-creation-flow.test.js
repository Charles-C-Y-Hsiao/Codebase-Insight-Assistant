const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {createApp}=require('../server');

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5n8AAAAASUVORK5CYII=','base64');
test('圖片創作需要授權，逐版保存 PNG 與提示詞，重新啟動仍可讀取',async t=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'cda-image-creation-'));
  const runtime=path.join(base,'runtime'),project=path.join(base,'project'),config=path.join(base,'ai.json');
  await fs.mkdir(project);
  await fs.writeFile(config,JSON.stringify({imageGenerationModel:'gpt-image-1'}));
  let instance,server,baseUrl,calls=[];
  const start=async()=>{
    instance=await createApp({runtime,adminToken:'abcdef',aiOptions:{env:{CDA_MODEL_MODE:'real',CDA_AI_CONFIG:config,CDA_AI_MODEL:'gpt-5.6-luna',CDA_AI_KEY:'FAKE'},fetchImpl:async(url,options)=>{
      calls.push({url,options});
      return Response.json({data:[{b64_json:png.toString('base64')}]});
    }}});
    server=instance.app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    baseUrl='http://127.0.0.1:'+server.address().port;
  };
  t.after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));if(instance)await instance.saved.queue;await fs.rm(base,{recursive:true,force:true});});
  await start();
  const sessionResponse=await fetch(baseUrl+'/api/session'),session=await sessionResponse.json();
  assert.deepEqual(session.imageGeneration,{enabled:true,model:'gpt-image-1',provider:'openai'});
  const headers={cookie:sessionResponse.headers.get('set-cookie').split(';')[0],'x-cda-token':session.csrf,'content-type':'application/json'};
  async function request(endpoint,body){const res=await fetch(baseUrl+endpoint,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body)});return {status:res.status,data:await res.json()};}
  const denied=await request('/api/image-generation',{prompt:'請製作未授權圖片'});
  assert.equal(denied.status,400);assert.match(denied.data.error,/AI_PERMISSION/);assert.equal(calls.length,0);
  const grant=(await request('/api/roots/request',{path:project,ai:true,minutes:60})).data;
  const root=(await request('/api/roots/'+grant.id+'/approve',{adminToken:'abcdef'})).data.root;
  headers['x-cda-project']=root.id;
  const conversation=(await request('/api/conversations')).data.id;headers['x-cda-conversation']=conversation;
  const firstResponse=await request('/api/image-generation',{prompt:'請製作 CYE flow 圖片'});
  assert.equal(firstResponse.status,202);
  const first=firstResponse.data;
  assert.equal(first.kind,'image');assert.equal(first.imageCreation.version,1);
  await instance.creations.jobs.get(first.id).finished;
  assert.equal(calls.length,1);assert.match(calls[0].url,/\/images\/generations$/);
  const firstResult=(await request('/api/jobs/'+first.id)).data;
  assert.equal(firstResult.status,'completed');assert.match(firstResult.imageCreation.fileName,/cye-flow-v1\.png$/);
  const second=(await request('/api/image-generation',{prompt:'請讓箭頭更粗',previousJobId:first.id})).data;
  await instance.creations.jobs.get(second.id).finished;
  assert.equal(calls.length,2);assert.match(calls[1].url,/\/images\/edits$/);
  const secondResult=(await request('/api/jobs/'+second.id)).data;
  assert.equal(secondResult.imageCreation.version,2);assert.equal(secondResult.imageCreation.previousJobId,first.id);
  assert.match(secondResult.imageCreation.fileName,/cye-flow-v2\.png$/);
  const imageResponse=await fetch(baseUrl+'/generated-images/'+second.id,{headers:{cookie:headers.cookie}});
  assert.equal(imageResponse.status,200);assert.deepEqual(Buffer.from(await imageResponse.arrayBuffer()),png);
  const imageDir=path.join(runtime,'assistant-state','generated-images',root.id,conversation,firstResult.imageCreation.seriesId);
  assert.deepEqual((await fs.readdir(imageDir)).sort(),['cye-flow-v1.json','cye-flow-v1.png','cye-flow-v2.json','cye-flow-v2.png']);
  const metadata=JSON.parse(await fs.readFile(path.join(imageDir,'cye-flow-v2.json'),'utf8'));
  assert.equal(metadata.prompt,'請讓箭頭更粗');assert.equal(metadata.model,'gpt-image-1');
  await new Promise(resolve=>server.close(resolve));server=null;await instance.saved.queue;await start();
  const history=(await request('/api/conversations')).data.jobs;
  assert.equal(history.length,2);assert.equal(history[1].imageCreation.version,2);
  assert.equal((await fetch(baseUrl+'/generated-images/'+second.id,{headers:{cookie:headers.cookie}})).status,200);
});

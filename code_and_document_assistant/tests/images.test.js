const {test}=require('node:test');
const assert=require('node:assert/strict');
const {ImageStore}=require('../src/image-store');
const {AIClient}=require('../src/ai-client');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5n8AAAAASUVORK5CYII=','base64');
test('圖片格式、數量、20MB上限、草稿隔離及服務期間保留',()=>{
  const s=new ImageStore();assert.equal(s.limit('a'),10);s.setLimit('a',20);assert.equal(s.limit('a'),20);
  for(const limit of [0,21,1.5])assert.throws(()=>s.setLimit('a',limit));
  assert.throws(()=>s.add('a','p','c','image/png',Buffer.alloc(21*1024*1024)),/上限/);
  assert.throws(()=>s.add('a','p','c','image/png',Buffer.from('<html>')),/格式/);
  assert.throws(()=>s.add('a','p','c','image/gif',png),/格式/);
  const images=Array.from({length:5},()=>s.add('a','p','c','image/png',png));
  assert.throws(()=>s.add('a','p','c','image/png',png),/5/);
  assert.equal(s.list('a','p','c').length,5);assert.equal(s.list('b','p','c').length,0);
  assert.throws(()=>s.select('b','p','c',[images[0].id]));assert.throws(()=>s.select('a','other','c',[images[0].id]));
  assert.throws(()=>s.select('a','p','c',[images[0].id,images[0].id]));
  const selected=s.select('a','p','c',[images[0].id]);selected[0].jobId='job';
  assert.equal(s.list('a','p','c').length,4);assert.ok(s.get('a',images[0].id));assert.throws(()=>s.remove('a','p','c',images[0].id));
  assert.equal(new ImageStore().list('a','p','c').length,0);s.clearConversation('a','p','c');assert.equal(s.bytes,0);
});
test('圖片轉為 Responses 與 Chat 圖片內容；未啟用的模型不送出',async()=>{
  let body,calls=0;
  const client=new AIClient({env:{CDA_AI_KEY:'FAKE',CDA_AI_MODEL:'gpt-5.6-luna'},fetchImpl:async(url,o)=>{
    calls++;body=JSON.parse(o.body);
    return Response.json(client.config.protocol==='responses'?{status:'completed',output:[{type:'function_call',name:'finish',call_id:'a',arguments:'{}'}]}:{choices:[{message:{tool_calls:[{id:'a',function:{name:'finish',arguments:'{}'}}]}}]});
  }});
  for(const protocol of ['responses','chat-completions']){
    client.config.protocol=protocol;
    await client.turn([{role:'user',content:'描述圖片'}],[],new AbortController().signal,undefined,undefined,[{mime:'image/png',buffer:png}]);
    const content=(body.input||body.messages)[0].content;
    assert.equal(content[1].type,protocol==='responses'?'input_image':'image_url');assert.match(JSON.stringify(content),/data:image\/png;base64,/);
  }
  client.config.supportsImages=false;await assert.rejects(client.turn([{role:'user',content:'test'}],[],new AbortController().signal,undefined,undefined,[{mime:'image/png',buffer:png}]),/AI_IMAGE_UNSUPPORTED/);assert.equal(calls,2);
});
module.exports={png};

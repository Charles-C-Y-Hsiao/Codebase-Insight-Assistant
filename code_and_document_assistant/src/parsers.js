const path=require('node:path');
const fs=require('node:fs');
const {spawn}=require('node:child_process');
function pythonPath(){
  const candidate=process.env.CDA_PYTHON||path.join(process.env.USERPROFILE||'', '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
  return fs.existsSync(candidate)?candidate:null;
}
function worker(mode,buffer,{timeoutMs=10000,signal}={}){
  const python=pythonPath();if(!python)return Promise.reject(new Error('Python 未設定，請設定 CDA_PYTHON 絕對路徑'));
  return new Promise((resolve,reject)=>{
    const env={SystemRoot:process.env.SystemRoot||'',WINDIR:process.env.WINDIR||'',PATH:path.dirname(python),TEMP:process.env.TEMP||''};
    const child=spawn(python,['-I','-B',path.join(__dirname,'../python/document_worker.py'),mode],{shell:false,windowsHide:true,env});
    let output=[],size=0,done=false;
    const finish=(error,result)=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);if(error){child.kill();reject(error);}else resolve(result);};
    const abort=()=>finish(new Error('解析或驗證已取消'));
    const timer=setTimeout(()=>finish(new Error('解析或驗證逾時')),timeoutMs);
    signal?.addEventListener('abort',abort,{once:true});
    child.on('error',()=>finish(new Error('Python 子程序無法啟動')));
    child.stdout.on('data',chunk=>{size+=chunk.length;if(size>8*1024*1024)finish(new Error('解析結果超過 8 MiB'));else output.push(chunk);});
    child.stderr.on('data',()=>{}); // 不把底層任意診斷或內容送到前端紀錄。
    child.stdin.on('error',()=>{});
    child.on('close',code=>{if(done)return;try{if(code!==0)throw new Error('Python 子程序失敗：'+code);const result=JSON.parse(Buffer.concat(output).toString('utf8'));if(result.error)throw new Error(result.error);finish(null,result);}catch(e){finish(e);}});
    if(signal?.aborted)abort();else child.stdin.end(buffer);
  });
}
const supported=['.pdf','.docx','.pptx','.xlsx','.html','.md','.txt','.js','.cjs','.mjs','.py','.css','.json'];
async function parse(buffer,extension,options={}){
  if(['.pdf','.docx','.pptx','.xlsx','.html'].includes(extension))return worker(extension,buffer,options);
  const content=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(buffer);
  if(!content.trim()||content.includes('\0'))throw new Error('未取得可用 UTF-8 文字');
  return {segments:[{text:content,location:'行 1–'+content.split('\n').length,locator:{startLine:1,endLine:content.split('\n').length}}],warnings:[]};
}
module.exports={parse,worker,pythonPath,supported};

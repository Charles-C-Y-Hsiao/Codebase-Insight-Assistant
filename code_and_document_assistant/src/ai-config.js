const fs=require('node:fs');
const path=require('node:path');
const Ajv=require('ajv');
const validate=new Ajv().compile({type:'object',additionalProperties:false,properties:{
  provider:{enum:['openai','openai-compatible']},protocol:{enum:['responses','chat-completions']},endpoint:{type:'string',maxLength:2048},model:{type:'string',maxLength:200},imageGenerationModel:{type:'string',maxLength:200},omitModel:{type:'boolean'},supportsImages:{type:'boolean'},
  memoryBudgetTokens:{type:'integer',minimum:2000,maximum:24000},contextBudgetTokens:{type:'integer',minimum:8000,maximum:64000},
  keyEnvironmentVariable:{type:'string',pattern:'^[A-Za-z_][A-Za-z0-9_]*$'},authHeader:{type:'string',pattern:'^[A-Za-z][A-Za-z0-9-]*$'},authPrefix:{type:'string',maxLength:32,pattern:'^[^\\r\\n]*$'},
  toolMode:{enum:['native','json']},timeoutMs:{type:'integer',minimum:100,maximum:120000},overallTimeoutMs:{type:'integer',minimum:100,maximum:300000},maxRetries:{type:'integer',minimum:0,maximum:2},maxRounds:{type:'integer',minimum:1,maximum:12},maxToolCalls:{type:'integer',minimum:1,maximum:24},maxOutputTokens:{type:'integer',minimum:128,maximum:16384}
}});
function loadConfig(env=process.env){
  let supplied={};
  if(env.CDA_AI_CONFIG){try{supplied=JSON.parse(fs.readFileSync(path.resolve(env.CDA_AI_CONFIG),'utf8'));}catch{throw new Error('CONFIG_REQUIRED：無法讀取 AI JSON 設定檔');}}
  if(!validate(supplied))throw new Error('CONFIG_REQUIRED：AI 設定格式不符或含未知欄位；key 必須放環境變數');
  const config={provider:'openai',protocol:'responses',endpoint:'https://api.openai.com/v1/responses',model:'',imageGenerationModel:'',omitModel:false,keyEnvironmentVariable:'CDA_AI_KEY',authHeader:'Authorization',authPrefix:'Bearer ',toolMode:'native',timeoutMs:30000,overallTimeoutMs:120000,maxRetries:1,maxRounds:8,maxToolCalls:12,maxOutputTokens:9000,...supplied};
  if(env.CDA_AI_MODEL)config.model=env.CDA_AI_MODEL;
  config.memoryBudgetTokens??=8000;config.contextBudgetTokens??=32000;
  if(config.contextBudgetTokens<config.memoryBudgetTokens+config.maxOutputTokens+2000)throw new Error('CONFIG_REQUIRED：上下文預算須預留記憶、輸出與指令空間');
  // Other/company model capabilities must be explicitly configured by the host.
  if(config.supportsImages===undefined)config.supportsImages=config.provider==='openai'&&config.model==='gpt-5.6-luna';
  if(!validate(config))throw new Error('CONFIG_REQUIRED：AI 設定格式不符');
  let url;try{url=new URL(config.endpoint);}catch{throw new Error('CONFIG_REQUIRED：AI endpoint URL 不合法');}
  if(url.username||url.password||url.hash||[...url.searchParams.keys()].some(k=>/key|token|secret|credential/i.test(k)))throw new Error('CONFIG_REQUIRED：URL 不可含認證資料或片段');
  if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname)))throw new Error('CONFIG_REQUIRED：AI endpoint 必須 HTTPS；僅 localhost 測試可用 HTTP');
  if(/^(host|cookie|content-type|content-length|connection|transfer-encoding)$/i.test(config.authHeader))throw new Error('CONFIG_REQUIRED：認證標頭不合法');
  if(config.provider==='openai'&&(config.endpoint!=='https://api.openai.com/v1/responses'||config.protocol!=='responses'||config.omitModel||config.toolMode!=='native'||config.authHeader!=='Authorization'||config.authPrefix!=='Bearer '))throw new Error('CONFIG_REQUIRED：官方 OpenAI 請使用 Responses 標準設定；公司 URL 請選 openai-compatible');
  if(config.imageGenerationModel&&config.provider!=='openai')throw new Error('CONFIG_REQUIRED：imageGenerationModel 目前僅支援官方 OpenAI 端點');
  if(config.toolMode==='json'&&config.protocol!=='chat-completions')throw new Error('CONFIG_REQUIRED：JSON 指令模式使用 chat-completions');
  if(!config.omitModel&&!config.model.trim())throw new Error('CONFIG_REQUIRED：請設定 CDA_AI_MODEL 或設定檔 model');
  const key=env[config.keyEnvironmentVariable];
  if(!key||/[\r\n]/.test(key))throw new Error('CONFIG_REQUIRED：請設定後端 API key 環境變數 '+config.keyEnvironmentVariable);
  if(!/^[\x21-\x7e]+$/.test(key))throw new Error('AI_KEY_FORMAT：API key 含空白或非 ASCII 字元；請重新輸入原始 key，不包含引號或 Bearer 前綴');
  return {config,key};
}
module.exports={loadConfig};

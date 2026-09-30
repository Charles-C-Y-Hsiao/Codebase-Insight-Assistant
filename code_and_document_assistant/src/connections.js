// 公司呼叫格式尚未提供；不猜 endpoint、SQL、認證或回傳欄位。
const requirements={
  ai:['核准 URL','認證方式與環境變數名稱','模型 ID','去機密 request / response','原生工具呼叫或結構化 JSON 格式'],
  sqlServer:['主機／資料庫','唯讀帳號','核准參數化 SQL ID 與 SQL','參數型別','欄位、日期、單位及篩選語意'],
  oracle:['connectString','唯讀帳號','核准參數化 SQL ID 與 SQL','bind 型別','欄位、日期、單位及篩選語意'],
  internalApi:['固定核准 URL','唯讀操作清單','認證方式','參數及成功／錯誤 schema']
};
function status(model){const result=Object.fromEntries(Object.entries(requirements).map(([key,missing])=>[key,{status:'unconfigured',mode:'error',missing}]));
  result.ai=model?.mode==='real'?{status:model.verified?'connected':'configured_not_tested',mode:'real',provider:model.config.provider,protocol:model.config.protocol,model:model.config.omitModel?'由端點指定':model.config.model,missing:[]}:model?.mode==='error'?{status:'unconfigured',mode:'error',missing:[model.message]}:{status:'mock',mode:'mock',missing:requirements.ai};return result;}
class UnconfiguredModel {
  constructor(message){this.mode='error';this.message=message||'CONFIG_REQUIRED：公司 AI 尚未接入；需要 '+requirements.ai.join('、')+'。不回退 Mock。';}
  async plan(){throw new Error(this.message);}
}
function createModel(options={}){const env=options.env||process.env;if(env.CDA_MODEL_MODE!=='real')return new (require('./model.js').MockModel)();try{return new (require('./ai-client.js').AIClient)(options);}catch(e){return new UnconfiguredModel(e.message);}}
function assertDataMode(){if(process.env.CDA_DATA_MODE==='real')throw Object.assign(new Error('CONFIG_REQUIRED：真實 SQL / API 尚未提供核准連線與查詢範例，不回退 Mock'),{code:'CONFIG_REQUIRED'});}
module.exports={status,UnconfiguredModel,assertDataMode,createModel};

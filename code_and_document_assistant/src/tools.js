const Ajv = require('ajv');
const ajv = new Ajv({ allErrors: true });
const schema = { type: 'object', additionalProperties: false, required: ['product','period'], properties: {
  product: { type: 'string', enum: ['A','B'] }, period: { type: 'string', enum: ['2026 Q1'] }
}};
const registry = ['sqlserver.orders','oracle.orders','api.orders'].map(name => ({
  name, purpose: '查詢指定產品季度含稅訂單總額（模擬、唯讀）', parameters: schema,
  fields: { amount: '含稅訂單金額', unit: 'TWD', product: '產品代號', period: '季度', filters: '全部地區、不含已取消訂單' },
  source: 'MOCK ' + name, timeRange: '2026 Q1', maxRows: 1,
  error: { code: 'TIMEOUT | API_FAILURE | SCHEMA | CAPABILITY', message: '繁中錯誤說明', retryable: '只有暫時性失敗可重試' }
}));
const validators = new Map(registry.map(t => [t.name, ajv.compile(t.parameters)]));
function validate(name, args) {
  if (!validators.has(name)) throw Object.assign(new Error('工具不在白名單'), {code:'CAPABILITY'});
  if (!validators.get(name)(args)) throw Object.assign(new Error('工具參數不符合 schema'), {code:'SCHEMA'});
}
function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    const stop = () => { clearTimeout(timer); signal?.removeEventListener('abort',stop); reject(Object.assign(new Error('操作已取消或逾時'), {code:'CANCELLED'})); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort',stop); resolve(); }, ms);
    if (signal?.aborted) stop(); else signal?.addEventListener('abort',stop,{once:true});
  });
}
async function execute(name, args, {signal, scenario='normal'} = {}) {
  validate(name,args);
  require('./connections.js').assertDataMode();
  if (name === 'api.orders' && scenario === 'timeout') await delay(60000,signal);
  await delay(80,signal);
  if (name === 'api.orders' && scenario === 'failure') throw Object.assign(new Error('模擬 API 暫時失敗'), {code:'API_FAILURE', retryable:true});
  return [{...args, amount: args.product === 'B' && name === 'oracle.orders' ? 1300000 : 1280000,
    unit:'TWD', filters:'全部地區、不含已取消訂單', measure:'含稅訂單金額', mock:true }];
}
module.exports = { registry, validate, execute, delay };

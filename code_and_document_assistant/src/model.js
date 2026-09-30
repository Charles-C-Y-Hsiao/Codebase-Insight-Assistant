const Ajv = require('ajv');
const check = new Ajv().compile({type:'object',additionalProperties:false,required:['intent','product','period','scenario','steps'],properties:{
  intent:{enum:['query','read','edit','missing']},product:{type:'string'},period:{type:'string'},scenario:{enum:['normal','failure','timeout']},steps:{type:'array',maxItems:8,items:{type:'string'}}
}});
// 可替換模型契約：plan({question, files}) -> schema 驗證的公開行動計畫。
// Mock 僅判斷使用者輸入，文件內容不能影響工具權限。
class MockModel {
  async plan({question,files}) {
    const edit = /修正|修改|改為|改成/.test(question);
    const read = (/解釋|說明|摘要|閱讀/.test(question) && files.length) || /^(搜尋|尋找)/.test(question);
    const missing = /薪資|天氣|刪除|shell|任意SQL/i.test(question);
    const intent = missing ? 'missing' : edit ? 'edit' : read ? 'read' : 'query';
    const product = question.match(/(?:產品\s*|\b)([AB])\b/i)?.[1]?.toUpperCase() || '';
    const period = /2026\s*(?:Q1|年?第一季)/i.test(question) ? '2026 Q1' : '';
    const result = {intent, product, period, scenario:/逾時|timeout/i.test(question)?'timeout':/失敗/.test(question)?'failure':'normal',
      steps: intent === 'edit' ? ['讀取指定檔案與版本','產生受限範例修改與差異','等待使用者套用','檢查版本後寫入並靜態驗證'] : ['搜尋授權文件與定位','核對必要產品及時間','執行已登錄唯讀工具','由程式計算差異、檢查引用並回答']};
    if (!check(result)) throw new Error('模型計畫 schema 不符');
    return result;
  }
  async assessEvidence() { return {mock:true, status:'未執行真實模型語意核對，僅使用程式比對欄位與數值'}; }
}
function validatePlan(result){if(!check(result))throw new Error('模型計畫 schema 不符');return result;}
module.exports = {MockModel,validatePlan};

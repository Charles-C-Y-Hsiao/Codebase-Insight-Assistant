const fs=require('node:fs/promises');
const path=require('node:path');

const catalog=Object.freeze([
  {id:'node-syntax',label:'JavaScript 語法',extensions:['.js','.cjs','.mjs'],description:'使用固定 Node --check 檢查語法，不執行使用者程式。'},
  {id:'python-compile',label:'Python compile',extensions:['.py'],description:'只編譯 Python 語法，不匯入套件或執行程式。'},
  {id:'html-static',label:'HTML 基本結構',extensions:['.html'],description:'檢查 HTML 的基本結構，不執行瀏覽器互動。'},
  {id:'json-parse',label:'JSON 語法',extensions:['.json'],description:'使用固定 JSON parser 檢查格式。'},
  {id:'css-basic',label:'CSS 基本語法',extensions:['.css'],description:'檢查括號、註解與基本宣告結構，不使用外部 linter。'}
]);
const known=new Map(catalog.map(rule=>[rule.id,rule]));

class VerificationRules {
  constructor(base){this.file=path.join(base,'assistant-state','verification-rules.json');this.enabled=new Set();}
  async init(){
    let data;
    try{data=JSON.parse(await fs.readFile(this.file,'utf8'));}
    catch(error){if(error.code!=='ENOENT')throw new Error('驗證規則設定檔格式錯誤：'+error.message);data={enabled:catalog.map(rule=>rule.id)};await this.save(data);}
    if(!data||typeof data!=='object'||!Array.isArray(data.enabled)||data.enabled.some(id=>typeof id!=='string'||!known.has(id)))throw new Error('驗證規則設定檔包含未知規則');
    this.enabled=new Set(data.enabled);
  }
  async save(data={enabled:[...this.enabled]}){await fs.mkdir(path.dirname(this.file),{recursive:true});await fs.writeFile(this.file,JSON.stringify(data,null,2)+'\n',{encoding:'utf8'});}
  list(){return catalog.map(rule=>({...rule,enabled:this.enabled.has(rule.id)}));}
  has(id){return this.enabled.has(id);}
  rule(id){return known.get(id)||null;}
  async set(id,enabled){
    if(!known.has(id)||typeof enabled!=='boolean')throw new Error('驗證規則設定不合法');
    if(enabled)this.enabled.add(id);else this.enabled.delete(id);
    await this.save();
    return this.list().find(rule=>rule.id===id);
  }
}

module.exports={VerificationRules,catalog};

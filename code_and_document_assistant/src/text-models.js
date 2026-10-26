const crypto=require('node:crypto');
const initialDepths=()=>[{value:'low',label:'低',enabled:true},{value:'medium',label:'中',enabled:true},{value:'high',label:'高',enabled:true}];
const invalid=message=>Object.assign(new Error('MODEL_SELECTION：'+message),{code:'MODEL_SELECTION'});
class TextModels{
  constructor(saved,client){this.saved=saved;this.client=client;this.saved.data.textModelPreferences??=[];}
  settings(owner){
    let settings=this.saved.data.textModelPreferences.find(item=>item.owner===owner);
    if(!settings){
      const config=this.client.config,ready=this.client.mode==='real';
      const profile=ready?{id:crypto.randomUUID(),modelId:config.omitModel?'':config.model,displayName:config.omitModel?'端點指定模型':config.model,enabled:true,sendReasoning:true,defaultEffort:'medium',depths:initialDepths()}:null;
      settings={owner,revision:1,defaultModelId:profile?.id||null,models:profile?[profile]:[]};this.saved.data.textModelPreferences.push(settings);
    }
    if(!settings.models.length&&this.client.mode==='real'){
      const config=this.client.config,profile={id:crypto.randomUUID(),modelId:config.omitModel?'':config.model,displayName:config.omitModel?'端點指定模型':config.model,enabled:true,sendReasoning:true,defaultEffort:'medium',depths:initialDepths()};
      settings.models.push(profile);settings.defaultModelId=profile.id;settings.revision++;
    }
    return settings;
  }
  public(owner){const {owner:_,...settings}=this.settings(owner);return {...structuredClone(settings),available:this.client.mode==='real'};}
  snapshot(profile,effort){
    const depth=profile.depths.find(item=>item.value===effort&&item.enabled);
    if(!profile.enabled)throw invalid('所選模型已停用，請重新選擇');
    if(!depth)throw invalid('所選思考深度已不可用，請重新選擇');
    return {profileId:profile.id,modelId:profile.modelId,displayName:profile.displayName,effort,effortLabel:depth.label,sendReasoning:profile.sendReasoning,omitModel:!profile.modelId};
  }
  selection(owner,conversation){
    const settings=this.settings(owner);
    if(!conversation.modelSelection){
      const profile=settings.models.find(item=>item.id===settings.defaultModelId&&item.enabled);
      if(profile)conversation.modelSelection=this.snapshot(profile,profile.defaultEffort);
    }
    const selected=conversation.modelSelection;
    if(!selected)return {selection:null,valid:false,reason:'請先設定文字模型'};
    const profile=settings.models.find(item=>item.id===selected.profileId);
    try{if(!profile)throw invalid('原先選擇的模型已刪除，請重新選擇');return {selection:this.snapshot(profile,selected.effort),valid:true,reason:null};}
    catch(error){return {selection:structuredClone(selected),valid:false,reason:error.message.replace(/^MODEL_SELECTION：/,'')};}
  }
  resolve(owner,conversation){const result=this.selection(owner,conversation);if(!result.valid)throw invalid(result.reason);return structuredClone(result.selection);}
  async choose(owner,conversation,{profileId,effort}={}){
    const profile=this.settings(owner).models.find(item=>item.id===profileId);if(!profile)throw invalid('找不到所選模型');
    const selection=this.snapshot(profile,effort);const previous=conversation.modelSelection;conversation.modelSelection=selection;
    try{await this.saved.save();}catch(error){conversation.modelSelection=previous;throw error;}
    return {selection,valid:true,reason:null};
  }
  async save(owner,input){
    if(this.client.mode!=='real')throw invalid('請先在服務啟動時設定 AI 端點與金鑰');
    const current=this.settings(owner);
    if(input?.revision!==current.revision)throw invalid('模型清單已更新，請重新開啟管理視窗');
    if(!Array.isArray(input.models)||input.models.length<1||input.models.length>50)throw invalid('模型清單需為 1–50 筆');
    const text=(value,max,label)=>{if(typeof value!=='string'||!value.trim()||value.trim().length>max||/[\u0000-\u001f]/.test(value))throw invalid(label+'格式不符');return value.trim();};
    const models=input.models.map(value=>{
      const id=text(value.id,80,'識別碼'),displayName=text(value.displayName,80,'顯示名稱');
      const modelId=value.modelId===''&&this.client.config.omitModel?'':text(value.modelId,200,'API 模型 ID');
      if(typeof value.enabled!=='boolean'||typeof value.sendReasoning!=='boolean')throw invalid('模型勾選狀態格式不符');
      if(!Array.isArray(value.depths)||!value.depths.length||value.depths.length>16)throw invalid('每個模型需設定 1–16 種思考深度');
      const depths=value.depths.map(depth=>{
        if(typeof depth.enabled!=='boolean'||typeof depth.value!=='string'||! /^[a-z][a-z0-9_-]{0,39}$/.test(depth.value))throw invalid('思考深度 API 值格式不符');
        return {value:depth.value,label:text(depth.label,30,'深度名稱'),enabled:depth.enabled};
      });
      if(new Set(depths.map(depth=>depth.value)).size!==depths.length||!depths.some(depth=>depth.enabled&&depth.value===value.defaultEffort))throw invalid('深度不可重複，且預設深度必須啟用');
      return {id,modelId,displayName,enabled:value.enabled,sendReasoning:value.sendReasoning,defaultEffort:value.defaultEffort,depths};
    });
    if(new Set(models.map(model=>model.id)).size!==models.length||new Set(models.map(model=>model.modelId)).size!==models.length)throw invalid('模型 ID 不可重複');
    if(!models.some(model=>model.id===input.defaultModelId&&model.enabled))throw invalid('請選擇一個已啟用的新對話預設模型');
    const next={owner,revision:current.revision+1,defaultModelId:input.defaultModelId,models},index=this.saved.data.textModelPreferences.indexOf(current);
    this.saved.data.textModelPreferences[index]=next;
    try{await this.saved.save();}catch(error){this.saved.data.textModelPreferences[index]=current;throw error;}
    return this.public(owner);
  }
}
module.exports={TextModels};

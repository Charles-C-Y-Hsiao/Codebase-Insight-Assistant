const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {imageSize}=require('image-size');

const IMAGE_ENDPOINT='https://api.openai.com/v1/images';
const MAX_IMAGE_BYTES=20*1024*1024;
const IMAGE_MODEL_OPTIONS=['gpt-image-2.5-sunburst','gpt-image-1'];
function imageModel(config){return config?.provider==='openai'?config.imageGenerationModel||'': '';}
function imageSlug(prompt){
  const words=String(prompt).match(/[A-Za-z][A-Za-z0-9-]*/g)||[];
  const useful=words.filter(word=>word.length>2&&!/^(please|create|make|image|picture|with|from|this|that|the|and|for|use)$/i.test(word)).slice(0,5);
  if(useful.length)return useful.join('-').toLowerCase().slice(0,64);
  const subject=String(prompt).replace(/^(?:請|幫我|我要|請幫我|製作|產生|生成|畫出|設計|一張|一個|一幅|圖片|圖像|簡報|資訊圖表|的|\s)+/u,'').match(/[\p{Script=Han}]{2,}/u)?.[0];
  return subject?.slice(0,18)||'創作-'+crypto.createHash('sha256').update(prompt).digest('hex').slice(0,8);
}
class ImageCreationService{
  constructor({runtime,model,fetchImpl=fetch,saved}){
    this.base=path.join(runtime,'assistant-state','generated-images');
    this.model=model;this.fetch=fetchImpl;this.saved=saved;this.jobs=new Map();
  }
  status(){return {enabled:!!imageModel(this.model?.config),model:imageModel(this.model?.config)||null,models:IMAGE_MODEL_OPTIONS,provider:this.model?.config?.provider||null};}
  public(job){const {owner,controller,finished,...visible}=job;return visible;}
  find(owner,project,conversation,id){
    const c=this.saved.conversation(owner,project,conversation);
    const job=this.jobs.get(id)||c.jobs.find(item=>item.id===id&&item.kind==='image');
    if(!job||job.owner&&job.owner!==owner||job.projectId!==project||job.conversationId!==conversation)throw new Error('圖片任務不屬於目前對話');
    return job;
  }
  previous(owner,project,conversation,id){
    if(!id)return null;
    const job=this.find(owner,project,conversation,id);
    if(job.status!=='completed'||!job.imageCreation?.fileName)throw new Error('上一版圖片尚未完成');
    return job;
  }
  start({owner,projectId,conversationId,prompt,imageModel:requestedModel,previous=null}){
    const config=this.model?.config,configuredModel=imageModel(config);
    if(!configuredModel)throw new Error('IMAGE_UNAVAILABLE：請在官方 OpenAI AI 設定中指定 imageGenerationModel；目前沒有核准的圖片模型');
    if(requestedModel&&!IMAGE_MODEL_OPTIONS.includes(requestedModel))throw new Error('IMAGE_MODEL_INVALID：圖片模型不在允許清單');
    const model=requestedModel||configuredModel;
    if(typeof prompt!=='string'||!prompt.trim()||prompt.length>12000)throw new Error('圖片提示詞需為 1–12000 字');
    const seriesId=previous?.imageCreation.seriesId||crypto.randomUUID();
    const version=(previous?.imageCreation.version||0)+1;
    if([...this.jobs.values()].some(j=>j.imageCreation?.seriesId===seriesId&&j.status==='running'))throw new Error('此圖片系列正在產生新版本，請稍候');
    const slug=previous?.imageCreation.slug||imageSlug(prompt),job={id:crypto.randomUUID(),kind:'image',owner,projectId,conversationId,question:prompt,status:'running',progress:'正在創作圖片',startedAt:Date.now(),finishedAt:null,plan:[],events:[],iterations:[],tools:[],evidence:[],result:null,ai:{provider:'openai',model,requests:1,usage:[],cost:null},archived:false,imageCreation:{seriesId,slug,version,previousJobId:previous?.id||null,model,prompt,createdAt:new Date().toISOString(),fileName:null,mime:'image/png'},controller:new AbortController()};
    this.jobs.set(job.id,job);
    return this.public(job);
  }
  launch(job,previous){job.finished=this.run(job,previous);}
  async run(job,previous){
    try{
      const config=this.model.config;
      let endpoint=IMAGE_ENDPOINT+'/generations',body,headers={Authorization:config.authPrefix+this.model.imageKey()};
      if(previous){
        const source=await this.readImage(previous);
        const form=new FormData();form.set('model',job.imageCreation.model);form.set('prompt',job.question);form.set('image',new Blob([source],{type:'image/png'}),'previous.png');form.set('output_format','png');
        body=form;endpoint=IMAGE_ENDPOINT+'/edits';
      }else{
        headers['Content-Type']='application/json';body=JSON.stringify({model:job.imageCreation.model,prompt:job.question,output_format:'png'});
      }
      const signal=AbortSignal.any([job.controller.signal,AbortSignal.timeout(180000)]);
      const response=await this.fetch(endpoint,{method:'POST',headers,body,signal,redirect:'error'});
      if(!response.ok){await response.body?.cancel();throw new Error('圖片服務拒絕請求（HTTP '+response.status+'）；請檢查模型權限、額度與格式');}
      const reader=response.body.getReader();let total=0;const chunks=[];
      try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>MAX_IMAGE_BYTES*4/3+1024*1024){await reader.cancel();throw new Error('圖片回應超過大小限制');}chunks.push(value);}}finally{reader.releaseLock();}
      let data;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new Error('圖片回應格式不合法');}
      const encoded=data.data?.[0]?.b64_json;
      if(typeof encoded!=='string'||encoded.length>MAX_IMAGE_BYTES*4/3+16)throw new Error('圖片回應缺少有效的 PNG 內容或超過 20 MB');
      const bytes=Buffer.from(encoded,'base64');
      if(!bytes.length||bytes.length>MAX_IMAGE_BYTES||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new Error('圖片回應不是有效的 PNG');
      const size=imageSize(bytes);if(!size.width||!size.height||size.width*size.height>40000000)throw new Error('圖片尺寸超過限制');
      const directory=path.join(this.base,job.projectId,job.conversationId,job.imageCreation.seriesId);
      await fs.mkdir(directory,{recursive:true});
      const name=job.imageCreation.slug+'-v'+job.imageCreation.version+'.png';
      await fs.writeFile(path.join(directory,name),bytes,{flag:'wx',mode:0o600});
      job.imageCreation.fileName=name;job.imageCreation.width=size.width;job.imageCreation.height=size.height;
      await fs.writeFile(path.join(directory,name.slice(0,-4)+'.json'),JSON.stringify(job.imageCreation,null,2),{flag:'wx',mode:0o600});
      job.status='completed';job.progress='圖片創作完成';job.finishedAt=Date.now();job.result={conclusions:['已產生 '+name],facts:[],inferences:[],unknown:[],mock:false};
    }catch(error){
      job.status='partial';job.progress='圖片創作失敗';job.finishedAt=Date.now();
      job.result={conclusions:[],facts:[],inferences:[],unknown:[job.controller.signal.aborted?'圖片創作已取消':/圖片服務拒絕|圖片回應|圖片尺寸/.test(error.message)?error.message:'圖片產生或保存失敗，請檢查服務設定'],mock:false};
    }finally{await this.saved.record(job);}
  }
  async readImage(job){
    const image=job.imageCreation;
    if(!image?.fileName||!/^[\w\p{Script=Han}-]+-v\d+\.png$/u.test(image.fileName)||!(/^[0-9a-f-]{36}$/i.test(image.seriesId)))throw new Error('圖片檔案名稱不合法');
    return fs.readFile(path.join(this.base,job.projectId,job.conversationId,image.seriesId,image.fileName));
  }
  cancel(job){if(job.status==='running'){job.controller.abort();job.progress='正在取消圖片創作';}return this.public(job);}
}
module.exports={ImageCreationService,imageSlug};

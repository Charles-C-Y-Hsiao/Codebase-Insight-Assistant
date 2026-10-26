const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');

const WINDOWS_RESERVED=/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
function projectSuffix(id){if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))throw new Error('圖片專案識別碼格式不合法');return id.split('-').at(-1).slice(-11).toLowerCase();}
function sanitizeProjectName(value){let name=String(value||'').normalize('NFKC').replace(/[<>:"/\\|?*\u0000-\u001f]/g,'-').replace(/\s+/g,'-').replace(/-+/g,'-').replace(/^[. -]+|[. -]+$/g,'').slice(0,64).replace(/[. -]+$/g,'');if(WINDOWS_RESERVED.test(name))name='project-'+name;return name;}
function shortName(value){const cleaned=String(value||'').replace(/[\r\n\t]+/g,' ').replace(/\s+/g,' ').replace(/[<>:"/\\|?*]/g,'').trim();return (cleaned||'未命名系列').slice(0,20);}
function emptyMemory(){return {summary:'',version:0,versions:[],lastAppliedJobId:null,sourceJobIds:[],updatedAt:null};}

class ImageProjects{
  constructor({root,saved}){this.root=path.resolve(root);this.saved=saved;for(const item of this.saved.data.imageProjects)this.ensure(item);}
  ensure(item){
    if(typeof item.aiAllowed!=='boolean')item.aiAllowed=true;
    if(!item.memory||typeof item.memory!=='object')item.memory=emptyMemory();
    if(!Array.isArray(item.memory.versions))item.memory.versions=[];if(!Array.isArray(item.memory.sourceJobIds))item.memory.sourceJobIds=[];if(!Number.isSafeInteger(item.memory.version))item.memory.version=0;
    if(!Array.isArray(item.series))item.series=[];
    for(const series of item.series){if(!series.memory||typeof series.memory!=='object')series.memory=emptyMemory();if(!Array.isArray(series.memory.versions))series.memory.versions=[];if(!Array.isArray(series.memory.sourceJobIds))series.memory.sourceJobIds=[];if(!Number.isSafeInteger(series.memory.version))series.memory.version=0;if(!Array.isArray(series.imports))series.imports=[];if(typeof series.manualName!=='boolean')series.manualName=false;}
    return item;
  }
  list(){return this.saved.data.imageProjects.map(item=>this.public(this.ensure(item)));}
  public(item){this.ensure(item);return {id:item.id,name:item.name,folderName:item.folderName,createdAt:item.createdAt,aiAllowed:item.aiAllowed,memory:{...item.memory,versions:item.memory.versions.map(v=>({...v}))},series:item.series.map(series=>({...series,memory:{...series.memory,versions:series.memory.versions.map(v=>({...v}))},imports:series.imports.map(v=>({...v}))}))};}
  item(id){const item=this.saved.data.imageProjects.find(project=>project.id===id);if(!item)throw new Error('找不到圖片創作專案，請重新選擇');return this.ensure(item);}
  find(id){const item=this.item(id),directory=path.resolve(this.root,item.folderName);if(path.dirname(directory).toLowerCase()!==this.root.toLowerCase())throw new Error('圖片專案路徑不合法');return {...this.public(item),directory};}
  series(id,seriesId){const series=this.item(id).series.find(value=>value.id===seriesId);if(!series)throw new Error('找不到圖片系列，請重新選擇');return series;}
  async create({id,name}){
    const suffix=projectSuffix(String(id||''));if(this.saved.data.imageProjects.length>=200)throw new Error('圖片創作專案已達 200 個上限');if(this.saved.data.imageProjects.some(item=>item.id===id))throw new Error('圖片專案已存在');
    const cleaned=sanitizeProjectName(name),folderName=!cleaned||cleaned.toLowerCase()===suffix?suffix:`${cleaned}-${suffix}`;if(this.saved.data.imageProjects.some(item=>item.folderName.toLowerCase()===folderName.toLowerCase()))throw new Error('圖片專案名稱已存在');
    await fs.mkdir(this.root,{recursive:true});const directory=path.resolve(this.root,folderName);if(path.dirname(directory).toLowerCase()!==this.root.toLowerCase())throw new Error('圖片專案路徑不合法');await fs.mkdir(directory,{recursive:false});
    const item={id,name:cleaned&&cleaned.toLowerCase()!==suffix?cleaned:suffix,folderName,createdAt:new Date().toISOString(),aiAllowed:true,memory:emptyMemory(),series:[]};this.saved.data.imageProjects.push(item);
    try{await this.saved.save();}catch(error){this.saved.data.imageProjects.pop();await fs.rmdir(directory).catch(()=>{});throw error;}return this.public(item);
  }
  async rename(id,name){
    const item=this.item(id),suffix=projectSuffix(item.id),cleaned=sanitizeProjectName(name);if(!cleaned||cleaned.toLowerCase()===suffix)throw new Error('請輸入圖片專案名稱');const folderName=`${cleaned}-${suffix}`;if(this.saved.data.imageProjects.some(project=>project.id!==id&&project.folderName.toLowerCase()===folderName.toLowerCase()))throw new Error('圖片專案名稱已存在');
    const before=this.find(id),destination=path.resolve(this.root,folderName);if(path.dirname(destination).toLowerCase()!==this.root.toLowerCase())throw new Error('圖片專案路徑不合法');if(before.folderName!==folderName)await fs.rename(before.directory,destination);const previous={name:item.name,folderName:item.folderName};item.name=cleaned;item.folderName=folderName;
    try{await this.saved.save();}catch(error){Object.assign(item,previous);if(before.folderName!==folderName)await fs.rename(destination,before.directory).catch(()=>{});throw error;}return this.public(item);
  }
  async createSeries(id,{name,sourceJobId}={}){
    const item=this.item(id);if(item.series.length>=200)throw new Error('此圖片專案已達 200 個系列上限');const now=new Date().toISOString(),series={id:crypto.randomUUID(),name:shortName(name),manualName:false,createdAt:now,updatedAt:now,memory:emptyMemory(),imports:[]};if(sourceJobId)series.initialJobId=sourceJobId;item.series.push(series);await this.saved.save();return {...series,memory:{...series.memory}};
  }
  async migrateConversations(conversations){
    let changed=false;
    for(const item of this.saved.data.imageProjects){
      this.ensure(item);const jobs=conversations.flatMap(conversation=>conversation.jobs||[]).filter(job=>job.imageProjectChat?.projectId===item.id||job.imageCreation?.imageProject?.id===item.id);
      for(const job of jobs.filter(job=>job.imageCreation?.seriesId)){const seriesId=job.imageCreation.seriesId;if(!item.series.some(series=>series.id===seriesId)){const now=job.imageCreation.createdAt||new Date(job.startedAt||Date.now()).toISOString();item.series.push({id:seriesId,name:shortName(job.imageCreation.slug||job.question),manualName:false,createdAt:now,updatedAt:now,memory:emptyMemory(),imports:[]});changed=true;}}
      let fallback=item.series.toSorted((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)))[0];
      for(const job of jobs.filter(job=>job.imageProjectChat&&!job.imageProjectChat.seriesId)){if(!fallback){const now=new Date(job.startedAt||Date.now()).toISOString();fallback={id:crypto.randomUUID(),name:shortName(job.question),manualName:false,createdAt:now,updatedAt:now,memory:emptyMemory(),imports:[]};item.series.push(fallback);}job.imageProjectChat.seriesId=fallback.id;job.imageProjectChat.seriesName=fallback.name;changed=true;}
    }
    if(changed)await this.saved.save();return changed;
  }
  async renameSeries(id,seriesId,name,{automatic=false}={}){const series=this.series(id,seriesId);if(series.manualName&&automatic)return series;series.name=shortName(name);series.manualName=!automatic;series.updatedAt=new Date().toISOString();await this.saved.save();return series;}
  async touchSeries(id,seriesId){const series=this.series(id,seriesId);series.updatedAt=new Date().toISOString();await this.saved.save();return series;}
  pendingJobs(projectId,seriesId,conversation){const item=this.item(projectId),series=this.series(projectId,seriesId),projectCursor=new Set(item.memory.sourceJobIds),seriesCursor=new Set(series.memory.sourceJobIds);return conversation.jobs.filter(job=>job.status==='completed'&&!(projectCursor.has(job.id)&&seriesCursor.has(job.id))&&((job.imageProjectChat?.projectId===projectId&&job.imageProjectChat?.seriesId===seriesId)||(job.imageCreation?.imageProject?.id===projectId&&job.imageCreation?.seriesId===seriesId)));}
  async applySummaries(id,seriesId,{projectSummary,seriesSummary,sourceJobIds=[]}){
    const item=this.item(id),series=this.series(id,seriesId),now=new Date().toISOString();const apply=(memory,value)=>{if(typeof value!=='string')return;const summary=value.trim().slice(0,6000);memory.version++;memory.summary=summary;memory.updatedAt=now;memory.sourceRemovedAt=null;memory.sourceJobIds=[...new Set([...memory.sourceJobIds,...sourceJobIds])];memory.lastAppliedJobId=sourceJobIds.at(-1)||memory.lastAppliedJobId;memory.versions.push({version:memory.version,summary,sourceJobIds:[...sourceJobIds],appliedAt:now});if(memory.versions.length>30)memory.versions.splice(0,memory.versions.length-30);};apply(item.memory,projectSummary);apply(series.memory,seriesSummary);series.updatedAt=now;await this.saved.save();return this.public(item);
  }
  async removeSeries(id,seriesId){const item=this.item(id),index=item.series.findIndex(series=>series.id===seriesId);if(index<0)throw new Error('找不到圖片系列');const [removed]=item.series.splice(index,1);await this.saved.save();return removed;}
}
module.exports={ImageProjects,projectSuffix,sanitizeProjectName,shortName};

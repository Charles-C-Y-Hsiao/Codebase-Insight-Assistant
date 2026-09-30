const crypto=require('node:crypto');
const {imageSize}=require('image-size');
const MB=1024*1024;
class ImageStore{
  constructor(){this.items=new Map();this.settings=new Map();this.bytes=0;}
  limit(owner){return this.settings.get(owner)||10;}
  setLimit(owner,value){if(!Number.isInteger(value)||value<1||value>20)throw new Error('單張圖片上限須為 1–20 MB');this.settings.set(owner,value);return value;}
  list(owner,project,conversation){return [...this.items.values()].filter(i=>i.owner===owner&&i.project===project&&i.conversation===conversation&&!i.jobId).map(i=>this.meta(i));}
  meta(i){return {id:i.id,name:i.name,mime:i.mime,size:i.buffer.length,width:i.width,height:i.height};}
  get(owner,id){const item=this.items.get(id);if(!item||item.owner!==owner)throw new Error('圖片不存在或已隨服務重啟清除');return item;}
  add(owner,project,conversation,mime,buffer,name='貼入的圖片'){
    if(!Buffer.isBuffer(buffer)||!buffer.length||buffer.length>this.limit(owner)*MB)throw new Error('圖片超過目前單張 '+this.limit(owner)+' MB 上限或內容為空');
    const signatures={'image/png':()=>buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'image/jpeg':()=>buffer[0]===255&&buffer[1]===216&&buffer[2]===255,'image/webp':()=>buffer.toString('ascii',0,4)==='RIFF'&&buffer.toString('ascii',8,12)==='WEBP'};
    if(!signatures[mime]?.())throw new Error('只接受內容與格式一致的 PNG、JPEG、WebP');
    let dimensions;try{dimensions=imageSize(buffer);}catch{throw new Error('無法辨識圖片內容');}
    if(!dimensions.width||!dimensions.height||dimensions.width*dimensions.height>40000000)throw new Error('圖片尺寸不合法或超過 4,000 萬像素');
    if(this.list(owner,project,conversation).length>=5)throw new Error('每次問題最多 5 張圖片');
    if(this.bytes+buffer.length>512*MB)throw new Error('本次服務的圖片暫存已滿，請移除草稿圖片或重啟服務');
    const item={id:crypto.randomUUID(),owner,project,conversation,mime,buffer,name:String(name).slice(0,100),width:dimensions.width,height:dimensions.height};
    this.items.set(item.id,item);this.bytes+=buffer.length;return this.meta(item);
  }
  select(owner,project,conversation,ids){
    if(!Array.isArray(ids)||ids.length>5||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'))throw new Error('圖片清單不合法（最多 5 張）');
    return ids.map(id=>{const i=this.get(owner,id);if(i.project!==project||i.conversation!==conversation||i.jobId)throw new Error('圖片不屬於目前對話草稿');if(i.buffer.length>this.limit(owner)*MB)throw new Error('草稿圖片超過目前設定上限，請移除或調高上限');return i;});
  }
  remove(owner,project,conversation,id){const i=this.get(owner,id);if(i.project!==project||i.conversation!==conversation||i.jobId)throw new Error('只能移除目前草稿的圖片');this.items.delete(id);this.bytes-=i.buffer.length;}
  clearConversation(owner,project,conversation){for(const [id,i] of this.items)if(i.owner===owner&&i.project===project&&i.conversation===conversation){this.bytes-=i.buffer.length;this.items.delete(id);}}
}
module.exports={ImageStore};

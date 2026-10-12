let activeImageViewer=null;
function taskPreviewImages(job){
  const series=job.imageCreation?.seriesId;
  const jobs=series?[...state.taskJobs.values()].filter(j=>j.projectId===job.projectId&&j.conversationId===job.conversationId&&j.imageCreation?.seriesId===series).sort((a,b)=>a.imageCreation.version-b.imageCreation.version):[job];
  const items=[],seen=new Set();
  const add=item=>{if(!seen.has(item.src)){seen.add(item.src);items.push(item);}};
  for(const member of jobs){
    for(const image of member.attachments||[])if(image.available!==false)add({src:'/attachments/'+encodeURIComponent(image.id),width:image.width,height:image.height,alt:image.name});
    const image=member.imageCreation;
    if(member.status==='completed'&&image?.fileName)add({src:'/generated-images/'+encodeURIComponent(member.id),width:image.width,height:image.height,alt:image.slug+' · 第 '+image.version+' 版'});
  }
  return items;
}
function bindImagePreview(img,getImages){
  img.classList.add('image-preview-trigger');img.tabIndex=0;img.setAttribute('role','button');img.setAttribute('aria-label','開啟圖片預覽：'+img.alt);
  const open=async()=>{
    if(img.hidden)return;
    try{
      if(typeof PhotoSwipe!=='function')throw new Error('圖片預覽套件無法載入');
      const images=getImages();let index=images.findIndex(i=>new URL(i.src,location.href).href===img.src);if(index<0)index=0;
      const data=await Promise.all(images.map(async item=>{
        if(item.width&&item.height)return item;
        const loaded=new Image();loaded.src=item.src;await loaded.decode();return {...item,width:loaded.naturalWidth,height:loaded.naturalHeight};
      }));
      if(!data.length)return;if(activeImageViewer)activeImageViewer.close();
      // A modal dialog is in the browser's top layer, so a viewer appended to
      // document.body would render underneath it. Keep previews opened from a
      // dialog inside that dialog's top-layer subtree.
      const host=img.closest('dialog')||document.body;
      const pswp=new PhotoSwipe({dataSource:data,index,appendToEl:host,bgOpacity:0.9,showHideAnimationType:'fade',wheelToZoom:true,loop:false,zoom:false,closeTitle:'關閉',arrowPrevTitle:'上一張',arrowNextTitle:'下一張',errorMsg:'圖片無法載入',padding:{top:72,bottom:86,left:60,right:60}});
      activeImageViewer=pswp;
      pswp.on('uiRegister',()=>{
        pswp.ui.registerElement({name:'zoom-controls',appendTo:'root',onInit:(element)=>{
          const minus=document.createElement('button'),label=document.createElement('span'),plus=document.createElement('button');minus.type=plus.type='button';minus.textContent='−';plus.textContent='+';minus.setAttribute('aria-label','縮小');plus.setAttribute('aria-label','放大');label.setAttribute('aria-live','polite');element.append(minus,label,plus);
          const update=()=>{const slide=pswp.currSlide;if(slide)label.textContent=Math.round(slide.currZoomLevel*100)+'%';};
          const zoom=factor=>{const slide=pswp.currSlide;if(slide)pswp.zoomTo(Math.max(slide.zoomLevels.min,Math.min(slide.zoomLevels.max,slide.currZoomLevel*factor)),undefined,200);};
          minus.onclick=()=>zoom(1/1.25);plus.onclick=()=>zoom(1.25);pswp.on('zoomPanUpdate',update);pswp.on('change',update);
        }});
        pswp.ui.registerElement({name:'image-caption',appendTo:'root',onInit:element=>{const update=()=>{element.textContent=pswp.currSlide?.data.alt||'';};pswp.on('change',update);}});
      });
      pswp.on('destroy',()=>{if(activeImageViewer===pswp)activeImageViewer=null;img.focus();});pswp.init();
    }catch(error){$('notice').textContent=error.message;}
  };
  img.onclick=open;img.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();open();}};
}

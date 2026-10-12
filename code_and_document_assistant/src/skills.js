const catalog={
  'image-planning-chat':{
    id:'image-planning-chat',name:'圖片創作討論',action:'討論圖片',
    description:'只討論圖片主題、構圖、風格、色彩、文字與提示詞，不讀取或修改程式檔案。',
    tools:['finish_image_discussion'],
    prompt:'目前是獨立的圖片創作討論。只能協助釐清圖片主題、構圖、元素、風格、色彩、尺寸、文字與生成提示詞。不得讀取、搜尋、建立或修改任何程式與文件，不得聲稱已生成圖片；使用者勾選「創作圖片」並通過主機確認後才會真正生成。必須使用 finish_image_discussion，在同一次回應中提供給使用者看的 answer、agentUnderstanding、discussion 與可直接交給圖片模型的完整 prompt；若仍需追問，也要依目前已知資訊保存候選內容。沒有收到使用者提及的參考圖片時，discussion 必須明確說明無法觀察，不得捏造視覺細節。facts 必須為空陣列。'
  },
  'clarify-requirements':{
    id:'clarify-requirements',name:'需求釐清',action:'需要釐清',
    description:'針對目前需求一次提出 1–3 個必要問題，整理理解與信心，不修改檔案。',
    tools:['finish'],
    prompt:'目前啟用「需求釐清」技能。先根據對話摘要與最近內容說明目前理解及信心，再一次提出 1–3 個最關鍵問題。不要修改或建立檔案；finish.status 必須是 needs_input，問題放在 conclusions。'
  },
  'plan-task':{
    id:'plan-task',name:'任務規劃',action:'開始規劃',
    description:'把已確認需求拆成小步驟、相依關係、驗收條件與不在範圍內的項目。',
    tools:['search_documents','read_file','calculate','finish'],
    prompt:'目前啟用「任務規劃」技能。使用已確認需求與必要證據，產生小而可驗證的步驟、相依關係、每步驗收條件及明確不在範圍內的項目。只規劃，不修改或建立檔案。'
  },
  'verify-result':{
    id:'verify-result',name:'驗證檢查',action:'開始檢查',
    description:'核對目前成果有哪些證據、哪些只做靜態檢查，以及還缺哪些功能驗證。',
    tools:['search_documents','read_file','calculate','finish'],
    prompt:'目前啟用「驗證檢查」技能。只根據工具取得的證據區分已驗證、未驗證與建議驗收步驟；不可把寫入成功或靜態檢查等同功能驗證。不要修改或建立檔案。'
  }
};
function get(id){const skill=catalog[id];if(!skill)throw new Error('找不到指定技能');return skill;}
function suggest(question=''){
  const q=String(question).trim(),items=[];
  if(!q)return [];
  const ambiguous=q.length<30||/不知道|不確定|怎麼做|如何做|類似|幫我做|想要|可以嗎|需求/.test(q);
  const building=/建立|新增|修改|改成|改為|實作|開發|功能|頁面|程式|重構/.test(q);
  const verifying=/驗證|測試|確認|檢查|完成|正確|問題|錯誤|失敗/.test(q);
  if(ambiguous)items.push({...catalog['clarify-requirements'],reason:'目前描述可能還缺成功條件、限制或不做的範圍。'});
  if(building)items.push({...catalog['plan-task'],reason:'這項需求涉及實作，先拆解步驟與驗收條件可降低返工。'});
  if(verifying)items.push({...catalog['verify-result'],reason:'需求提到測試或結果判斷，適合先區分已有證據與未驗證部分。'});
  if(!items.length)items.push({...catalog['clarify-requirements'],reason:'可先確認目的、成功條件與限制，再決定是否實作。'});
  return items.slice(0,3).map(({prompt,tools,...item})=>item);
}
module.exports={catalog,get,suggest};

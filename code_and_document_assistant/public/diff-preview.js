const before=`const formatStatus = status => {
  if (status === 'ready') return '準備完成';
  return '處理中';
};

export { formatStatus };
`;
const after=`const formatStatus = status => {
  if (status === 'ready') return '準備完成';
  if (status === 'failed') return '處理失敗';
  return '處理中';
};

export { formatStatus };
`;
function useSingleLineNumber(root) {
  root.querySelectorAll('td.d2h-code-linenumber').forEach(cell => {
    const oldNumber=cell.querySelector('.line-num1')?.textContent.trim();
    const newNumber=cell.querySelector('.line-num2')?.textContent.trim();
    if (!oldNumber && !newNumber) return;
    const number=document.createElement('span');
    number.textContent=newNumber||oldNumber;
    cell.replaceChildren(number);
  });
}
function drawPreview() {
  const output=document.querySelector('#diff-preview-output');
  if (!window.Diff || !window.Diff2HtmlUI) {
    output.textContent='Diff2Html CDN 無法載入，請確認網路後重新整理。';
    return;
  }
  const patch=Diff.createTwoFilesPatch('a/status.js','b/status.js',before,after);
  const viewer=new Diff2HtmlUI(output,patch,{drawFileList:false,fileContentToggle:false,outputFormat:'line-by-line',matching:'lines',diffStyle:'word',highlight:true});
  output.replaceChildren(); viewer.draw(); viewer.highlightCode(); useSingleLineNumber(output);
}
drawPreview();

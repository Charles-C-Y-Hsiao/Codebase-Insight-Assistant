const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createApp}=require('../server');
async function main(){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'cda-diff-preview-'));let server,browser;
  try{
    const instance=await createApp({runtime:path.join(root,'runtime')});server=instance.app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    browser=await require('puppeteer').launch({executablePath:process.env.CDA_BROWSER||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,userDataDir:path.join(root,'chrome'),args:['--no-sandbox']});
    const page=await browser.newPage(),assets=new Map();
    for(const name of ['diff.min.js','diff2html-ui-slim.min.js','diff2html.min.css'])assets.set(name,await fs.readFile(path.join(__dirname,'../runtime/viewer-test-assets',name)));
    await page.setRequestInterception(true);page.on('request',request=>{const name=request.url().split('/').pop();if(assets.has(name))request.respond({status:200,contentType:name.endsWith('.css')?'text/css':'application/javascript',body:assets.get(name)});else request.continue();});
    await page.goto('http://127.0.0.1:'+server.address().port+'/diff-preview.html',{waitUntil:'domcontentloaded'});await page.waitForSelector('.d2h-file-wrapper');
    const numbers=await page.$$eval('td.d2h-code-linenumber',cells=>cells.filter(cell=>cell.textContent.trim()).map(cell=>cell.textContent.trim()));
    assert.ok(numbers.length>0);assert.ok(numbers.every(number=>/^\d+$/.test(number)));console.log('PASS: Diff2Html fixed preview uses one line number per row');
  }finally{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});

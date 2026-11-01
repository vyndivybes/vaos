import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {existsSync} from 'node:fs';
import {runBrowser} from '../browser.mjs';
const chromePath=process.env.VAOS_CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/google-chrome'].find(existsSync);
test('real browser blocks page-load POST and unreviewed write paths',{skip:!chromePath,timeout:45000},async()=>{
 const effects=[];
 const fixture=http.createServer((req,res)=>{
  if(req.method==='POST'){effects.push(req.url);res.end('saved');return;}
  res.setHeader('Content-Type','text/html');
  res.end(`<title>Permission fixture</title><body><button onclick="Promise.allSettled([fetch('/save',{method:'POST'}),fetch('/denied',{method:'POST'})]).then(()=>document.body.dataset.done='yes')">Save</button><script>fetch('/save',{method:'POST'}).catch(()=>{});</script></body>`);
 });
 await new Promise(r=>fixture.listen(0,'127.0.0.1',r));
 const url='http://127.0.0.1:'+fixture.address().port;
 const options={executablePath:chromePath,allowLoopbackForTests:true};
 try{
  await runBrowser({url},options);assert.deepEqual(effects,[]);
  await runBrowser({url,steps:[{action:'click',targetType:'button',target:'Save'}]},options);assert.deepEqual(effects,[]);
  const result=await runBrowser({url,writePaths:['/save'],steps:[{action:'click',targetType:'button',target:'Save'}]},options);
  assert.deepEqual(effects,['/save']);assert.deepEqual(result.permissions.writePaths,['/save']);
 }finally{await new Promise(r=>fixture.close(r));}
});

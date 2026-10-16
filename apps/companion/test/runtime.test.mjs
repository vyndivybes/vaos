import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import http from 'node:http';
import ExcelJS from 'exceljs';
import {PDFDocument} from 'pdf-lib';
import {chromium} from 'playwright';
import {createCompanion} from '../server.mjs';
import {createActions} from '../actions.mjs';
import {skillHash} from '../forge.mjs';
import {runBrowser} from '../browser.mjs';

const enabled=process.env.VAOS_RUNTIME_ACCEPTANCE==='1';
const chromePath=process.env.VAOS_CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/google-chrome','/usr/bin/chromium'].find(existsSync);
test('real Word, Excel, PDF, OCR, browser research/form/download and reviewed skill execution',{skip:!enabled,timeout:180000},async()=>{
 assert.ok(chromePath,'A browser is required for runtime acceptance.');
 assert.ok(process.env.VAOS_COMPANION_PYTHON,'Python with python-docx is required for runtime acceptance.');
 const dir=await mkdtemp(join(tmpdir(),'vaos-runtime-'));
 const app=await createCompanion({dataDir:dir,python:process.env.VAOS_COMPANION_PYTHON,chromePath,allowLoopbackForTests:true});
 const run=createActions({dataDir:dir,store:app.store,python:process.env.VAOS_COMPANION_PYTHON,chromePath,allowLoopbackForTests:true});
 let effects=0;
 const fixture=http.createServer((req,res)=>{
  if(req.method==='POST'){effects++;res.end('saved');return;}
  if(req.url==='/download'){res.writeHead(200,{'Content-Disposition':'attachment; filename="report.txt"','Content-Type':'text/plain'});res.end('downloaded VAOS report');return;}
  res.setHeader('Content-Type','text/html');res.end('<title>VAOS browser fixture</title><body><h1>VAOS TEST REPORT</h1><label>Project<input aria-label="Project"></label><button onclick="fetch(\'/effect\',{method:\'POST\'})">Save</button><a href="/download">Download report</a></body>');
 });
 await new Promise(r=>fixture.listen(0,'127.0.0.1',r));
 const url='http://127.0.0.1:'+fixture.address().port;
 try{
  for(const format of ['docx','xlsx','pdf']){
   const result=await run('document.create',{format,title:'VAOS acceptance',body:'Verified report content'});
   const path=join(dir,'artifacts',result.artifact.id),bytes=await readFile(path);assert.ok(bytes.length>100);
   if(format==='docx'){
    const inspected=spawnSync(process.env.VAOS_COMPANION_PYTHON,[fileURLToPath(new URL('./inspect_word.py',import.meta.url)),path],{encoding:'utf8'});
    assert.equal(inspected.status,0);assert.match(JSON.parse(inspected.stdout).text,/VAOS acceptance.*Verified report content/);
   }
   if(format==='xlsx'){const book=new ExcelJS.Workbook();await book.xlsx.readFile(path);assert.equal(book.worksheets[0].getCell('A2').value,'Verified report content');}
   if(format==='pdf'){const pdf=await PDFDocument.load(bytes);assert.equal(pdf.getPageCount(),1);}
  }
  const browser=await chromium.launch({headless:true,executablePath:chromePath});
  const page=await browser.newPage({viewport:{width:900,height:220}});
  await page.setContent('<html><body style="background:white;color:black;font:48px Arial;padding:30px">VAOS TEST REPORT</body></html>');
  const png=await page.screenshot();await browser.close();
  const ocr=await run('image.ocr',{format:'png',data:png.toString('base64')});assert.match(ocr.text,/VAOS TEST REPORT/i);
  const research=await runBrowser({url},{executablePath:chromePath,allowLoopbackForTests:true});assert.equal(research.title,'VAOS browser fixture');assert.match(research.text,/VAOS TEST REPORT/);assert.equal(effects,0);
  const form=await runBrowser({url,writePaths:['/effect'],steps:[{action:'fill',targetType:'label',target:'Project',value:'VAOS'},{action:'click',targetType:'button',target:'Save'}]},{executablePath:chromePath,allowLoopbackForTests:true});assert.equal(form.stepsCompleted,2);assert.equal(effects,1);
  const path=join(dir,'download.bin');
  const downloaded=await runBrowser({url,steps:[{action:'download',targetType:'link',target:'Download report'}]},{executablePath:chromePath,allowLoopbackForTests:true,artifactPath:path,artifactId:'test.bin'});
  assert.equal(downloaded.download.filename,'report.txt');assert.equal(await readFile(path,'utf8'),'downloaded VAOS report');
  const definition={name:'unique-lines',steps:[{op:'unique-lines'}]};
  app.store.saveSkill({id:'reviewed-test',definition,hash:skillHash(definition),state:'tested'});
  await assert.rejects(run('skill.run',{id:'reviewed-test',text:'a\na'}),/NOT_APPROVED/);
  app.store.saveSkill({id:'reviewed-test',definition,hash:skillHash(definition),state:'approved'});
  assert.equal((await run('skill.run',{id:'reviewed-test',text:'a\na'})).text,'a');
 }finally{await new Promise(r=>fixture.close(r));await app.close();await rm(dir,{recursive:true,force:true});}
});

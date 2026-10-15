import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';
import {createCompanion} from '../server.mjs';
const enabled=process.env.VAOS_UI_ACCEPTANCE==='1';
const chromePath=process.env.VAOS_CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/google-chrome'].find(existsSync);

test('UI pairs, creates a workbook, reviews memory/tools, runs an event routine and fits four screen sizes',{skip:!enabled,timeout:180000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'vaos-ui-'));
 const app=await createCompanion({dataDir:dir,token:'ui-acceptance-token',python:process.env.VAOS_COMPANION_PYTHON,chromePath});
 const {origin}=await app.listen(0);
 const browser=await chromium.launch({headless:true,executablePath:chromePath});
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),page=await context.newPage();
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 try{
  await page.goto(origin+'/#pair=ui-acceptance-token');
  await page.getByText('Local companion connected',{exact:true}).waitFor();
  assert.equal(new URL(page.url()).hash,'');
  await page.locator('[data-panel="documents"]').click();
  await page.locator('#document-form [name=title]').fill('UI workbook');
  await page.locator('#document-form [name=format]').selectOption('xlsx');
  await page.locator('#document-form [name=body]').fill('Part\tQuantity\nRotor\t4');
  await page.locator('#document-form button').click();
  await page.locator('#result-download:not([hidden])').waitFor();
  const download=page.waitForEvent('download');await page.locator('#result-download').click();
  assert.match((await download).suggestedFilename(),/\.xlsx$/);
  await page.locator('[data-panel="memory"]').click();
  await page.locator('#memory-form [name=title]').fill('Test preference');
  await page.locator('#memory-form [name=body]').fill('Use SI units. <img src=x onerror=alert(1)>');
  await page.locator('#memory-form .primary').click();
  await page.getByRole('heading',{name:'Test preference',exact:true}).waitFor();
  assert.equal(await page.locator('img[src="x"]').count(),0);
  await page.locator('#memory-list').getByRole('button',{name:'Edit',exact:true}).click();
  assert.match(await page.locator('#memory-form [name=body]').inputValue(),/SI units/);
  await page.locator('[data-panel="forge"]').click();
  await page.locator('#forge-form [name=name]').fill('clean-list');
  await page.locator('#forge-form [name=purpose]').fill('Remove duplicate lines and sort alphabetically');
  await page.locator('#forge-form button').click();
  await page.getByRole('button',{name:'Approve tested tool'}).click();
  await page.locator('#approved-skills option').waitFor({state:'attached'});
  await page.locator('#skill-run-form [name=text]').fill('c\na\nc');
  await page.locator('#skill-run-form button').click();
  await page.waitForFunction(()=>document.getElementById('result-text').textContent==='a\nc');
  await page.locator('[data-panel="routines"]').click();
  await page.locator('#routine-form [name=title]').fill('Event briefing');
  await page.locator('#routine-form [name=trigger]').selectOption('event');
  await page.locator('#routine-form [name=eventName]').fill('test.ready');
  await page.locator('#routine-form button').click();
  await page.getByRole('heading',{name:'Event briefing',exact:true}).waitFor();
  await page.locator('#event-form [name=name]').fill('test.ready');await page.locator('#event-form button').click();
  await page.waitForFunction(()=>document.getElementById('result-text').textContent.includes('Use SI units'));
  await page.locator('[data-panel="talk"]').click();
  await page.locator('#map-toggle').click();
  await page.waitForTimeout(300);
  for(const width of [320,768,1024,1440]){
   await page.setViewportSize({width,height:1000});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'No horizontal page overflow at '+width);
   if(process.env.VAOS_ACCEPTANCE_DIR){await mkdir(process.env.VAOS_ACCEPTANCE_DIR,{recursive:true});await page.screenshot({path:resolve(process.env.VAOS_ACCEPTANCE_DIR,'vaos-skills-'+width+'.png'),fullPage:true});}
  }
  await page.keyboard.press('Tab');
  assert.ok(await page.evaluate(()=>document.activeElement!==document.body));
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await app.close();await rm(dir,{recursive:true,force:true});}
});

test('browser recording uses the local speech path, releases capture and leaves submission for user review',{skip:!enabled||!process.env.VAOS_VOICE_FIXTURE,timeout:120000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'vaos-voice-ui-'));
 const app=await createCompanion({dataDir:dir,token:'voice-ui-test-token',python:process.env.VAOS_COMPANION_PYTHON,modelDir:process.env.VAOS_COMPANION_MODEL,chromePath});
 const {origin}=await app.listen(0);
 const browser=await chromium.launch({headless:true,executablePath:chromePath,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-audio-capture='+process.env.VAOS_VOICE_FIXTURE]});
 const page=await browser.newPage();
 await page.addInitScript(()=>{
  window.testStreams=[];
  const capture=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia=async constraints=>{const stream=await capture(constraints);window.testStreams.push(stream);return stream;};
 });
 try{
  await page.goto(origin+'/#pair=voice-ui-test-token');
  await page.getByText('Local companion connected',{exact:true}).waitFor();
  assert.equal(app.capabilities.voice,true);
  assert.equal(await page.evaluate(()=>window.testStreams.length),0);
  await page.locator('#record').click();
  await page.locator('#record-stop:not([disabled])').waitFor();
  await page.waitForTimeout(7000);
  await page.locator('#record-stop').click();
  await page.waitForFunction(()=>/local voice recognition test/i.test(document.getElementById('vaos-voice-question').value),{},{timeout:90000});
  assert.equal(await page.evaluate(()=>window.testStreams.every(stream=>stream.getTracks().every(track=>track.readyState==='ended'))),true);
  assert.equal(await page.locator('#vaos-voice-ask').isDisabled(),true,'Local page cannot silently proxy authenticated business questions.');
  assert.equal(app.jobs.list().filter(job=>job.kind==='voice.transcribe').length,1);
 }finally{await browser.close();await app.close();await rm(dir,{recursive:true,force:true});}
});

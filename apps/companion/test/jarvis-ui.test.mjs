import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';
import {createCompanion} from '../server.mjs';
const enabled=process.env.VAOS_UI_ACCEPTANCE==='1';
const chromePath=process.env.VAOS_CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/google-chrome'].find(existsSync);

test('local history UI reviews exact text, approves, recalls citations, fits mobile and deletes',{skip:!enabled,timeout:120000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'vaos-history-ui-'));
 const app=await createCompanion({dataDir:dir,token:'history-ui',python:'missing-python'});const {origin}=await app.listen(0);
 const browser=await chromium.launch({headless:true,executablePath:chromePath}),page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>dialog.accept());
 try{
  await page.goto(origin+'/#pair=history-ui');await page.getByText('Local companion connected',{exact:true}).waitFor();await page.locator('[data-panel="memory"]').click();
  await page.getByText('Conversation history on this computer',{exact:true}).click();
  await page.getByRole('button',{name:'Disconnect memory in this tab',exact:true}).click();
  await page.getByLabel('Local memory address',{exact:true}).fill(origin);
  await page.getByLabel('Local memory pairing code',{exact:true}).fill('history-ui');
  await page.getByRole('button',{name:'Connect local memory',exact:true}).click();
  await page.getByText('Memory connected to local-personal / local-owner.',{exact:true}).waitFor();
  const archive={schemaVersion:1,messages:[{conversationId:'fixture',messageId:'decision',role:'user',text:'Rotor material decision <img src=x onerror=alert(1)> uses steel.',createdAt:new Date().toISOString()}]};
  await page.getByLabel('Authorized conversation export JSON').setInputFiles({name:'authorized-fixture.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(archive))});
  await page.getByRole('button',{name:'Review authorized export',exact:true}).click();await page.locator('details pre').filter({hasText:'reviewHash'}).count();
  await page.getByText('Review the full text and hash below.',{exact:false}).waitFor();
  await page.getByRole('button',{name:'Approve reviewed memory change',exact:true}).click();await page.getByText('"imported":1',{exact:false}).waitFor();
  await page.getByLabel('Search conversation history').fill('Rotor steel');await page.getByRole('button',{name:'Recall history',exact:true}).click();await page.getByText('Unverified source:',{exact:false}).waitFor();
  assert.equal(await page.locator('details img').count(),0);
  for(const width of [320,768,1024,1440]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'overflow at '+width);}
  if(process.env.VAOS_ACCEPTANCE_DIR){await mkdir(process.env.VAOS_ACCEPTANCE_DIR,{recursive:true});await page.screenshot({path:join(process.env.VAOS_ACCEPTANCE_DIR,'jarvis-history.png'),fullPage:true});}
  await page.getByRole('button',{name:'Delete all saved conversations',exact:true}).click();await page.getByText('Saved conversations and pending reviews deleted.',{exact:true}).waitFor();
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await app.close();await rm(dir,{recursive:true,force:true});}
});

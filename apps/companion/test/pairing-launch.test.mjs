import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';
import {createCompanion} from '../server.mjs';
const chrome=['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/google-chrome'].find(existsSync);
test('launcher tab connects without a code prompt, publishes required styles and copies the current code',{skip:!chrome,timeout:45000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'vaos-launch-')),app=await createCompanion({dataDir:dir,python:'not-installed-test-python'});
 const {origin,token}=await app.listen(0);let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:chrome});
  const context=await browser.newContext(),page=await context.newPage(),errors=[];
  // Test the copy handler without touching the user's system clipboard.
  await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async value=>{window.copiedPairingCode=value;}}}));
  page.on('pageerror',e=>errors.push(e.message));
  const missing=[];page.on('response',r=>{if(r.status()===404&&/\.(?:css|mjs)(?:\?|$)/.test(r.url()))missing.push(new URL(r.url()).pathname);});
  await page.goto(origin+'/skills.html#pair='+token);
  await page.getByText('Local companion connected',{exact:true}).waitFor();
  assert.equal(new URL(page.url()).hash,'');
  const overview=page.locator('.va-product-nav').getByRole('link',{name:'Overview',exact:true});
  assert.equal(await overview.getAttribute('href'),'https://vaos.vayushastr.workers.dev/workspace');
  assert.equal(await overview.getAttribute('target'),'_blank');
  await page.getByRole('button',{name:'Copy pairing code',exact:true}).click();
  assert.equal(await page.evaluate(()=>window.copiedPairingCode),token);
  assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
  await page.goto(origin+'/skills.html');
  await page.getByText(/This tab was opened without a pairing code/).waitFor();
  assert.equal(await page.getByRole('button',{name:'Copy pairing code',exact:true}).isVisible(),false);
 }finally{await browser?.close();await app.close();await rm(dir,{recursive:true,force:true});}
});

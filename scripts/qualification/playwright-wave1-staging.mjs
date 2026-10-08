import fs from 'node:fs';
import crypto from 'node:crypto';
import { chromium } from '@playwright/test';

const outDir='qualification-evidence/provider-wave-1-staging/playwright-artifacts';
fs.mkdirSync(outDir,{recursive:true});
const base='http://127.0.0.1:18766';

const browser=await chromium.launch({headless:true});
const context=await browser.newContext();
await context.tracing.start({screenshots:true,snapshots:true});
const page=await context.newPage();

const unauthorized=await page.goto(base+'/private',{waitUntil:'domcontentloaded'});
if(unauthorized?.status()!==401)throw new Error('private endpoint did not reject unauthenticated session');

await page.goto(base+'/login',{waitUntil:'domcontentloaded'});
await page.locator('#username').fill('wave1');
await page.locator('#password').fill('qualified');
await Promise.all([
  page.waitForURL(base+'/private'),
  page.locator('#submit').click(),
]);
if((await page.locator('#status').textContent())!=='authenticated')throw new Error('authenticated session failed');

const screenshotPath=outDir+'/authenticated.png';
const tracePath=outDir+'/trace.zip';
await page.screenshot({path:screenshotPath,fullPage:true});
await context.tracing.stop({path:tracePath});
await browser.close();

function sha256(path){
  return crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');
}
const result={
  sessionAuth:true,
  screenshot:{path:screenshotPath,sha256:sha256(screenshotPath),size:fs.statSync(screenshotPath).size},
  trace:{path:tracePath,sha256:sha256(tracePath),size:fs.statSync(tracePath).size},
};
if(!result.screenshot.size||!result.trace.size)throw new Error('sealed artifact is empty');
fs.writeFileSync('qualification-evidence/provider-wave-1-staging/playwright-artifacts.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));

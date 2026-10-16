import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {chromium} from 'playwright';

export function publicAddress(ip){
 if(isIP(ip)===4){
  const [a,b]=ip.split('.').map(Number);
  return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19));
 }
 // Restrict browser targets to publicly routable IPv4; avoid mapped IPv6 bypasses.
 return false;
}
export async function validateBrowserTarget(value,{lookupHost=lookup,allowLoopbackForTests=false}={}){
 let url;try{url=new URL(value);}catch{throw Error('BROWSER_URL_INVALID');}
 if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.href.length>2000)throw Error('BROWSER_URL_INVALID');
 const host=url.hostname;
 const addresses=isIP(host)?[{address:host}]:await lookupHost(host,{all:true,family:4});
 if(!addresses.length||addresses.some(x=>!publicAddress(x.address)&&!(allowLoopbackForTests&&x.address==='127.0.0.1')))throw Error('BROWSER_PRIVATE_ADDRESS_DENIED');
 return {url,ip:addresses[0].address};
}
// Reviewed network permission is deliberately limited to exact, query-free POST paths.
export function validateWritePaths(paths=[]){
 if(!Array.isArray(paths)||paths.length>4||new Set(paths).size!==paths.length||paths.some(p=>typeof p!=='string'||p.length>200||!/^\/[a-zA-Z0-9_/-]*$/.test(p)||p.startsWith('//')||p.includes('..')))throw Error('BROWSER_WRITE_PATHS_INVALID');
 return [...paths];
}
export function browserRequestAllowed({url,method,origin,writePaths=[],active=false}){
 const target=new URL(url);
 if(target.origin!==origin||!['https:','http:'].includes(target.protocol))return false;
 return ['GET','HEAD'].includes(method)||(active&&method==='POST'&&!target.search&&writePaths.includes(target.pathname));
}
export async function runBrowser(input,{signal,artifactPath,artifactId,executablePath=process.env.VAOS_CHROME_PATH,allowLoopbackForTests=false}={}){
 const {url,ip}=await validateBrowserTarget(input.url,{allowLoopbackForTests});
 const steps=input.steps||[];
 const writePaths=validateWritePaths(input.writePaths);
 let activeStep=false;
 const remainingWrites=new Set(writePaths);
 if(!Array.isArray(steps)||steps.length>8)throw Error('BROWSER_STEPS_INVALID');
 for(const step of steps){
  if(!['fill','click','download'].includes(step.action)||typeof (step.selector||step.target)!=='string'||(step.selector||step.target).length>300)throw Error('BROWSER_STEP_INVALID');
  if(!step.selector&&!['label','button','link'].includes(step.targetType))throw Error('BROWSER_TARGET_INVALID');
  if(step.action==='fill'&&(typeof step.value!=='string'||step.value.length>2000))throw Error('BROWSER_VALUE_INVALID');
 }
 // Local desktop automation must never bypass the hosted business control plane.
 if(steps.length&&(/\.workers\.dev$/i.test(url.hostname)||/vaos|vyndi/i.test(url.hostname)))throw Error('BUSINESS_ACTION_REQUIRES_VAOS_CONTROLS');
 const browser=await chromium.launch({headless:true,executablePath,args:[`--host-resolver-rules=MAP ${url.hostname} ${ip}`,'--force-webrtc-ip-handling-policy=disable_non_proxied_udp']});
 const abort=()=>void browser.close();
 signal?.addEventListener('abort',abort,{once:true});
 try{
  if(signal?.aborted)throw Error('CANCELLED');
  const context=await browser.newContext({acceptDownloads:true,serviceWorkers:'block'});
  await context.routeWebSocket('**/*',socket=>socket.close());
  await context.route('**/*',route=>{
   const request=route.request(),target=new URL(request.url());
   if(!browserRequestAllowed({url:target.href,method:request.method(),origin:url.origin,writePaths:[...remainingWrites],active:activeStep}))return route.abort();
   if(request.method()==='POST')remainingWrites.delete(target.pathname);
   return route.continue();
  });
  const page=await context.newPage();
  page.setDefaultTimeout(15000);
  const response=await page.goto(url.href,{waitUntil:'networkidle',timeout:25000});
  if(!response?.ok())throw Error('BROWSER_PAGE_FAILED');
  let downloadResult=null;
  for(const step of steps){
   if(signal?.aborted)throw Error('CANCELLED');
   const locator=step.selector?page.locator(step.selector):step.targetType==='label'?page.getByLabel(step.target,{exact:true}):page.getByRole(step.targetType,{name:step.target,exact:true});
   if(step.action==='fill')await locator.fill(step.value);
   if(step.action==='click'){activeStep=true;try{await locator.click();await page.waitForLoadState('networkidle',{timeout:5000});}finally{activeStep=false;}}
   if(step.action==='download'){
    const event=page.waitForEvent('download');
    await locator.click();
    const download=await event;
    await download.saveAs(artifactPath);
    downloadResult={id:artifactId,filename:download.suggestedFilename()};
   }
  }
  if(new URL(page.url()).origin!==url.origin)throw Error('BROWSER_REDIRECT_DENIED');
  return {title:await page.title(),url:page.url(),text:(await page.locator('body').innerText()).slice(0,16000),download:downloadResult,stepsCompleted:steps.length,permissions:{origin:url.origin,writePaths,credentials:'ISOLATED_SESSION',sourceAuthority:'UNTRUSTED_PAGE_CONTENT'}};
 }finally{signal?.removeEventListener('abort',abort);await browser.close();}
}

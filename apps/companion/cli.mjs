import {existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createCompanion} from './server.mjs';
const here=dirname(fileURLToPath(import.meta.url));
const chromePath=process.env.VAOS_CHROME_PATH||[
 'C:/Program Files/Google/Chrome/Application/chrome.exe',
 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(existsSync);
const app=await createCompanion({dataDir:resolve(process.env.VAOS_COMPANION_DATA||resolve(here,'.data')),chromePath,modelDir:process.env.VAOS_COMPANION_MODEL});
const {origin,token}=await app.listen(Number(process.env.VAOS_COMPANION_PORT||47831));
console.log('VAOS local companion: '+origin);
if(process.argv.includes('--open')&&process.platform==='win32'){
 spawn('rundll32.exe',['url.dll,FileProtocolHandler',origin+'/#pair='+token],{shell:false,windowsHide:true,stdio:'ignore'});
}else console.log('Pairing code for this session: '+token);
console.log('Microphone, screen capture and desktop actions start only from explicit user controls. Close this process to stop routines.');
for(const event of ['SIGINT','SIGTERM'])process.once(event,async()=>{await app.close();process.exit(0);});

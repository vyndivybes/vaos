import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const worker=fileURLToPath(new URL('./python_worker.py',import.meta.url));
export function pythonOperation(kind,input,{python=process.env.VAOS_COMPANION_PYTHON||'python',signal,timeout=120000}={}){
 return new Promise((resolve,reject)=>{
  if(signal?.aborted)return reject(Error('CANCELLED'));
  const child=spawn(python,[worker],{shell:false,windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,PYTHONIOENCODING:'utf-8'}});
  let output='',settled=false;
  const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);error?reject(error):resolve(result);};
  const abort=()=>{child.kill();finish(Error('CANCELLED'));};
  const timer=setTimeout(()=>{child.kill();finish(Error('PYTHON_TIMEOUT'));},timeout);
  signal?.addEventListener('abort',abort,{once:true});
  child.stdout.on('data',chunk=>{output+=chunk;if(output.length>1000000){child.kill();finish(Error('PYTHON_OUTPUT_TOO_LARGE'));}});
  child.stderr.on('data',()=>{});
  child.on('error',()=>finish(Error('PYTHON_UNAVAILABLE')));
  child.stdin.on('error',()=>{});
  child.on('close',()=>{try{const payload=JSON.parse(output.trim());payload.ok?finish(null,payload.result):finish(Error(payload.error||'PYTHON_FAILED'));}catch{finish(Error('PYTHON_FAILED'));}});
  child.stdin.end(JSON.stringify({kind,input}));
 });
}

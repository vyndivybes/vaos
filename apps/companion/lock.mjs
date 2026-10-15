import {openSync,readFileSync,writeFileSync,closeSync,unlinkSync} from 'node:fs';
import {resolve} from 'node:path';
export function lockDataDirectory(directory){
 const path=resolve(directory,'companion.lock');
 for(let attempt=0;attempt<2;attempt++){
  let handle;
  try{handle=openSync(path,'wx');}
  catch(error){
   if(error.code!=='EEXIST')throw error;
   const owner=Number(readFileSync(path,'utf8'));
   if(!Number.isSafeInteger(owner)||owner<=0)throw Error('COMPANION_DATA_LOCK_INVALID');
   let alive=true;try{process.kill(owner,0);}catch(e){if(e.code==='ESRCH')alive=false;}
   if(alive)throw Error('COMPANION_DATA_IN_USE');
   unlinkSync(path);continue;
  }
  writeFileSync(handle,String(process.pid));closeSync(handle);
  let released=false;
  return ()=>{if(!released){released=true;unlinkSync(path);}};
 }
 throw Error('COMPANION_DATA_IN_USE');
}

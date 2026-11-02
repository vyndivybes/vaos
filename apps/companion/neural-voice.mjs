import {randomUUID} from 'node:crypto';
import {readFile,unlink,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pythonOperation} from './python.mjs';

export async function cleanupNeuralAudio(dataDir){
 for(const name of await readdir(resolve(dataDir,'uploads')))if(/^neural-[a-f0-9-]{36}\.wav$/.test(name))await unlink(resolve(dataDir,'uploads',name));
}

// One bounded synthesis at a time. Audio is temporary and never enters job history.
export function createNeuralVoice({dataDir,python,modelDir,operation=pythonOperation}={}){
 let active=null;
 return {
  cancel(){active?.abort();},
  async synthesize({text,language='en-US'},signal){
   if(typeof text!=='string'||!text.trim()||text.length>600||/[\u0000-\u001f]/.test(text))throw Error('NEURAL_TEXT_INVALID');
   if(!['en','en-US','en-IN'].includes(language))throw Error('NEURAL_LANGUAGE_UNAVAILABLE');
   if(active)throw Error('NEURAL_BUSY');
   const controller=new AbortController();active=controller;
   const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
   const output=resolve(dataDir,'uploads','neural-'+randomUUID()+'.wav');
   try{
    await operation('voice.synthesize',{text,model:modelDir,output},{python,signal:controller.signal,timeout:120000});
    if(controller.signal.aborted)throw Error('CANCELLED');
    const audio=await readFile(output);
    if(audio.length<44||audio.length>12000000||audio.toString('ascii',0,4)!=='RIFF'||audio.toString('ascii',8,12)!=='WAVE')throw Error('NEURAL_AUDIO_INVALID');
    return audio;
   }finally{signal?.removeEventListener('abort',abort);await unlink(output).catch(e=>{if(e.code!=='ENOENT')throw e;});active=null;}
  }
 };
}

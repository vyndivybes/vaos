import {DatabaseSync} from 'node:sqlite';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createElevenLabsSpeech,ELEVENLABS_SAMPLE} from '../integrations/elevenlabs/text-to-speech.mjs';

// The package command loads .env.local before this module runs. Never print or
// persist the key. This explicitly requested audition contains no business data.
if(!process.argv.includes('--generate')){
 console.log('ElevenLabs SDK ready. Generation requires --generate and uses only the fixed public audition after free-plan checks.');
}else{
 const dir=fileURLToPath(new URL('../apps/companion/.data/',import.meta.url));await mkdir(dir,{recursive:true});
 const db=new DatabaseSync(resolve(dir,'elevenlabs-preview.sqlite'));db.exec('PRAGMA secure_delete=ON; CREATE TABLE IF NOT EXISTS budget(id TEXT PRIMARY KEY,value TEXT NOT NULL,version INTEGER NOT NULL)');
 const bucket={
  async get(id){const row=db.prepare('SELECT * FROM budget WHERE id=?').get(id);return row?{etag:String(row.version),json:async()=>JSON.parse(row.value)}:null;},
  async put(id,value,{onlyIf}){
   db.exec('BEGIN IMMEDIATE');
   try{const row=db.prepare('SELECT version FROM budget WHERE id=?').get(id);
    if(onlyIf.etagMatches!==undefined&&String(row?.version)!==onlyIf.etagMatches||onlyIf.etagDoesNotMatch==='*'&&row){db.exec('ROLLBACK');return null;}
    const version=(row?.version||0)+1;db.prepare('INSERT INTO budget VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value,version=excluded.version').run(id,value,version);db.exec('COMMIT');return {etag:String(version)};
   }catch(e){db.exec('ROLLBACK');throw e;}
  }
 };
 try{
  const audio=await createElevenLabsSpeech({env:{...process.env,VAOS_ELEVENLABS_CONTROL:'free-personal-v1',VAOS_ARTIFACTS:bucket},text:ELEVENLABS_SAMPLE});
  const output=resolve(dir,'elevenlabs-free-preview.mp3');await writeFile(output,audio);
  console.log(JSON.stringify({provider:'elevenlabs',model:'eleven_v4',voice:'George',characters:ELEVENLABS_SAMPLE.length,bytes:audio.length,paidUsageAllowed:false,output}));
 }catch(e){console.error(/^ELEVENLABS_[A-Z_]+$/.test(e.message)?e.message:'ELEVENLABS_PREVIEW_FAILED');process.exitCode=1;}finally{db.close();}
}

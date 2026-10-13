import {readFile,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {evaluateJarvisPairs} from '../../intelligence/jarvis-evaluation.mjs';
export async function runEvaluationFile(path){
 if(typeof path!=='string'||!path)throw Error('JARVIS_EVALUATION_FILE_REQUIRED');
 const info=await stat(path);
 if(!info.isFile()||info.size>2*1024*1024)throw Error('JARVIS_EVALUATION_FILE_INVALID');
 const bytes=await readFile(path);
 if(bytes.length>2*1024*1024)throw Error('JARVIS_EVALUATION_FILE_INVALID');
 let input;try{input=JSON.parse(bytes.toString('utf8'))}catch{throw Error('JARVIS_EVALUATION_JSON_INVALID')}
 return evaluateJarvisPairs(input);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==3)throw Error('JARVIS_EVALUATION_FILE_REQUIRED');
  console.log(JSON.stringify(await runEvaluationFile(process.argv[2]),null,2));
 }catch{
  console.error('JARVIS_EVALUATION_HOLD: invalid or unavailable local review file');
  process.exitCode=1;
 }
}

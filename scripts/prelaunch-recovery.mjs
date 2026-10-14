import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export function validateRestoreTarget(env){
 const host=env.PGHOST||'127.0.0.1',database=env.VAOS_RECOVERY_DATABASE;
 if(!['127.0.0.1','localhost','::1'].includes(host)||typeof database!=='string'||!/^vaos_restore_[a-z0-9_]{6,48}$/.test(database))throw Error('FRESH_LOOPBACK_RECOVERY_TARGET_REQUIRED');
 return {...env,PGHOST:host,PGDATABASE:database};
}
export function compareTableFingerprints(source,restored){
 const valid=rows=>Array.isArray(rows)&&rows.length>0&&new Set(rows.map(r=>r.name)).size===rows.length&&rows.every(r=>typeof r.name==='string'&&/^[a-z0-9_]+$/.test(r.name)&&Number.isSafeInteger(r.rows)&&r.rows>=0&&/^[a-f0-9]{64}$/.test(r.sha256||''));
 if(!valid(source)||!valid(restored))throw Error('RECOVERY_FINGERPRINT_MANIFEST_INVALID');
 const byName=new Map(restored.map(r=>[r.name,r]));const mismatches=source.filter(r=>{const other=byName.get(r.name);return !other||r.rows!==other.rows||r.sha256!==other.sha256;}).map(r=>r.name);
 for(const r of restored)if(!source.some(s=>s.name===r.name))mismatches.push(r.name);
 return {tablesCompared:source.length,allMatched:mismatches.length===0,mismatches};
}
function run(command,args,env,{capture=false}={}){
 return new Promise((resolvePromise,reject)=>{const child=spawn(command,args,{env,windowsHide:true,stdio:['ignore',capture?'pipe':'ignore','ignore']});let output='';if(capture)child.stdout.on('data',bytes=>{output+=bytes.toString();if(output.length>1000000)child.kill();});child.once('error',()=>reject(Error('RECOVERY_TOOL_UNAVAILABLE:'+command)));child.once('close',code=>code===0?resolvePromise(output):reject(Error('RECOVERY_STEP_FAILED:'+command)));});
}
export async function restorePrelaunchArchive({archive,expectedSha256,identityFile,expectedTables,outputFile,env=process.env}){
 const target=validateRestoreTarget(env);
 if(!/^[a-f0-9]{64}$/.test(expectedSha256||'')||!archive||!identityFile)throw Error('RECOVERY_ARCHIVE_AND_PROTECTED_IDENTITY_REQUIRED');
 const bytes=await readFile(resolve(archive));if(createHash('sha256').update(bytes).digest('hex')!==expectedSha256)throw Error('RECOVERY_CIPHERTEXT_HASH_MISMATCH');
 // createdb fails if the target already exists. Nothing is dropped or replaced.
 await run('createdb',['--maintenance-db=postgres',target.PGDATABASE],{...target,PGDATABASE:'postgres'});
 await run('psql',['--no-psqlrc','--set','ON_ERROR_STOP=on','-c',"create schema if not exists extensions; create extension if not exists pgcrypto with schema extensions;"],target);
 await new Promise((resolvePromise,reject)=>{
  const decrypt=spawn('age',['-d','-i',resolve(identityFile),resolve(archive)],{env:target,windowsHide:true,stdio:['ignore','pipe','ignore']});
  const restore=spawn('pg_restore',['--exit-on-error','--no-owner','--no-acl','--schema=vaos_private','--dbname',target.PGDATABASE],{env:target,windowsHide:true,stdio:['pipe','ignore','ignore']});
  let decrypted=false,restored=false,settled=false;
  const fail=()=>{if(settled)return;settled=true;decrypt.kill();restore.kill();reject(Error('ISOLATED_RECOVERY_FAILED_INSPECT_TARGET'));};
  decrypt.once('error',fail);restore.once('error',fail);decrypt.stdout.on('error',fail);restore.stdin.on('error',fail);
  decrypt.stdout.pipe(restore.stdin);
  decrypt.once('close',code=>{if(code!==0)return fail();decrypted=true;if(restored&&!settled){settled=true;resolvePromise();}});
  restore.once('close',code=>{if(code!==0)return fail();restored=true;if(decrypted&&!settled){settled=true;resolvePromise();}});
 });
 const names=await run('psql',['--no-psqlrc','--set','ON_ERROR_STOP=on','-At','-c',"select tablename from pg_tables where schemaname='vaos_private' order by tablename collate \"C\""],target,{capture:true});
 const fingerprints=[];
 for(const name of names.trim().split(/\r?\n/).filter(Boolean)){
  if(!/^[a-z0-9_]+$/.test(name))throw Error('RECOVERY_TABLE_ID_INVALID');
  const sql=`select jsonb_build_object('name','${name}','rows',count(*),'sha256',encode(extensions.digest(convert_to(coalesce(string_agg(to_jsonb(t)::text,E'\\n' order by to_jsonb(t)::text collate "C"),''),'UTF8'),'sha256'),'hex'))::text from vaos_private."${name}" t`;
  fingerprints.push(JSON.parse((await run('psql',['--no-psqlrc','--set','ON_ERROR_STOP=on','-At','-c',sql],target,{capture:true})).trim()));
 }
 const comparison=expectedTables?compareTableFingerprints(expectedTables,fingerprints):null;
 if(comparison&&!comparison.allMatched)throw Error('RECOVERY_SOURCE_CONTENT_MISMATCH');
 const report={schemaVersion:'VAOS_ISOLATED_RECOVERY_V1',restoredDatabase:target.PGDATABASE,ciphertextSha256:expectedSha256,
  tableFingerprintAlgorithm:'SHA256_OF_LF_JOINED_C_SORTED_JSONB_ROWS',tables:fingerprints,comparison,
  sourceComparisonPassed:comparison?.allMatched===true,scope:'VAOS_PRIVATE_APPLICATION_SCHEMA_ONLY',
  platformAuthRestored:false,externalFilesRestored:false,productionCutoverAuthorized:false};
 if(outputFile)await writeFile(resolve(outputFile),JSON.stringify(report,null,2),'utf8');return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [archive,expectedSha256,outputFile]=process.argv.slice(2);
 restorePrelaunchArchive({archive,expectedSha256,outputFile,identityFile:process.env.VAOS_RECOVERY_AGE_IDENTITY_FILE}).then(r=>process.stdout.write(JSON.stringify({database:r.restoredDatabase,tables:r.tables.length,sourceComparisonPassed:r.sourceComparisonPassed,productionCutoverAuthorized:false})+'\n')).catch(e=>{process.stderr.write(e.message+'\n');process.exitCode=1;});
}

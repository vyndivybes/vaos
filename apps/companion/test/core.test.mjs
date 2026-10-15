import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore} from '../store.mjs';
import {createJobs,createScheduler} from '../jobs.mjs';
import {proposeSkill,runSkill,skillHash} from '../forge.mjs';
import {publicAddress,validateBrowserTarget} from '../browser.mjs';
import {decodeUpload} from '../actions.mjs';
import {lockDataDirectory} from '../lock.mjs';

test('memory persists, searches literal wildcard text, updates and deletes',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'vaos-memory-')),file=join(dir,'db.sqlite');
 let store=openStore(file);
 const record=store.saveMemory({title:'Project 100%',body:'Private preference'});
 store.close();store=openStore(file);
 assert.equal(store.memories('100%').length,1);
 assert.equal(store.memories('_').length,0);
 store.saveMemory({...record,body:'Updated preference'});
 assert.equal(store.memories('Updated')[0].id,record.id);
 assert.equal(store.deleteMemory(record.id),true);
 assert.equal(store.memories().length,0);store.close();
 assert.equal((await readFile(file)).includes(Buffer.from('Updated preference')),false);
 await rm(dir,{recursive:true,force:true});
});

test('desktop and browser actions require review of exact payload; stopped drafts never run',async()=>{
 const store=openStore(':memory:'),effects=[];
 const jobs=createJobs({store,run:async(kind,input)=>{effects.push(input);return {done:true};}});
 const input={action:'open',app:'notepad'};
 const first=jobs.submit('desktop.action',input);input.app='other';
 assert.equal(first.state,'review');assert.equal(effects.length,0);
 assert.throws(()=>jobs.approve(first.id,'wrong'),/APPROVAL_INVALID/);
 jobs.approve(first.id,first.hash);await jobs.idle();
 assert.deepEqual(effects,[{action:'open',app:'notepad'}]);
 const second=jobs.submit('browser.workflow',{url:'https://example.com'});
 jobs.stop(second.id);
 assert.throws(()=>jobs.approve(second.id,second.hash),/APPROVAL_INVALID/);
 assert.equal(effects.length,1);store.close();
});

test('cancellation rejects late successful completion and does not persist transcripts',async()=>{
 const store=openStore(':memory:');let finish;
 const jobs=createJobs({store,run:()=>new Promise(r=>{finish=r;})});
 const job=jobs.submit('voice.transcribe',{data:'PRIVATE_AUDIO'});
 jobs.stop(job.id);finish({text:'PRIVATE_TRANSCRIPT'});await jobs.idle();
 assert.equal(jobs.get(job.id).state,'stopped');
 assert.equal(jobs.get(job.id).result,undefined);
 assert.doesNotMatch(JSON.stringify(store.jobs()),/PRIVATE/);store.close();
});

test('routine survives restart, deduplicates ticks/events and maps receipt to actual job',async()=>{
 const store=openStore(':memory:');let now=1000;
 const jobs=createJobs({store,clock:()=>now,run:async()=>({text:'briefing'})});
 const scheduler=createScheduler({store,jobs,clock:()=>now});
 store.saveRoutine({id:'routine',title:'Briefing',kind:'memory.briefing',input:{},intervalMs:60000,eventName:null,nextAt:1000});
 scheduler.tick();scheduler.tick();await jobs.idle();
 assert.equal(jobs.list().length,1);
 const receipt=store.db.prepare('SELECT * FROM routine_receipts').get();
 assert.equal(jobs.list()[0].id,receipt.jobId);
 now=61000;scheduler.tick();await jobs.idle();assert.equal(jobs.list().length,2);
 store.saveRoutine({id:'event',title:'On arrival',kind:'memory.briefing',input:{},intervalMs:null,eventName:'arrival',nextAt:null});
 scheduler.event('arrival','same');scheduler.event('arrival','same');await jobs.idle();assert.equal(jobs.list().length,3);store.close();
});

test('generated skills transform text deterministically and reject executable code',()=>{
 const skill=proposeSkill({name:'clean-list',purpose:'trim, remove duplicate lines and sort alphabetically'});
 assert.equal(runSkill(skill,'b\na\nb'),'a\nb');
 assert.equal(skillHash(skill),skillHash(structuredClone(skill)));
 assert.throws(()=>runSkill({name:'unsafe',steps:[{op:'eval',value:'process.exit()'}]},'x'),/DENIED/);
 assert.throws(()=>proposeSkill({name:'send-email',purpose:'send an email'}),/UNSUPPORTED/);
});

test('browser blocks private destinations, credentials, protocols and mixed DNS results',async()=>{
 for(const address of ['127.0.0.1','10.1.2.3','172.16.0.1','192.168.1.1','169.254.169.254','100.100.100.200','::1','::ffff:127.0.0.1'])assert.equal(publicAddress(address),false);
 assert.equal(publicAddress('93.184.216.34'),true);
 await assert.rejects(validateBrowserTarget('https://user:secret@example.com'),/URL_INVALID/);
 await assert.rejects(validateBrowserTarget('file:///c:/windows'),/URL_INVALID/);
 await assert.rejects(validateBrowserTarget('https://example.com',{lookupHost:async()=>[{address:'93.184.216.34'},{address:'10.0.0.1'}]}),/PRIVATE/);
});

test('uploaded image bytes must match declared format and remain bounded',()=>{
 assert.throws(()=>decodeUpload({format:'png',data:Buffer.from('<script>bad</script>').toString('base64')},['png']),/FORMAT/);
 assert.throws(()=>decodeUpload({format:'exe',data:'abc='},['png']),/INVALID/);
});

test('only one companion owns a data directory at a time',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'vaos-lock-'));
 const release=lockDataDirectory(dir);
 assert.throws(()=>lockDataDirectory(dir),/DATA_IN_USE/);
 release();const second=lockDataDirectory(dir);second();
 await rm(dir,{recursive:true,force:true});
});

test('routine events remain pending under backpressure and run once a slot opens',async()=>{
 const store=openStore(':memory:');
 const jobs=createJobs({store,run:async()=>({text:'ready'})});
 const holds=Array.from({length:10},()=>jobs.submit('desktop.action',{action:'open',app:'notepad'}));
 store.saveRoutine({id:'event-routine',title:'Event',kind:'memory.briefing',input:{},intervalMs:null,eventName:'ready',nextAt:null});
 const scheduler=createScheduler({store,jobs});scheduler.event('ready','delivery-1');
 assert.equal(store.events().length,1);
 jobs.stop(holds[0].id);scheduler.tick();await jobs.idle();
 assert.equal(store.events().length,0);
 assert.equal(jobs.list().filter(j=>j.kind==='memory.briefing').length,1);
 scheduler.event('ready','delivery-1');await jobs.idle();
 assert.equal(jobs.list().filter(j=>j.kind==='memory.briefing').length,1);
 jobs.stopAll();store.close();
});

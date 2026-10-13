import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('document acceptance register covers exactly 32 numbered technologies, four learning and ten reliability requirements',async()=>{
 const r=JSON.parse(await readFile(new URL('../../governance/jarvis-x/requirements.json',import.meta.url)));
 const ids=[...Array.from({length:32},(_,i)=>String(i+1).padStart(2,'0')),...Array.from({length:4},(_,i)=>'L'+(i+1)),...Array.from({length:10},(_,i)=>'R'+(i+1))];
 assert.deepEqual(r.requirements.map(x=>x.id),ids);
 assert.match(r.sourceDocumentSha256,/^[a-f0-9]{64}$/);
 for(const x of r.requirements){assert.equal(x.productionAccepted,false);assert.ok(x.acceptance.length>20);assert.ok(['foundation','synthetic_only','pending'].includes(x.coverage));}
});

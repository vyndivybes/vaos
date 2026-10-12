import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createStage8BulkPayload} from './stage8-certificate-bulk-package.mjs';
import {STAGE8_REQUIRED_CHECKS} from '../../apps/web/lib/stage8-qualification-evidence.mjs';
const authKey='aa'.repeat(32),cutoverKey='bb'.repeat(32),revision='cc'.repeat(20);
const now=Date.now();
const a={version:1,environment:'development',revision,issuedAt:now,expiresAt:now+45*60000,
 checks:Object.fromEntries(STAGE8_REQUIRED_CHECKS.map(n=>[n,true])),
 maker:'shyamsundhar1982@gmail.com',checker:'kaaviyam1519@gmail.com'};
const c={version:1,revision,issuedAt:now,expiresAt:now+15*60000,
 founderAuthorized:true,rollbackQualified:true,emergencyDisableQualified:true,businessWritesAllowed:false};
const sign=(key,str)=>createHmac('sha256',Buffer.from(key,'hex')).update(str).digest('hex');
const canonical=JSON.stringify({...a,checks:STAGE8_REQUIRED_CHECKS.map(n=>[n,true])});
const authEnvelope=JSON.stringify({record:a,signature:sign(authKey,canonical)});
const cutoverEnvelope=JSON.stringify({record:c,signature:sign(cutoverKey,JSON.stringify(c))});
const valid={authEnvelope,cutoverEnvelope,authKey,cutoverKey,revision,now};
test('strict allowlist excludes authentication activation and all business writes',()=>{
 const v=createStage8BulkPayload(valid);
 assert.deepEqual(Object.keys(v.payload).sort(),[
 'VAOS_STAGE8_CUTOVER_APPROVAL','VAOS_STAGE8_QUALIFICATION_EVIDENCE',
 'VAOS_STAGE8_CERTIFIED_REVISION']);
 assert.equal(v.payload.VAOS_STAGE8_CERTIFIED_REVISION,revision);
 assert.equal(Object.hasOwn(v.payload,'VAOS_STAGE8_QUALIFICATION_REVISION'),false);
});
test('invalid signer, stale approval and revision mismatch block package',()=>{
 assert.throws(()=>createStage8BulkPayload({...valid,cutoverKey:'dd'.repeat(32)}));
 assert.throws(()=>createStage8BulkPayload({...valid,now:now+16*60000}));
 assert.throws(()=>createStage8BulkPayload({...valid,revision:'ee'.repeat(20)}));
});

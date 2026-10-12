import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {planStage8CertificateInstall} from './stage8-certificate-install-preflight.mjs';
import {STAGE8_REQUIRED_CHECKS} from '../../apps/web/lib/stage8-qualification-evidence.mjs';
const authKey='aa'.repeat(32),cutoverKey='bb'.repeat(32),revision='cc'.repeat(20);
function make(now=Date.now()){
 const a={version:1,environment:'development',revision,issuedAt:now,expiresAt:now+45*60000,
 checks:Object.fromEntries(STAGE8_REQUIRED_CHECKS.map(n=>[n,true])),
 maker:'shyamsundhar1982@gmail.com',checker:'kaaviyam1519@gmail.com'};
 const aCanonical=JSON.stringify({version:1,environment:a.environment,revision:a.revision,
 issuedAt:a.issuedAt,expiresAt:a.expiresAt,checks:STAGE8_REQUIRED_CHECKS.map(n=>[n,a.checks[n]]),
 maker:a.maker,checker:a.checker});
 const c={version:1,revision,issuedAt:now,expiresAt:now+15*60000,founderAuthorized:true,
 rollbackQualified:true,emergencyDisableQualified:true,businessWritesAllowed:false};
 const sign=(key,s)=>crypto.createHmac('sha256',Buffer.from(key,'hex')).update(s).digest('hex');
 return {authEnvelope:JSON.stringify({record:a,signature:sign(authKey,aCanonical)}),
 cutoverEnvelope:JSON.stringify({record:c,signature:sign(cutoverKey,JSON.stringify(c))}),
 authKey,cutoverKey,revision,now};
}
test('verified matching signed certificates make a read-only install plan',()=>{
 const p=planStage8CertificateInstall(make());
 assert.deepEqual(p.requiredBindings,['VAOS_STAGE8_QUALIFICATION_EVIDENCE',
  'VAOS_STAGE8_CERTIFIED_REVISION','VAOS_STAGE8_CUTOVER_APPROVAL']);
 assert.equal(p.productionAuthToggleAllowed,false);
 assert.equal(p.businessWritesAllowed,false);
});
test('wrong keys, wrong revision, and insufficient lifetime fail closed',()=>{
 const v=make();
 for(const bad of [{...v,authKey:'dd'.repeat(32)},
  {...v,cutoverKey:'ee'.repeat(32)},
  {...v,revision:'ff'.repeat(20)},
  {...make(Date.now()-14*60000),now:Date.now()}]){
  assert.throws(()=>planStage8CertificateInstall(bad));
 }
});

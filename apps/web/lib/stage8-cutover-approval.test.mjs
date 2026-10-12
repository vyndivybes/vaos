import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {assessStage8Cutover} from './stage8-cutover-approval.mjs';
const key='ca'.repeat(32),revision='ab'.repeat(20);
function sign(overrides={}){
 const issuedAt=Date.now();
 const record={version:1,revision,issuedAt,expiresAt:issuedAt+60000,
 founderAuthorized:true,rollbackQualified:true,emergencyDisableQualified:true,
 businessWritesAllowed:false,...overrides};
 const canonical=JSON.stringify({version:1,revision:record.revision,issuedAt:record.issuedAt,
 expiresAt:record.expiresAt,founderAuthorized:record.founderAuthorized,
 rollbackQualified:record.rollbackQualified,emergencyDisableQualified:record.emergencyDisableQualified,
 businessWritesAllowed:record.businessWritesAllowed});
 const signature=crypto.createHmac('sha256',Buffer.from(key,'hex')).update(canonical).digest('hex');
 return JSON.stringify({record,signature});
}
const options={key,revision};
test('missing approval and wrong signing key fail closed',()=>{
 assert.equal(assessStage8Cutover(undefined,options).authorized,false);
 assert.equal(assessStage8Cutover(sign(),{...options,key:'ef'.repeat(32)}).authorized,false);
});
test('signed, narrow, safe cutover record qualifies',()=>{
 assert.equal(assessStage8Cutover(sign(),options).authorized,true);
});
test('revoked rollback, disabled emergency control, write permission fail closed',()=>{
 for(const v of [{rollbackQualified:false},{emergencyDisableQualified:false},
  {founderAuthorized:false},{businessWritesAllowed:true}]){
  assert.equal(assessStage8Cutover(sign(v),options).authorized,false);
 }
});
test('scope mismatch, expiry, tamper, and overlong duration fail closed',()=>{
 const cases=[sign({revision:'de'.repeat(20)}),
 sign({issuedAt:Date.now()-180000,expiresAt:Date.now()-120000}),
 sign({expiresAt:Date.now()+3600000}),sign().replace('true','false')];
 for(const raw of cases)assert.equal(assessStage8Cutover(raw,options).authorized,false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { credentialKeyReady, sealActivepiecesCredentials, openActivepiecesCredentials } from './credential-vault.mjs';
const record = { accessToken:'sensitive-access-0123456789', refreshToken:'sensitive-refresh-0123456789', clientId:'client-demo', tokenUrl:'https://cloud.activepieces.com/token', expiresAt:Date.now()+900000 };
const key = () => webcrypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
test('sealed record contains no plaintext OAuth credentials, survives roundtrip',async()=>{
  const secret=await key(), data=await sealActivepiecesCredentials(record,secret);
  assert.equal(credentialKeyReady(secret),true);
  assert.equal(JSON.stringify(data).includes('sensitive'),false);
  assert.deepEqual(await openActivepiecesCredentials(data,secret),record);
  assert.notDeepEqual(data, await sealActivepiecesCredentials(record,secret));
});
test('missing key, extractable key, and wrong CryptoKey deny enrollment',async()=>{
  await assert.rejects(()=>sealActivepiecesCredentials(record,null),/KEY_UNAVAILABLE/);
  const extractable=await webcrypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt','decrypt']);
  assert.equal(credentialKeyReady(extractable),false);
  await assert.rejects(()=>sealActivepiecesCredentials(record,extractable),/KEY_UNAVAILABLE/);
});
test('vault cannot be decrypted with a different key or tampered ciphertext',async()=>{
  const a=await key(),b=await key(),sealed=await sealActivepiecesCredentials(record,a);
  await assert.rejects(()=>openActivepiecesCredentials(sealed,b),/DECRYPTION_FAILED/);
  const changed={...sealed,iv:'AAAAAAAAAAAAAAAA'};
  await assert.rejects(()=>openActivepiecesCredentials(changed,a),/DECRYPTION_FAILED/);
});
test('reject missing refresh and incorrect token endpoint, before encryption',async()=>{
  const k=await key();
  for(const rec of [{...record,refreshToken:''},{...record,tokenUrl:'https://attacker.example/token'}])
    await assert.rejects(()=>sealActivepiecesCredentials(rec,k),/RECORD_INVALID/);
});

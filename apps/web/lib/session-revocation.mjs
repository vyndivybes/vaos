import crypto from 'node:crypto';
import {parseCookies,SESSION_COOKIE,verifySessionToken} from './auth.mjs';

// Existing private R2 bucket provides durable, strongly consistent revocation.
// Only SHA-256 token fingerprints are persisted, never bearer tokens.
const PREFIX='security/stage8/revoked/';
export function hardenedRevocationRequired(env={}){
 return env?.VAOS_AUTH_HARDENED_CONTROL==='dedicated-hmac-v1';
}
export function tokenFingerprint(token){
 return crypto.createHash('sha256').update(String(token)).digest('hex');
}
export async function revokeHardenedCookie(cookieHeader, bucket){
 if(!bucket?.put||!bucket?.get)throw new Error('REVOCATION_STORE_UNAVAILABLE');
 const token=parseCookies(cookieHeader||'')[SESSION_COOKIE];
 const session=verifySessionToken(token);
 if(!session||session.v!==2)return {revoked:false};
 const key=PREFIX+tokenFingerprint(token);
 const expiry=new Date(session.exp*1000);
 await bucket.put(key,'revoked',{customMetadata:{kind:'vaos-session-revocation',expiry:expiry.toISOString()}});
 const stored=await bucket.get(key);
 if(!stored)throw new Error('REVOCATION_READBACK_FAILED');
 return {revoked:true};
}
export async function checkHardenedRevocation(cookieHeader,bucket){
 if(!bucket?.get)throw new Error('REVOCATION_STORE_UNAVAILABLE');
 const token=parseCookies(cookieHeader||'')[SESSION_COOKIE];
 if(!token)return {revoked:false};
 const session=verifySessionToken(token);
 if(!session||session.v!==2)return {revoked:false};
 const record=await bucket.get(PREFIX+tokenFingerprint(token));
 return {revoked:record!==null&&record!==undefined};
}

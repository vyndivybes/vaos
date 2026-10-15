import test from 'node:test';import assert from 'node:assert/strict';
import {resolveFounderGoogleIntent} from './founder-google-intents.mjs';
test('mail from Toray or TANSAM is a bounded Gmail read',()=>{
 assert.deepEqual(resolveFounderGoogleIntent('Any email from Toray?'),{kind:'MAIL',query:'from:Toray'});
 assert.equal(resolveFounderGoogleIntent('Check mail from TANSAM?')?.kind,'MAIL');
 assert.equal(resolveFounderGoogleIntent('delete my email'),null);
});
test('explicit scheduling includes a concrete instant but unrelated writes are excluded',()=>{
 const n=new Date('2026-10-15T08:00:00Z');
 const a=resolveFounderGoogleIntent('Remind me to contact TANSAM tomorrow at 9 AM',n);
 assert.equal(a.kind,'CALENDAR');assert.match(a.title,/contact TANSAM/i);
 assert.match(a.start,/^20\d{2}-/);assert.equal(Date.parse(a.end)-Date.parse(a.start),1800000);
 assert.equal(resolveFounderGoogleIntent('Remind me to contact Toray',n).kind,'NEED_TIME');
 assert.equal(resolveFounderGoogleIntent('Approve an invoice tomorrow at 9 AM',n),null);
});

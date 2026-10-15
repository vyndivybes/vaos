import test from 'node:test';import assert from 'node:assert/strict';
import {resolveFounderGoogleIntent,resolveFounderCalendarReadIntent,formatFounderCalendarEvents} from './founder-google-intents.mjs';
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

test('founder calendar reads route as read-only without catching write or business queries',()=>{
 for(const q of [
  'JARVIS, read my Google Calendar and tell me my upcoming appointments for the next seven days',
  'What is on my calendar this week?',
  'Show my upcoming meetings',
  'Do I have any appointments?'
 ]) assert.deepEqual(resolveFounderCalendarReadIntent(q),{kind:'CALENDAR_READ',days:7},q);
 for(const q of [
  'Schedule a meeting tomorrow at 10 AM',
  'Cancel my Google Calendar appointment',
  'What is the production schedule?',
  'Show sales orders',
  'Read my Gmail'
 ]) assert.equal(resolveFounderCalendarReadIntent(q),null,q);
});
test('calendar formatter reports actual bounded titles and times and an empty calendar',()=>{
 const events=[{title:'Business review',start:'2026-10-19T09:00:00+05:30',end:'2026-10-19T09:30:00+05:30'}];
 const output=formatFounderCalendarEvents({status:'PASS',events,calendarEvents:1,truncated:false});
 assert.match(output,/Business review/);
 assert.match(output,/1 upcoming/);
 assert.match(formatFounderCalendarEvents({status:'PASS',events:[],calendarEvents:0,truncated:false}),/No upcoming events/);
 assert.match(formatFounderCalendarEvents({status:'HOLD',reason:'GOOGLE_SOURCE_UNVERIFIED'}),/could not verify/i);
});

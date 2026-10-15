import test from 'node:test';
import assert from 'node:assert/strict';
import {selectDocumentEvidence} from './g7-source-evidence.mjs';
import {reviewSpecialistExcerpt} from './jarvis-specialist-review.mjs';
import {createVoiceMultiTurnSession} from './voice-multiturn.mjs';

test('knowledge and specialist citations retain matching terms late in long lines',()=>{
 const text='Background information. '.repeat(30)+'Payment terms require invoice review.';
 const evidence=selectDocumentEvidence(text,'Explain payment terms');
 assert.equal(evidence.length,1);
 assert.match(evidence[0].text,/Payment terms/);
 assert.ok(evidence[0].text.length<=260);
 const review=reviewSpecialistExcerpt({domain:'LEGAL',text});
 assert.match(review.checks.find(c=>c.topic==='Payment / consideration').excerpt,/Payment terms/);
 assert.equal(review.workflow.executionAllowed,false);
 assert.equal(review.agentDispatched,false);
 assert.equal(review.score,null);
 assert.ok(review.workflow.requiredInputs.includes('Jurisdiction and relevant dates'));
});

test('marketing preparation requests measured evidence without claiming campaign performance',()=>{
 const report=reviewSpecialistExcerpt({domain:'MARKETING',text:'Our platform helps you save time. Book a demo for teams. Contact us for pricing.'});
 assert.equal(report.ownerAgentId,'commercial');
 assert.equal(report.campaignPerformanceVerified,false);
 assert.equal(report.workflow.executionAllowed,false);
 assert.match(report.workflow.nextSteps.join(' '),/approval before publishing/);
});

test('voice deadline releases a stalled read and suppresses its late result',async()=>{
 let finish,spoken=0;
 const session=createVoiceMultiTurnSession({timeoutMs:10,
  fetchSnapshot:()=>new Promise(resolve=>{finish=resolve;}),
  speak:()=>{spoken++;return true;}});
 session.open('mission-test');session.ask();
 const pending=session.accept('What is the current mission status?');
 // Bound the test itself so a missing implementation fails instead of hanging CI.
 const result=await Promise.race([pending,new Promise(resolve=>setTimeout(()=>resolve('STALLED'),80))]);
 assert.equal(result,false);
 assert.equal(session.state(),'FAILED');
 finish({mission:{id:'mission-test',status:'HOLD'},workPackages:[]});
 await pending;
 assert.equal(spoken,0);
 assert.equal(session.context().length,0);
});

test('cancel settles a read even if the provider never acknowledges abort',async()=>{
 const session=createVoiceMultiTurnSession({fetchSnapshot:()=>new Promise(()=>{}),speak:()=>true});
 session.open('mission-test');session.ask();
 const pending=session.accept('What is the current mission status?');
 session.cancel();
 assert.equal(await pending,false);
 assert.equal(session.state(),'IDLE');
});

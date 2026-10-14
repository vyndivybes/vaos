import test from 'node:test';import assert from 'node:assert/strict';
import {routeKpModules,parseVedmAuthority,buildEngineeringFinding} from './engineering-knowledge.mjs';
const status=`# Current configuration status

**Current issue:** \`00_CONTROL/CURRENT_CONFIGURATION_STATUS_Rev-0.8_20260920-FK75-DEVELOPMENT.md\`
**Status:** CONTROLLED CONFIGURATION VIEW

| Configuration object | Authority state |
|---|---|
| VEDM-301 Rev 5.3.9 Candidate E-K75 | **CONTROLLING FRAME-GEOMETRY AUTHORITY** |
| Rev 5.4 FK75 | **PREFERRED VAEA FORK / FRONT-END DEVELOPMENT FREEZE — NOT RELEASED** |
| VEDM-301 Rev 5.3.8 | **SUPERSEDED GEOMETRY AUTHORITY / HISTORICAL BASELINE** |
| Final Rev-1 | **NOT RELEASED** |

Open decisive gates remain mesh FEA, MATERIAL-01, prototype tests.`;
const register='# Knowledge Pack register\n## KP-13 Engineering Change & Configuration Management\n## KP-14 Risk / Design Authority\n## KP-15 Integration Schema\n## KP-09 Geometry\n## KP-16 Validation\n';
test('VEDM authority requires actual current status and refuses stale or invented release state',()=>{
 const p=parseVedmAuthority(status);
 assert.equal(p.records.length,4);
 assert.match(p.records[0].status,/CONTROLLING FRAME-GEOMETRY AUTHORITY/);
 assert.match(p.records[1].status,/NOT RELEASED/);
 assert.match(p.openGates,/MATERIAL-01/);
 assert.throws(()=>parseVedmAuthority('Historical notes revision 5.3.8'),/VEDM_AUTHORITY_UNVERIFIED/);
});
test('VIBPE knowledge routing uses KP change/geometry methods as advisory only',()=>{
 assert.deepEqual(routeKpModules('What are our present engineering changes?'),['KP-13','KP-14','KP-15']);
 assert.ok(routeKpModules('What is fork tyre clearance?').includes('KP-09'));
 assert.ok(routeKpModules('Check FEA and laminate failure').includes('KP-06'));
});
test('engineering response says what is actually recorded and what remains unverified',()=>{
 const result=buildEngineeringFinding({question:'What are our present engineering changes?',
  vedmStatus:status,knowledgeRegister:register,
  engineeringData:{changeOrders:[{id:'ECO-3',status:'draft',change_class:'geometry',updated_at:'2026-09-26T00:00:00Z'}],
   baselines:[{id:'B-1',status:'released',revision_code:'5.3.9'}]},
  sourceRefs:[{repository:'vayu-shastr/veloxis-engineering-design-manual',path:'CURRENT_CONFIGURATION_STATUS.md',sha:'a'.repeat(40),url:'https://github.com/vayu-shastr/veloxis-engineering-design-manual/blob/'+('a'.repeat(40))+'/CURRENT_CONFIGURATION_STATUS.md'}],
  vibpeAvailable:true});
 assert.equal(result.status,'OBSERVED');
 assert.match(result.answer,/ECO-3.*draft/i);
 assert.match(result.answer,/5\.3\.9.*CONTROLLING FRAME-GEOMETRY AUTHORITY/);
 assert.match(result.answer,/FK75.*NOT RELEASED/);
 assert.match(result.answer,/KP-13/);
 assert.match(result.answer,/MATERIAL-01/);
 assert.doesNotMatch(result.answer,/the design is approved|fully certified/i);
 assert.equal(result.sources.length,1);
});
test('no ECO row is not falsely explained as no engineering development',()=>{
 const x=buildEngineeringFinding({question:'What are the present engineering changes?',vedmStatus:status,
  engineeringData:{changeOrders:[],baselines:[{id:'B1',status:'draft'}]},
  knowledgeRegister:register,sourceRefs:[],vibpeAvailable:false});
 assert.match(x.answer,/no registered ECO rows/i);
 assert.match(x.answer,/does not mean there are no engineering changes/i);
 assert.match(x.answer,/VIBPE.*unavailable/i);
});
test('missing VEDM authority stays HOLD rather than using the KP register or historical baseline to invent truth',()=>{
 const x=buildEngineeringFinding({question:'Current frame revision?',vedmStatus:null,
  engineeringData:{changeOrders:[],baselines:[]},knowledgeRegister:register,sourceRefs:[],vibpeAvailable:true});
 assert.equal(x.status,'HOLD');
 assert.doesNotMatch(x.answer,/5\.3\.9|5\.3\.8|releas(?:ed|e) approved/i);
});
test('unverified source shapes fail closed and never expose engineering free-text notes',()=>{
 assert.throws(()=>buildEngineeringFinding({question:'engineering change status',vedmStatus:status,
  engineeringData:{changeOrders:[{id:'secret',internal_note:'token '+('x'.repeat(100))}],baselines:[]},
  knowledgeRegister:register,sourceRefs:[],vibpeAvailable:true}),/ENGINEERING_DATA_UNVERIFIED/);
});


test('G5 Toray validation question answers from controlling material gate, not production job-card counts',()=>{
 const x=buildEngineeringFinding({question:'Has the proposed Toray carbon prepreg been validated for final production use?',
  vedmStatus:status,engineeringData:{changeOrders:[],baselines:[]},knowledgeRegister:register,sourceRefs:[]});
 assert.match(x.answer,/Toray|prepreg/);
 assert.match(x.answer,/MATERIAL-01/i);
 assert.match(x.answer,/not (?:yet )?established|not released|unverified/i);
 assert.doesNotMatch(x.answer,/production job cards observed/i);
});
test('G5 BOM question separates supplier preparation from actual approved production buying',()=>{
 const x=buildEngineeringFinding({question:'Can we start procurement without a released manufacturing BOM? Explain the limits.',
  vedmStatus:status,engineeringData:{changeOrders:[],baselines:[]},knowledgeRegister:register,sourceRefs:[]});
 assert.match(x.answer,/RFQ|quotation/i);
 assert.match(x.answer,/approved|released/i);
 assert.match(x.answer,/purchase orders/i);
 assert.match(x.answer,/not.*production release|cannot.*production release/i);
});

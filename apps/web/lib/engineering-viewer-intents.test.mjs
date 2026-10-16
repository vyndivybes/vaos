import test from 'node:test';
import assert from 'node:assert/strict';
import {planEngineeringViewerQuestion,describeEngineeringBounds} from './engineering-viewer-intents.mjs';
test('safe engineering viewer commands produce only bounded read-only view changes',()=>{
 assert.deepEqual(planEngineeringViewerQuestion('Jarvis, show me the top view'),{kind:'VIEW',view:'TOP'});
 assert.deepEqual(planEngineeringViewerQuestion('Show a side view'),{kind:'VIEW',view:'SIDE'});
 assert.deepEqual(planEngineeringViewerQuestion('Zoom in'),{kind:'ZOOM',factor:1.3});
 assert.deepEqual(planEngineeringViewerQuestion('Reset the view'),{kind:'VIEW',view:'ISOMETRIC'});
 assert.equal(planEngineeringViewerQuestion('What are the bounds?').kind,'BOUNDS');
});
test('manufacturing release, design edits, and unsupported measurements cannot be authorized',()=>{
 for(const q of ['generate and release the carbon frame','change the geometry then export STEP','approve the new BOM','measure the fork crown clearance']){
  const result=planEngineeringViewerQuestion(q);
  assert.equal(result.kind,'DENY',q);
 }
 assert.equal(planEngineeringViewerQuestion('what is it made of?').kind,'UNKNOWN');
 assert.equal(planEngineeringViewerQuestion('a'.repeat(250)).kind,'DENY');
});
test('bounds are clearly approximate coordinate envelopes, not engineering approval',()=>{
 const mesh={kind:'STEP_REFERENCE_POINTS_ONLY',bounds:{span:[10,20,30],min:[0,0,0],max:[10,20,30]}};
 const m=describeEngineeringBounds(mesh,'mm');
 assert.match(m,/10.*20.*30/);
 assert.match(m,/STEP reference points/i);
 assert.match(m,/declared millimetres/i);
 assert.doesNotMatch(m,/approved|validated|released/i);
 const n=describeEngineeringBounds({...mesh,kind:'BINARY_STL_TRIANGLES'},'UNSPECIFIED');
 assert.match(n,/unspecified/i);
 assert.match(n,/STL triangle/i);
});
test('JARVIS inspection interface includes an explicit local request and no CAD writer',async()=>{
 const {readFile}=await import('node:fs/promises');
 const html=await readFile(new URL('../engineering-viewer.html',import.meta.url),'utf8');
 const ui=await readFile(new URL('../engineering-viewer.mjs',import.meta.url),'utf8');
 assert.ok(html.includes('id="engineering-question"'));
 assert.ok(html.includes('id="engineering-ask"'));
 assert.ok(html.includes('id="engineering-answer"'));
 assert.ok(ui.includes('planEngineeringViewerQuestion'));
 assert.doesNotMatch(ui,/fetch\([^)]*POST|\.put\(/);
});

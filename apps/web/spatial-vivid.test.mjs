import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {
  SPATIAL_SPECTRUM, categoryForSpatialNode, projectSpatialLayout, makeSpatialStars
} from './spatial-visual-model.mjs';
import {FACTORY_SPECTRUM, factorySceneStations} from './factory-three-model.mjs';
import {factoryStationMap, DEMO_VISUAL_SCENARIO} from './lib/advanced-visual-model.mjs';

const read=path=>readFile(new URL(path,import.meta.url),'utf8');
const contrast=(a,b)=>{
 const luminance=hex=>{
  const v=hex.replace('#','').match(/../g).map(h=>parseInt(h,16)/255)
    .map(c=>c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4);
  return v[0]*.2126+v[1]*.7152+v[2]*.0722;
 };
 const x=luminance(a),y=luminance(b);
 return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
};

test('spatial spectrum separates architectural domains without asserting live connections',()=>{
 assert.equal(categoryForSpatialNode('VAOS'),'control');
 assert.equal(categoryForSpatialNode('Graphiti'),'graph');
 assert.equal(categoryForSpatialNode('Obsidian'),'knowledge');
 assert.equal(categoryForSpatialNode('VEDM'),'engineering');
 assert.equal(categoryForSpatialNode('unknown'),'knowledge');
 for(const group of ['control','graph','knowledge','engineering']){
  assert.ok(/^#[0-9a-f]{6}$/i.test(SPATIAL_SPECTRUM[group].hex));
  assert.ok(contrast(SPATIAL_SPECTRUM[group].hex,'#081725')>=4.5,group+' needs readable legend contrast');
 }
});

test('3D layout validates coordinates, preserves labels and creates deterministic atmosphere',()=>{
 const actual=projectSpatialLayout([
  ['VAOS','0px','12px','120px'],['Graphiti','-42px','5px','-20px']
 ]);
 assert.equal(actual.length,2);
 assert.equal(actual[0].id,'VAOS');
 assert.equal(actual[1].category,'graph');
 assert.ok(actual.every(n=>Number.isFinite(n.x)&&Number.isFinite(n.y)&&Number.isFinite(n.z)));
 assert.throws(()=>projectSpatialLayout([['Invalid','oops','0px','0px']]),/coordinate/i);
 assert.throws(()=>projectSpatialLayout([['VAOS','0px','0px','0px'],['VAOS','1px','2px','3px']]),/duplicate/i);
 assert.deepEqual(makeSpatialStars(48),makeSpatialStars(48));
 assert.equal(makeSpatialStars(48).length,48);
 assert.ok(makeSpatialStars(48).every(n=>Number.isFinite(n.x)&&Number.isFinite(n.y)&&Number.isFinite(n.z)));
});

test('3D factory uses validated scenario states, not pretend machine telemetry',()=>{
 const {stations,sourceClass}=factoryStationMap(DEMO_VISUAL_SCENARIO.factory);
 assert.equal(sourceClass,'SIMULATED_TOPOLOGY_NO_MACHINE_TELEMETRY');
 const scene=factorySceneStations(stations);
 assert.equal(scene.length,stations.length);
 for(const station of scene){
  assert.ok(station.id&&station.label);
  assert.ok(FACTORY_SPECTRUM[station.status]);
  assert.ok(Number.isFinite(station.x)&&Number.isFinite(station.y)&&Number.isFinite(station.z));
 }
 assert.throws(()=>factorySceneStations([{id:'x',label:'X',x:0,y:0,z:0,status:'LIVE'}]),/Unsupported/);
});

test('Impeccable audit: readable statuses, reduced motion, responsive and offline Three.js only',async()=>{
 const [html,css,renderer,factory,controller]=await Promise.all([
  read('./spatial-command.html'),read('./spatial-command.css'),read('./spatial-three.mjs'),
  read('./factory-three.mjs'),read('./factory-twin-view.mjs')
 ]);
 assert.match(html,/id="sp-graph-world"/);
 assert.match(html,/CONCEPTUAL RELATIONSHIPS/);
 assert.match(html,/aria-label="Conceptual system colour legend"/);
 assert.match(html,/id="sp-three-toggle"/);
 assert.match(css,/:focus-visible/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/max-width:790px/);
 assert.match(renderer,/await import\('\.\/vendor\/three\.module\.min\.js'\)/);
 assert.match(factory,/await import\('\.\/vendor\/three\.module\.min\.js'\)/);
 assert.match(controller,/await import\('\.\/factory-three\.mjs'\)/);
 assert.match(controller,/Return to 2D/);
 assert.match(controller,/SIMULATED|scenario/i);
 for(const value of [renderer,factory]) {
  assert.doesNotMatch(value,/fetch\(|XMLHttpRequest|https?:\/\//);
  assert.match(value,/\.dispose\(\)/);
  assert.match(value,/prefers-reduced-motion: reduce/);
 }
});


test('all scene modules pass Node ESM syntax verification',()=>{
 for(const file of [
  './spatial-visual-model.mjs','./spatial-three.mjs',
  './factory-three-model.mjs','./factory-three.mjs',
  './factory-twin-view.mjs','./spatial-command.mjs'
 ]){
  const result=spawnSync(process.execPath,['--check',new URL(file,import.meta.url).pathname],{encoding:'utf8'});
  assert.equal(result.status,0,file+' has invalid syntax: '+result.stderr);
 }
});

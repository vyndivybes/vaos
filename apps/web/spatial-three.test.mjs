import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read = name => readFile(new URL(name,import.meta.url),'utf8');

test('Three.js is loaded only on explicit request and uses existing local vendor assets',async()=>{
 const [module,script]=await Promise.all([read('./spatial-three.mjs'),read('./spatial-command.mjs')]);
 assert.match(module,/await import\('\.\/vendor\/three\.module\.min\.js'\)/);
 assert.match(script,/addEventListener\('click',toggleSpatialThree\)/);
 assert.match(script,/await import\('\.\/spatial-three\.mjs'\)/);
 assert.doesNotMatch(module,/https?:\/\//);
 const license=await read('./vendor/THREE-LICENSE.txt');
 assert.match(license,/MIT License/);
});

test('optional Three.js visualization retains 2D fallback and source honesty',async()=>{
 const [markup,script,scene,css]=await Promise.all([
  read('./spatial-command.html'),read('./spatial-command.mjs'),
  read('./spatial-three.mjs'),read('./spatial-command.css')
 ]);
 assert.match(markup,/id="sp-three-toggle"/);
 assert.match(markup,/aria-pressed="false"/);
 assert.match(markup,/id="sp-three-status"[^>]*role="status"/);
 assert.match(markup,/id="sp-graph-world"/);
 assert.match(markup,/CONCEPTUAL RELATIONSHIPS/);
 assert.match(script,/scene\.dispose\(\)/);
 assert.match(script,/threeScene\?\.dispose\(\)/);
 assert.match(script,/3D unavailable\. The accessible 2D topology remains available/);
 assert.match(script,/selectedNode/);
 assert.match(scene,/pointer-events-none|setAttribute\('aria-hidden', 'true'\)/);
 assert.match(scene,/if \(disposed \|\| document\.hidden\) return/);
 assert.match(scene,/sharedGeometry\.dispose\(\)/);
 assert.match(scene,/renderer\.dispose\(\)/);
 assert.match(css,/\.sp-three-canvas/);
 assert.match(css,/pointer-events:none/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});

test('no new credentials, authority endpoints, mutating calls, or synthetic evidence claims',async()=>{
 const scene=await read('./spatial-three.mjs');
 for(const forbidden of ['fetch(', 'XMLHttpRequest', 'localStorage', 'sessionStorage', '/api/', 'POST', 'AUTHENTICATED']) {
  assert.equal(scene.includes(forbidden),false,'unexpected network or authority behavior: '+forbidden);
 }
 assert.match(scene,/No edges, runtime connectivity, source observations or authority are inferred/);
});

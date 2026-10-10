import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCinematicController } from './login-cinematic.mjs';

const load = file => readFileSync(new URL(file, import.meta.url), 'utf8');
function element() {
  const classes = new Set();
  const attrs = new Map();
  const properties = new Map();
  return {
    classList: { add: x=>classes.add(x), contains: x=>classes.has(x) },
    style: { setProperty: (k,v)=>properties.set(k,v) },
    setAttribute: (k,v)=>attrs.set(k,v),
    removeAttribute: k=>attrs.delete(k),
    getAttribute: k=>attrs.get(k) ?? null,
    hasClass: k=>classes.has(k), getStyle: k=>properties.get(k),
    textContent: '',
  };
}
function harness({reduced=false,coarse=false}={}) {
  const scene=element(), portal=element(), portalStatus=element(), dust=element();
  portal.setAttribute('aria-hidden','true');
  const nodes = { '#cinematic-scene':scene, '#cinematic-portal':portal, '#portal-status':portalStatus, '#cinematic-dust':dust };
  const events = new Map();
  const win = {
    innerWidth:1400,innerHeight:900,
    matchMedia: query=>({matches:query.includes('reduced-motion') ? reduced : coarse}),
    addEventListener:(type, fn)=>events.set(type,fn),
    removeEventListener:type=>events.delete(type),
    requestAnimationFrame:fn=>fn(),
  };
  const timers=[];
  const controller=createCinematicController({
    doc:{querySelector: s=>nodes[s] ?? null,createElement:()=>element()},win,
    wait:async ms=>{timers.push(ms)},
  });
  return {controller,nodes,events,timers};
}

test('login markup retains existing secure sign-in controls and exact cinematic art',()=>{
  const html=load('./login.html');
  for(const id of ['login-form','email','password','remember','login-status','submit-button','access-help','cinematic-scene','cinematic-portal'])
    assert.match(html,new RegExp(`id="${id}"`),`missing ${id}`);
  assert.match(html,/\/assets\/vayu-shastr-cinematic\.webp/);
  assert.match(html,/\/login-cinematic\.css/);
  assert.match(html,/\/app\.mjs/);
  assert.match(html,/aria-live="polite"/);
  assert.match(html,/autocomplete="current-password"/);
});

test('login script keeps credential POST and only transitions after authenticated success',()=>{
  const app=load('./app.mjs');
  assert.match(app,/fetch\(["']\/api\/login["']/);
  assert.match(app,/credentials:\s*["']same-origin["']/);
  assert.match(app,/if \(!response\.ok\)/);
  assert.match(app,/await cinematic\.complete\(\)/);
  assert.match(app,/window\.location\.replace\(["']\/workspace\.html["']\)/);
  assert.ok(app.indexOf('if (!response.ok)') < app.indexOf('await cinematic.complete()'));
});

test('stage parallax responds to pointer after initialization and changes three layers',()=>{
  const h=harness();h.controller.start();
  assert.ok(h.events.has('pointermove'));
  h.events.get('pointermove')({clientX:1200,clientY:100});
  assert.match(h.nodes['#cinematic-scene'].getStyle('--parallax-x'),/px$/);
  assert.match(h.nodes['#cinematic-scene'].getStyle('--parallax-y'),/px$/);
  assert.match(h.nodes['#cinematic-scene'].getStyle('--grid-x'),/px$/);
  assert.match(h.nodes['#cinematic-scene'].getStyle('--dust-x'),/px$/);
});

test('successful authentication stages flash, full void and accessible portal',async()=>{
  const h=harness();h.controller.start();await h.controller.complete();
  assert.equal(h.nodes['#cinematic-scene'].hasClass('is-authorized'),true);
  assert.equal(h.nodes['#cinematic-scene'].hasClass('is-void'),true);
  assert.equal(h.nodes['#cinematic-portal'].getAttribute('aria-hidden'),null);
  assert.match(h.nodes['#portal-status'].textContent,/workspace/i);
  assert.deepEqual(h.timers,[850,1850]);
});

test('prefers-reduced-motion disables movement and fast-forwards transitions',async()=>{
  const h=harness({reduced:true});h.controller.start();
  assert.equal(h.events.has('pointermove'),false);
  await h.controller.complete();
  assert.equal(h.nodes['#cinematic-portal'].getAttribute('aria-hidden'),null);
  assert.deepEqual(h.timers,[0,50]);
});

test('CSS includes responsive and reduced-motion safety rules',()=>{
  const css=load('./login-cinematic.css');
  assert.match(css,/prefers-reduced-motion:\s*reduce/);
  assert.match(css,/max-width:\s*820px/);
  assert.match(css,/\.is-authorized/);
  assert.match(css,/\.is-void/);
  assert.match(css,/focus-visible/);
});

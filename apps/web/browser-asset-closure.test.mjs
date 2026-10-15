import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {dirname,relative,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=dirname(fileURLToPath(import.meta.url));
const read=async path=>readFile(resolve(root,path),'utf8');

test('Founder Command and JARVIS browser modules are included in Cloudflare assets',async()=>{
 const ignore=await read('.assetsignore');
 const included=new Set(ignore.split(/\r?\n/).filter(x=>x.startsWith('!lib/')).map(x=>x.slice(1)));
 const html=await read('founder-console.html');
 const starters=[...html.matchAll(/<script\b[^>]*type="module"[^>]*src="([^"]+)"/g)]
  .map(x=>x[1].split('?')[0].replace(/^\//,''));
 assert.ok(starters.includes('founder-console.mjs'));
 assert.ok(starters.includes('jarvis-data-agent.mjs'));
 const visited=new Set();
 async function examine(p){
  assert.ok(!p.startsWith('..'),'Browser imports must not escape the static asset root: '+p);
  if(visited.has(p))return;
  visited.add(p);
  if(p.startsWith('lib/')){
   assert.ok(included.has(p),'Missing published browser dependency: '+p);
  }
  const src=await read(p);
  const imports=[...src.matchAll(/\b(?:import|export)\s+(?:[\s\S]*?\s+from\s*)?['"]([^'"]+)['"]/g)]
   .map(x=>x[1]).filter(x=>x.startsWith('.'));
  for(const dep of imports){
   const dest=relative(root,resolve(root,dirname(p),dep)).split(sep).join('/');
   await examine(dest);
  }
 }
 for(const p of starters)await examine(p);
 assert.ok(visited.has('lib/founder-mission-flow.mjs'));
 assert.ok(visited.has('lib/insight-studio.mjs'));
});

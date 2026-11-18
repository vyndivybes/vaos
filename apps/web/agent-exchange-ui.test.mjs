import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createCloudflareApp} from './cloudflare-worker.mjs';

test('JARVIS Exchange is a first-party VAOS workspace with evidence and semantic-memory sections',async()=>{
 const [html,source,shell]=await Promise.all([
  readFile(new URL('./agent-exchange.html',import.meta.url),'utf8'),
  readFile(new URL('./agent-exchange.mjs',import.meta.url),'utf8'),
  readFile(new URL('./vaos-shell.mjs',import.meta.url),'utf8')
 ]);
 for(const selector of ['jix-agent-rows','jix-communications','jix-memory-status',
  'jix-cognition','jix-multimodal','jix-vaos-source','jix-vyndi-source'])
  assert.match(html,new RegExp('id="'+selector+'"'));
 assert.match(html,/data-exchange-period="daily"/);
 assert.match(html,/data-exchange-period="weekly"/);
 assert.match(html,/data-exchange-period="monthly"/);
 assert.match(html,/vaos-shell\.mjs/);
 assert.match(html,/<section[^>]*data-jarvis-scene/);
 assert.match(html,/<link rel="stylesheet" href="\/vaos-shell\.css">\s*<\/head>/);
 assert.match(shell,/Agent Exchange.*\/agent-exchange\.html/);
 assert.match(source,/\/api\/agent-exchange\?period=/);
 assert.match(html,/agent-authored messages are not yet commissioned/i);
});
test('Agent Exchange HTML is revalidated as a sensitive workspace asset',async()=>{
 const app=createCloudflareApp({apiHandlers:{},assetFetcher:async()=>{
   return new Response('<!doctype html>',{status:200,
    headers:{'Content-Type':'text/html','Cache-Control':'public, max-age=3600'}});
 }});
 const r=await app.fetch(new Request('https://vaos.example/agent-exchange.html'));
 assert.equal(r.status,200);
 assert.equal(r.headers.get('Cache-Control'),'no-store, max-age=0');
});

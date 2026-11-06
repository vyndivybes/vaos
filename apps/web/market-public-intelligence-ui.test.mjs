import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=p=>readFile(new URL(p,import.meta.url),'utf8');
test('founder market cockpit renders official feeds and competitor monitoring with safe DOM',async()=>{
 const [html,js,css,worker,config]=await Promise.all([
  read('./market-intelligence.html'),read('./market-public-intelligence.mjs'),
  read('./market-intelligence.css'),read('./cloudflare-worker.mjs'),read('../../wrangler.jsonc')]);
 for(const id of ['market-worldbank','market-comtrade','market-indicator-backtests',
  'market-competitor-articles','market-public-load','market-public-refresh',
  'market-public-status','market-new-articles']){
  assert.equal([...html.matchAll(new RegExp('id="'+id+'"','g'))].length,1,id);
 }
 assert.match(html,/\/market-public-intelligence\.mjs/);
 assert.match(worker,/'\/api\/market-public-intelligence': marketPublicIntelligence/);
 assert.match(worker,/runScheduledMarketMonitor/);
 assert.match(css,/\.public-market-grid/);
 assert.match(js,/textContent/);
 assert.doesNotMatch(js,/\.innerHTML\s*=/);
 assert.equal(JSON.parse(config).vars.VAOS_MARKET_MONITOR_CONTROL,'founder-daily-readonly-v1');
});

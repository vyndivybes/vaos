import test from 'node:test';import assert from 'node:assert/strict';
import {qualifyPublicHeadlines} from './public-research-evidence.mjs';
const mk=(title,published,publisher='Independent Cycling News',id='a')=>({
 title,url:'https://news.google.com/rss/articles/'+id,published,publisher});
test('external comparison needs distinct fresh publisher citations and remains headline context, never a verified benchmark',()=>{
 const result=qualifyPublicHeadlines([
  mk('Bicycle manufacturing sector update','2026-10-10T09:00:00Z','Outlet A','aaa'),
  mk('Cycle industry supplier strategy','2026-10-11T09:00:00Z','Outlet B','bbb')
 ],{asOf:'2026-10-13'});
 assert.equal(result.status,'MULTI_PUBLISHER_HEADLINES');
 assert.equal(result.items.length,2);
 assert.equal(result.verifiedMarketBenchmark,false);
 assert.equal(result.verifiedSupplierPrice,false);
 assert.deepEqual(result.publishers,['Outlet A','Outlet B']);
});
test('discard stale/future dates and duplicate titles, and never trust source-provided timestamps blindly',()=>{
 const result=qualifyPublicHeadlines([
  mk('Old bicycle market report','2023-10-11','Outlet A','aaa'),
  mk('Future market report','2030-10-13','Outlet B','bbb'),
  mk('Cycle India production plans','2026-10-10','Outlet C','ccc'),
  mk('Cycle India production plans','2026-10-09','Outlet D','ddd'),
  mk('Undated bicycle report','unknown','Outlet E','eee'),
 ],{asOf:'2026-10-13'});
 assert.equal(result.items.length,1);
 assert.equal(result.items[0].publisher,'Outlet C');
 assert.equal(result.status,'SINGLE_HEADLINE_UNVERIFIED');
 assert.ok(result.excluded>=4);
});
test('untrusted publisher does not create trust; never send source titles to model as instructions',()=>{
 const result=qualifyPublicHeadlines([mk('Cycle market overview','2026-10-12','<script>alert(1)</script>','aaa'),
 mk('Bicycle manufacturing report','2026-10-12','<script>alert(1)</script>','bbb')],{asOf:'2026-10-13'});
 assert.equal(result.status,'SINGLE_PUBLISHER_HEADLINES');
 assert.equal(result.verifiedMarketBenchmark,false);
 assert.equal(result.items[0].publisher,'Source unverified');
});
test('invalid URLs and unsupported dates remain unavailable, not a fabricated market comparison',()=>{
 const r=qualifyPublicHeadlines([
  {title:'Bicycle industry price',url:'https://evil.example/collect',published:'2026-10-12T01:00:00Z'},
  {title:'Safe title',url:'https://news.google.com/rss/articles/a',published:'2026-10-12'}],{asOf:'2026-10-13'});
 assert.equal(r.items.length,0);
 assert.equal(r.status,'PUBLIC_EVIDENCE_UNAVAILABLE');
 assert.equal(r.verifiedMarketBenchmark,false);
});

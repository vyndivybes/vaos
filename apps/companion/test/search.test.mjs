import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSearchFeed,searchWeb} from '../search.mjs';
test('RSS search returns bounded attributed snippets; rejects entities and active URLs',()=>{
 const rows=parseSearchFeed('<rss><channel><item><title>One &amp; two</title><link>https://example.com/</link><description>&lt;b&gt;Reference&lt;/b&gt;</description></item><item><title>Bad</title><link>javascript:alert(1)</link></item></channel></rss>');
 assert.deepEqual(rows,[{title:'One & two',url:'https://example.com/',snippet:'Reference'}]);
 assert.throws(()=>parseSearchFeed('<!DOCTYPE rss><rss/>'),/INVALID/);
});
test('search encodes user words in a fixed provider URL and refuses redirects/oversized responses',async()=>{
 let requested;
 const r=await searchWeb('https://localhost & x=1',{fetchImpl:async(url,options)=>{requested=url;assert.equal(options.redirect,'error');return new Response('<rss><channel></channel></rss>',{headers:{'content-type':'text/xml'}});}});
 assert.equal(requested.hostname,'www.bing.com');assert.equal(requested.searchParams.get('q'),'https://localhost & x=1');assert.equal(r.links.length,0);
 await assert.rejects(searchWeb('test',{fetchImpl:async()=>new Response('x'.repeat(1000001),{headers:{'content-type':'text/xml'}})}),/TOO_LARGE/);
});

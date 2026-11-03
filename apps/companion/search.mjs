// Public RSS search uses no account, model or API key. Results are untrusted.
const decode=s=>s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&(?:amp|lt|gt|quot|apos);|&#(?:x[0-9a-f]+|\d+);/gi,e=>{
 const named={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"};
 if(named[e])return named[e];const n=e[2].toLowerCase()==='x'?parseInt(e.slice(3,-1),16):parseInt(e.slice(2,-1),10);
 return Number.isInteger(n)&&n>0&&n<=0x10ffff?String.fromCodePoint(n):'';
});
export function parseSearchFeed(xml){
 if(typeof xml!=='string'||xml.length>1000000||!/<rss\b/i.test(xml)||/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('SEARCH_FEED_INVALID');
 const field=(item,name)=>decode(item.match(new RegExp('<'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)</'+name+'>','i'))?.[1]||'').replace(/<[^>]*>/g,'').trim();
 return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].slice(0,10).map(m=>({title:field(m[1],'title').slice(0,200),url:field(m[1],'link'),snippet:field(m[1],'description').slice(0,1200)})).filter(r=>{try{const u=new URL(r.url);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password&&r.title;}catch{return false;}});
}
export async function searchWeb(query,{signal,fetchImpl=fetch}={}){
 if(typeof query!=='string'||!query.trim()||query.length>300)throw Error('SEARCH_QUERY_INVALID');
 const url=new URL('https://www.bing.com/search');url.searchParams.set('format','rss');url.searchParams.set('q',query.trim());
 const response=await fetchImpl(url,{redirect:'error',signal:AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(20000)]),headers:{Accept:'application/rss+xml, text/xml'}});
 if(!response.ok)throw Error('SEARCH_PROVIDER_UNAVAILABLE');
 if(!/xml/i.test(response.headers.get('content-type')||''))throw Error('SEARCH_FEED_INVALID');
 const reader=response.body.getReader();let size=0,chunks=[];
 try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>1000000)throw Error('SEARCH_RESPONSE_TOO_LARGE');chunks.push(value);}}
 finally{await reader.cancel().catch(()=>{});}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.byteLength;}
 const rows=parseSearchFeed(new TextDecoder().decode(bytes));
 return {title:'Web search: '+query.trim(),url:url.href,links:rows.map(r=>({title:r.title,url:r.url})),text:rows.length?rows.map((r,i)=>(i+1)+'. '+r.title+'\n'+r.url+'\n'+r.snippet).join('\n\n'):'No results returned. Try different search words.',permissions:{sourceAuthority:'UNTRUSTED_SEARCH_RESULTS',provider:'Bing public RSS',paidTokens:0}};
}

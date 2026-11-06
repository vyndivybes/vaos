/** Founder-only case bridge UI. Render untrusted source data with textContent only. */
const byId=id=>document.getElementById(id);
const endpoint='/api/market-case-bridge';
let reader=null;
function node(tag,text){
 const el=document.createElement(tag);
 if(text!==undefined)el.textContent=String(text);
 return el;
}
async function requestCase(params){
 const url=params?endpoint+'?'+new URLSearchParams(params):endpoint;
 const response=await fetch(url,{credentials:'same-origin',cache:'no-store'});
 const payload=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(payload?.error?.code||'CASE_BRIDGE_UNAVAILABLE');
 return payload.data;
}
async function openDocument(caseId,docId,offset=0){
 const panel=byId('private-case-reader'),text=byId('private-case-text');
 panel.hidden=false;text.textContent='Verifying protected source…';
 byId('private-case-next').hidden=true;
 try{
  const data=await requestCase({case:caseId,doc:docId,offset:String(offset)});
  byId('private-case-document-title').textContent=data.sourceFileName;
  text.textContent=data.text;
  reader={caseId,docId,next:data.nextOffset};
  byId('private-case-next').hidden=data.nextOffset===null;
  byId('private-case-status').textContent='Indexed source verified · SHA-256 '+data.sourceSha256+
   ' · research data only, not certified actuals.';
 }catch(error){
  text.textContent='HOLD — source inaccessible';
  byId('private-case-status').textContent='Source HOLD — '+error.message;
 }
}
async function loadCatalog(){
 const root=byId('private-case-catalog'),status=byId('private-case-status');
 status.textContent='Verifying original archives and private indexes…';root.replaceChildren();
 try{
  const data=await requestCase();
  for(const item of data.cases){
   const article=node('article');article.className='private-case-card';
   article.append(node('h3',item.id+' — '+item.title));
   const p=node('p',item.status==='INDEX_VERIFIED'?
    'SOURCE VERIFIED · '+item.documents.length+' indexed original file(s)':
    item.status==='REFERENCE_ONLY'?'Repository case study — original reference only':
    'HOLD — original or extracted source failed integrity checks');
   p.className=item.status==='INDEX_VERIFIED'?'private-case-good':'private-case-hold';
   article.append(p);
   if(item.status==='INDEX_VERIFIED'){
    const ul=node('ul');ul.className='private-case-doc-list';
    for(const doc of item.documents){
     const li=node('li'),btn=node('button','Read source text');
     btn.className='secondary';btn.type='button';
     btn.addEventListener('click',()=>openDocument(item.id,doc.documentId,0));
     li.append(node('span',doc.sourceFileName),btn);ul.append(li);
    }article.append(ul);
    const include=node('button','Use as research reference');
    include.type='button';include.className='tertiary';
    include.addEventListener('click',()=>{
     window.dispatchEvent(new CustomEvent('vaos:case-bridge-reference',
      {detail:{id:item.id}}));
     byId('private-case-status').textContent=item.id+
      ' selected as internal, unverified research context for the next scenario.';
    });
    article.append(include);
   }
   if(item.referenceUrl){
    const a=node('a','Open original source');
    a.href=item.referenceUrl;a.target='_blank';a.rel='noopener noreferrer';
    article.append(a);
   }
   root.append(article);
  }
  status.textContent=data.cases.filter(c=>c.status==='INDEX_VERIFIED').length+
   ' private case-study indexes verified. Google Drive changes require separate refreshed ingestion.';
 }catch(error){status.textContent='Private catalog HOLD — '+error.message;}
}
async function searchCases(event){
 event.preventDefault();
 const out=byId('private-case-results'),status=byId('private-case-status');
 out.replaceChildren();status.textContent='Searching protected source text…';
 try{
  const data=await requestCase({q:byId('private-case-search-input').value.trim()});
  for(const hit of data.results){
   const article=node('article');article.className='private-case-result';
   article.append(node('strong',hit.caseId+' / '+hit.sourceFileName));
   article.append(node('p',hit.quote));
   const button=node('button','Read document');button.type='button';button.className='secondary';
   button.addEventListener('click',()=>openDocument(hit.caseId,hit.documentId,0));
   article.append(button);out.append(article);
  }
  if(!data.results.length)out.append(node('p','No indexed source contains those terms.'));
  status.textContent=data.results.length+' bounded source excerpts · source hypotheses only.';
 }catch(error){status.textContent='Private search HOLD — '+error.message;}
}
byId('private-case-search-form')?.addEventListener('submit',searchCases);
byId('private-case-reader-close')?.addEventListener('click',()=>{
 byId('private-case-reader').hidden=true;reader=null;
});
byId('private-case-next')?.addEventListener('click',()=>{
 if(reader?.next!=null)openDocument(reader.caseId,reader.docId,reader.next);
});
loadCatalog();

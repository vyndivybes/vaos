let historyCursor=null;
document.getElementById('historical-search').addEventListener('submit',async event=>{
 event.preventDefault();
 const source=document.getElementById('historical-source').value;
 const query=document.getElementById('historical-query').value.trim();
 const resultList=document.getElementById('historical-results');
 resultList.replaceChildren();
 historyCursor=null;
 const notice=document.getElementById('historical-search-status');
 if(query.length<3)return;
 let pages=0;
 const lookup=async cursor=>{
  const reply=await fetch('/api/historical-knowledge-search',{
   method:'POST',credentials:'same-origin',cache:'no-store',
   headers:{Accept:'application/json','Content-Type':'application/json'},
   body:JSON.stringify({source,query,...(cursor?{cursor}:{})})
  });
  const body=await reply.json();
  if(!reply.ok)throw Error(body?.error?.code||'SEARCH_UNAVAILABLE');
  if(body?.data?.readOnly!==true||body.data.actionAuthorized!==false)throw Error('SEARCH_RESPONSE_INVALID');
  return body.data;
 };
 try{
  let cursor=null;
  do{
   const data=await lookup(cursor);
   pages++;
   for(const record of data.results||[]){
    const item=document.createElement('article');item.className='knowledge-record';
    const heading=document.createElement('h3');heading.textContent=String(record.label||'Source record');
    const excerpt=document.createElement('p');excerpt.textContent=String(record.excerpt||'');
    const provenance=document.createElement('p');provenance.textContent=String(record.sourceRef||'');
    item.append(heading,excerpt,provenance);resultList.append(item);
   }
   cursor=data.hasMore?data.nextCursor:null;
  }while(cursor&&pages<3);
  notice.textContent='Search inspected '+pages+' encrypted archive page(s), found '+
   resultList.children.length+' matches. Results are bounded; the complete archive is not certified.';
 }catch(error){notice.textContent='History search HOLD · '+String(error.message||'UNAVAILABLE');}
});

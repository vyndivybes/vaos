const ui=document.getElementById('historical-status');
async function requestHistory(source,method){
 const response=await fetch('/api/historical-knowledge-index',{
  method,credentials:'same-origin',cache:'no-store',
  headers:{Accept:'application/json','X-History-Source':source,...(method==='POST'?{'Content-Type':'application/json'}:{})},
  ...(method==='POST'?{body:JSON.stringify({source})}:{})
 });
 const body=await response.json();
 if(!response.ok)throw Error(body?.error?.code||'INDEX_UNAVAILABLE');
 return body.data;
}
async function updateSource(source,method){
 const button=document.getElementById('historical-'+source);
 button.disabled=true;
 try{
  const result=await requestHistory(source,method);
  const summary=result.status+' · '+(result.processed||0)+' encrypted records · '+(result.skipped||0)+' skipped';
  document.getElementById('historical-'+source+'-status').textContent=summary;
  ui.textContent='History index '+source+': '+summary+'. Binary and attachment coverage not certified.';
 }catch(error){
  ui.textContent='History index HOLD: '+String(error.message||'UNAVAILABLE');
 }finally{button.disabled=false;}
}
for(const source of ['gmail','drive']){
 document.getElementById('historical-'+source).addEventListener('click',()=>updateSource(source,'POST'));
 void updateSource(source,'GET');
}

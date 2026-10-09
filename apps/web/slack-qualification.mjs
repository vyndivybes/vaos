const btn=document.getElementById('test');
const display=document.getElementById('result');
const endpoint='/api/slack-qualification';
async function query(method='GET',body){
 const res=await fetch(endpoint,{method,credentials:'same-origin',headers:{
   ...(method==='POST'?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
 const data=await res.json();return {httpStatus:res.status,...data};
}
async function init(){
 try{
  const data=await query();
  if(data.error?.code==='MAKER_REQUIRED'){display.textContent='Sign into VAOS as the commissioning maker and reload this page.';return}
  display.textContent=JSON.stringify(data,null,2);
  if(data.botTokenConfigured){btn.disabled=false;btn.textContent='Send one Slack test'}
 }catch{display.textContent='VAOS endpoint unavailable. Production routing remains disabled.'}
}
btn.addEventListener('click',async()=>{
 btn.disabled=true;btn.textContent='Submitted';
 try{
  const result=await query('POST',{confirm:'run-synthetic-slack-once'});
  display.textContent=JSON.stringify(result,null,2);
 }catch{display.textContent='Request outcome uncertain. Do not retry; inspect #vaos-ops for a message first.'}
});
void init();

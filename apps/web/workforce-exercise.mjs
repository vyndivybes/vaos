const $=id=>document.getElementById(id),KEY='vaos-role-exercise-pending-v1';
let catalog,busy=false;
const node=(tag,text)=>{const e=document.createElement(tag);e.textContent=text;return e;};
async function api(body){
 const response=await fetch('/api/workforce-exercise',{method:body?'POST':'GET',credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
 const value=await response.json();
 if(response.status===401){location.assign('/login');throw Error('Sign in required');}
 if(!response.ok)throw Error(value.error?.code||'Exercise unavailable');
 return value.data;
}
function pending(){try{return JSON.parse(sessionStorage.getItem(KEY)||'null');}catch{return null;}}
function recovery(){
 const p=pending();$('resume').hidden=!p;$('run').disabled=busy||!catalog||Boolean(p);
 $('recovery').textContent=p?'A request has not been confirmed. Retry its existing ID '+p.requestId+' before starting another case.':'';
}
function render(run){
 const output=run.outputs?.[0];if(!output||run.persistenceVerified!==true||output.qualificationGranted!==false)throw Error('Exercise evidence incomplete');
 const details=node('details',''),summary=node('summary',output.employeeId+' · '+run.variant+' · '+output.decision+' · saved');
 details.append(summary,node('p','Findings: '+(output.findings.join(', ')||'No findings in this bounded case.')),
 node('p','Independent review required. Operational qualification: HOLD.'),node('pre',JSON.stringify(run,null,2)));$('results').append(details);
}
async function submit(body){
 sessionStorage.setItem(KEY,JSON.stringify(body));recovery();
 const result=await api(body);render(result);sessionStorage.removeItem(KEY);recovery();return result;
}
async function run(){
 if(busy||pending())return;busy=true;recovery();
 try{
  for(const employeeId of catalog.order){for(const variant of ['challenge','corrected']){
   $('status').textContent='Running '+employeeId+' · '+variant+'…';
   await submit({requestId:crypto.randomUUID(),employeeId,variant});
  }}
  $('status').textContent='32 responses saved and read back. All operational qualifications remain HOLD pending independent acceptance.';
 }catch(error){$('status').textContent=error.message+'. No completion claimed.';}
 finally{busy=false;recovery();}
}
$('run').addEventListener('click',run);
$('resume').addEventListener('click',async()=>{
 if(busy)return;const body=pending();if(!body)return;busy=true;recovery();
 try{await submit(body);$('status').textContent='Saved request reconciled. Review the response before running further cases.';}
 catch(error){$('status').textContent=error.message+'. Retain this request ID.';}
 finally{busy=false;recovery();}
});
try{catalog=await api();$('status').textContent='Sixteen preparation handlers available. This is an isolated software exercise.';recovery();}
catch(error){$('status').textContent=error.message;}

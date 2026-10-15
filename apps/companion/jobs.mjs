import {randomUUID,createHash} from 'node:crypto';
export const supportedKinds=new Set(['document.create','image.ocr','voice.transcribe','browser.research','browser.workflow','desktop.action','memory.briefing','skill.run']);
export const routineKinds=new Set(['document.create','memory.briefing','skill.run']);
export function createJobs({store,run,clock=Date.now}={}){
 const jobs=new Map(),queue=[];let running=false;
 const save=job=>store.saveJob({id:job.id,kind:job.kind,state:job.state,created:job.created,events:job.events});
 const event=(job,message)=>{job.events.push({at:clock(),message});save(job);};
 function view(job){return {id:job.id,kind:job.kind,state:job.state,created:job.created,events:job.events,hash:job.hash,review:job.state==='review'?job.input:undefined,result:job.result,error:job.error};}
 async function pump(){
  if(running)return;running=true;
  try{
   while(queue.length){
    const job=queue.shift();if(job.state!=='queued')continue;
    job.state='running';event(job,'Started');
    const timeout=setTimeout(()=>job.controller.abort(),180000);
    try{
     const result=await run(job.kind,job.input,{signal:job.controller.signal,stage:message=>event(job,message)});
     if(job.controller.signal.aborted)throw Error('CANCELLED');
     job.result=result;job.state='succeeded';event(job,'Result ready');
    }catch(error){
     job.state=job.controller.signal.aborted?'stopped':'failed';
     job.error=job.controller.signal.aborted?'STOPPED':/^[A-Z][A-Z0-9_]{2,90}$/.test(error.message)?error.message:'OPERATION_FAILED';
     event(job,job.state==='stopped'?'Stopped; an action already started may have partial effects.':job.error);
    }finally{clearTimeout(timeout);job.input=null;save(job);}
   }
  }finally{running=false;}
 }
 function submit(kind,input,{id=randomUUID()}={}){
  if(!supportedKinds.has(kind))throw Error('OPERATION_NOT_SUPPORTED');
  if([...jobs.values()].filter(j=>['queued','running','review'].includes(j.state)).length>=10)throw Error('QUEUE_FULL');
  const copy=JSON.parse(JSON.stringify(input||{}));
  if(jobs.size>=200){for(const [key,old] of jobs){if(!['queued','running','review'].includes(old.state)){jobs.delete(key);break;}}}
  const job={id,kind,input:copy,state:['desktop.action','browser.workflow'].includes(kind)?'review':'queued',created:clock(),events:[],controller:new AbortController()};
  job.hash=createHash('sha256').update(JSON.stringify({kind,input:copy})).digest('hex');
  jobs.set(job.id,job);event(job,job.state==='review'?'Review the exact action before it can run.':'Queued');
  if(job.state==='queued')queue.push(job);
  void pump();return view(job);
 }
 return {
  submit,
  canSubmit:()=>[...jobs.values()].filter(j=>['queued','running','review'].includes(j.state)).length<10,
  get:id=>jobs.has(id)?view(jobs.get(id)):store.jobs().find(j=>j.id===id),
  list:()=>store.jobs().map(row=>jobs.has(row.id)?view(jobs.get(row.id)):row),
  approve(id,hash){const job=jobs.get(id);if(!job||job.state!=='review'||job.hash!==hash)throw Error('ACTION_APPROVAL_INVALID');job.state='queued';event(job,'User approved the reviewed action');queue.push(job);void pump();return view(job);},
  stop(id){const job=jobs.get(id);if(!job||!['review','queued','running'].includes(job.state))return false;job.controller.abort();if(job.state!=='running'){job.state='stopped';job.input=null;event(job,'Stopped before execution');}return true;},
  stopAll(){for(const job of jobs.values())this.stop(job.id);},
  async idle(){while(running)await new Promise(r=>setTimeout(r,10));}
 };
}
export function createScheduler({store,jobs,clock=Date.now}={}){
 function dispatch(r,receipt){
  if(!routineKinds.has(r.kind)||store.hasReceipt(receipt))return true;
  if(!jobs.canSubmit())return false;
  const jobId=randomUUID();
  if(store.claimRoutine(r,receipt,jobId,clock()+r.intervalMs))jobs.submit(r.kind,r.input,{id:jobId});
  return true;
 }
 function events(){for(const event of store.events()){let complete=true;for(const id of event.targets){const r=store.routines().find(item=>item.id===id&&item.enabled);if(r&&!dispatch(r,r.id+':event:'+event.id))complete=false;}if(complete)store.completeEvent(event.id);}}
 return {
  tick(){for(const r of store.routines())if(r.enabled&&r.intervalMs&&r.nextAt<=clock())dispatch(r,r.id+':'+r.nextAt);events();},
  event(name,id){store.saveEvent(name+':'+id,store.routines().filter(r=>r.enabled&&r.eventName===name).map(r=>r.id));events();}
 };
}

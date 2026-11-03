import {localCompanion} from './local-neural-speech.mjs';
import {runJarvisTool,formatToolReceipt} from './jarvis-tools.mjs';

export function mountJarvisTools(root){
 if(root.querySelector('[data-jarvis-tools]'))return;
 const details=document.createElement('details');details.setAttribute('data-jarvis-tools','');
 const summary=document.createElement('summary');summary.textContent='Internet & computer tools';details.append(summary);
 const text=document.createElement('p');text.textContent='Pair this computer to search the web, read public pages, create documents or review PC actions. Requests run locally without paid AI tokens. Search queries are sent to Bing public RSS search; pages are untrusted reference material. PC input requires an exact window title and approval.';
 const address=document.createElement('input');address.value='http://127.0.0.1:47831';address.setAttribute('aria-label','Computer companion address');address.placeholder='Local companion address';
 const code=document.createElement('input');code.type='password';code.autocomplete='off';code.setAttribute('aria-label','Computer pairing code');code.placeholder='Pairing code from your local companion';
 const status=document.createElement('p');status.role='status';status.textContent=localCompanion.ready()?'Computer paired in this tab.':'Computer not connected. Start the local companion, then enter its pairing code.';
 const button=(label,action)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',()=>void Promise.resolve().then(action).catch(e=>{status.textContent='Tool unavailable: '+e.message;}));return b;};
 const connect=button('Connect computer',async()=>{
  localCompanion.connect(address.value,code.value);code.value='';
  try{const s=await localCompanion.request('/api/status');status.textContent='Connected. Browser: '+(s.capabilities?.browser?'ready':'not installed')+'. PC controls: '+(s.capabilities?.desktop?'ready':'not installed')+'.';}
  catch(e){localCompanion.disconnect();throw e;}
 });
 const examples=document.createElement('ul');
 for(const label of ['search the web for bicycle tyre standards','read https://example.com','open calculator','type "Hello" in window "Untitled - Notepad"','create pdf titled "Notes" with text "My project notes"']){
  const li=document.createElement('li');li.append(button(label,()=>{root.querySelector('#vaos-voice-question').value=label;root.querySelector('#vaos-voice-question').focus();}));examples.append(li);
 }
 const review=document.createElement('section');review.hidden=true;review.setAttribute('aria-label','Review computer action');
 const payload=document.createElement('pre'),approve=button('Approve this action',()=>{}),reject=button('Cancel action',()=>{});review.append(payload,approve,reject);
 const receipt=document.createElement('pre');receipt.setAttribute('aria-live','polite');receipt.className='va-tool-receipt';
 const download=button('Download file',async()=>{
  if(!artifact)return;
  const response=await localCompanion.download('/api/artifacts/'+encodeURIComponent(artifact.id));
  const url=URL.createObjectURL(response),a=document.createElement('a');a.href=url;a.download=artifact.filename||'VAOS-document';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
 });download.hidden=true;
 let decide=null,artifact=null,active=null;
 const abortReview=()=>{decide?.(false);decide=null;review.hidden=true;};
 approve.onclick=()=>{const fn=decide;decide=null;review.hidden=true;fn?.(true);};
 reject.onclick=abortReview;
 details.append(text,address,code,connect,button('Disconnect computer',()=>{active?.abort();localCompanion.disconnect();status.textContent='Computer disconnected in this tab.';}),examples,review,status,receipt,download);
 root.append(details);
 const unsubscribe=localCompanion.subscribe(()=>{active?.abort();abortReview();artifact=null;download.hidden=true;receipt.textContent='';status.textContent=localCompanion.ready()?'Computer connection changed.':'Computer disconnected.';});
 window.addEventListener('pagehide',()=>{active?.abort();abortReview();unsubscribe();},{once:true});
 return {
  async run(plan,{signal}={}){
   if(!localCompanion.ready()){details.open=true;throw Error('Connect your computer before using internet or PC tools.');}
   const abort=new AbortController();active=abort;
   const cancel=()=>abort.abort();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
   details.open=true;receipt.textContent='';artifact=null;download.hidden=true;
   try{
    const job=await runJarvisTool(plan,{
     request:(...args)=>localCompanion.request(...args),signal:abort.signal,
     onState:j=>{status.textContent=j.state==='review'?'Review the exact action below. Approval must be clicked; speech cannot approve it.':'Task '+j.state+'.';},
     review:(j,s)=>new Promise(resolve=>{
      payload.textContent=JSON.stringify({kind:j.kind,input:j.review},null,2);review.hidden=false;
      let settled=false;const stop=()=>finish(false);
      function finish(value){if(settled)return;settled=true;s.removeEventListener('abort',stop);decide=null;review.hidden=true;resolve(value);}
      decide=finish;s.addEventListener('abort',stop,{once:true});if(s.aborted)stop();
     }),
    });
    if(abort.signal.aborted)throw Error('ABORTED');
    receipt.textContent=formatToolReceipt(job);artifact=job.result?.artifact||null;download.hidden=!artifact;
    status.textContent='Task '+job.state+'.';
    return {text:receipt.textContent,spoken:job.state==='succeeded'?'Your '+(plan.kind.startsWith('browser.')?'web result is ready. Read the source text below.':'computer task is complete. Check the result below.'):'The task did not complete. Check the status below.'};
   }catch(e){if(e.message==='COMPANION_UPDATE_REQUIRED')throw Error('Update and restart your local companion. No task was started.');throw e;}finally{signal?.removeEventListener('abort',cancel);abortReview();if(active===abort)active=null;}
  },
 };
}

// Credentials live only in this page's memory. No cloud synthesis or OS fallback.
let connection=null;
const listeners=new Set();
export const localCompanion={
 ready:()=>connection!==null,
 connect(endpoint,token){
  const url=new URL(endpoint);
  if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.username||url.password||url.pathname!=='/'||url.search||url.hash||typeof token!=='string'||!token.trim())throw Error('PAIRING_INVALID');
  connection={endpoint:url.origin,token:token.trim()};for(const fn of listeners)fn();
 },
 disconnect(){connection=null;for(const fn of listeners)fn();},
 subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);},
 async request(path,{method='GET',data,signal,binary=false}={}){
  if(!connection)throw Error('PAIRING_REQUIRED');
  if(!path.startsWith('/api/'))throw Error('LOCAL_PATH_INVALID');
  const response=await fetch(connection.endpoint+path,{method,headers:{Authorization:'Bearer '+connection.token,...(data===undefined?{}:{'Content-Type':'application/json'})},body:data===undefined?undefined:JSON.stringify(data),signal:signal||AbortSignal.timeout(15000),credentials:'omit',referrerPolicy:'no-referrer'});
  if(!response.ok){const result=await response.json();throw Error(result.error||'LOCAL_REQUEST_FAILED');}
  return binary?response.blob():response.json();
 }
};
export class NeuralUtterance{constructor(text){this.text=text;this.lang='en-US';}}
export function mountNeuralConnection(container){
 const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Local neural voice connection';details.append(summary);
 const notice=document.createElement('p');notice.textContent='Connect the free local companion for the original VAOS English voice. No Windows voice fallback. Other reply languages remain available as text.';
 const endpoint=document.createElement('input');endpoint.value='http://127.0.0.1:47831';endpoint.setAttribute('aria-label','Local companion address');
 const code=document.createElement('input');code.type='password';code.autocomplete='off';code.setAttribute('aria-label','Local companion pairing code');
 const connect=document.createElement('button');connect.type='button';connect.textContent='Connect neural voice';
 const disconnect=document.createElement('button');disconnect.type='button';disconnect.textContent='Disconnect neural voice';
 const status=document.createElement('p');status.setAttribute('role','status');
 connect.addEventListener('click',async()=>{try{localCompanion.connect(endpoint.value,code.value);code.value='';const result=await localCompanion.request('/api/status');if(!result.capabilities.neuralVoice)throw Error('Install the companion neural voice requirements and models first.');status.textContent='Local English neural voice connected. Memory profile: '+result.memoryScope.tenantId+' / '+result.memoryScope.subject;}catch(e){localCompanion.disconnect();status.textContent=e.message;}});
 disconnect.addEventListener('click',()=>{localCompanion.disconnect();status.textContent='Local neural voice disconnected.';});
 details.append(notice,endpoint,code,connect,disconnect,status);container.append(details);
}
export function createNeuralSynthesis({transport=localCompanion,makeAudio=()=>new Audio(),urls=URL,schedule=setTimeout,clear=clearTimeout}={}){
 let current=null;
 function cancel(){const st=current;current=null;if(!st)return;st.abort.abort();clear(st.timer);st.audio?.pause();if(st.url)urls.revokeObjectURL(st.url);}
 function speak(utterance){
  cancel();const st={abort:new AbortController(),audio:null,url:null,timer:null};current=st;
  function finish(error){if(current!==st)return;cancel();if(error)utterance.onerror?.({error});else utterance.onend?.();}
  st.timer=schedule(()=>finish('synthesis-failed'),180000);
  void (async()=>{
   try{
    const blob=await transport.request('/api/voice/synthesize',{method:'POST',data:{text:utterance.text,language:utterance.lang},signal:st.abort.signal,binary:true});
    if(current!==st)return;
    if(blob.type!=='audio/wav'||blob.size>12000000||blob.size<44)throw Error('NEURAL_AUDIO_INVALID');
    st.url=urls.createObjectURL(blob);st.audio=makeAudio();st.audio.src=st.url;
    st.audio.onplaying=()=>{if(current===st)utterance.onstart?.();};
    st.audio.onended=()=>finish();st.audio.onerror=()=>finish('audio-hardware');
    await st.audio.play();
   }catch(e){if(current===st)finish(e.message==='NEURAL_LANGUAGE_UNAVAILABLE'?'language-unavailable':'synthesis-unavailable');}
  })();
 }
 const unsubscribe=transport.subscribe?.(()=>cancel());
 return {speak,cancel,dispose(){cancel();unsubscribe?.();}};
}

export const VOICE_TTS_SAMPLE='Hello. I am JARVIS, your VAOS assistant. I am ready when you are.';
let accepted = false;
export const hostedVoice={
 accepted:()=>accepted,
 authorize(){
  if(!accepted)accepted=globalThis.window?.confirm?.('Enable hosted JARVIS voice in this tab? Cloudflare Workers AI receives the text of spoken replies.')===true;
  return accepted;
 },
 async request(_path,{method='GET',data,signal,binary=false}={}){
  if(method==='POST'&&!accepted)throw Error('VOICE_TTS_CONSENT_REQUIRED');
  const response=await fetch('/api/voice-speech',{method,credentials:'same-origin',cache:'no-store',headers:data===undefined?{}:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify({...data,speechProcessingAccepted:true}),signal:signal||AbortSignal.timeout(45000)});
  if(!response.ok){const result=await response.json().catch(()=>null);throw Error(result?.error||'VOICE_TTS_UNAVAILABLE');}
  if(!binary)return response.json();
  if(response.headers.get('X-VAOS-Voice-Provider')!=='cloudflare-aura'||response.headers.get('X-VAOS-Voice-Profile')!=='aura-1-orpheus')throw Error('NEURAL_PROVIDER_UNVERIFIED');
  return response.blob();
 }
};

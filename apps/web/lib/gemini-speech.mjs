export const GOOGLE_TTS_SAMPLE='Hello. I am JARVIS, your VAOS assistant. I am ready when you are.';
let accepted = false;
export const geminiSpeech={
 accepted:()=>accepted,
 authorize(){
  if(!accepted)accepted=globalThis.window?.confirm?.('Use the Gemini free-tier voice for this tab? Spoken reply text goes to Google and may be used to improve its products. Enable this only for content you are allowed to share.')===true;
  return accepted;
 },
 async request(_path,{method='GET',data,signal,binary=false}={}){
  if(method==='POST'&&!accepted)throw Error('GOOGLE_TTS_CONSENT_REQUIRED');
  const response=await fetch('/api/voice-speech',{method,credentials:'same-origin',cache:'no-store',headers:data===undefined?{}:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify({...data,googleProcessingAccepted:true}),signal:signal||AbortSignal.timeout(45000)});
  if(!response.ok){const result=await response.json().catch(()=>null);throw Error(result?.error||'GOOGLE_TTS_UNAVAILABLE');}
  if(!binary)return response.json();
  if(response.headers.get('X-VAOS-Voice-Provider')!=='google-gemini'||response.headers.get('X-VAOS-Voice-Profile')!=='gemini-2.5-flash-preview-tts-Charon')throw Error('NEURAL_PROVIDER_UNVERIFIED');
  return response.blob();
 }
};

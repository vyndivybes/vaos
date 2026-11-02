export const ELEVENLABS_SAMPLE='Hello. I am JARVIS, your VAOS assistant. This is an ElevenLabs voice preview.';
export const elevenLabsSpeech={
 async request(_path,{method='GET',data,signal,binary=false}={}){
  const response=await fetch('/api/voice-speech',{method,credentials:'same-origin',cache:'no-store',headers:data===undefined?{}:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data),signal:signal||AbortSignal.timeout(45000)});
  if(!response.ok){const result=await response.json();throw Error(result.error||'ELEVENLABS_UNAVAILABLE');}
  if(!binary)return response.json();
  if(response.headers.get('X-VAOS-Voice-Provider')!=='elevenlabs'||response.headers.get('X-VAOS-Voice-Profile')!=='George-eleven-v4-free-personal')throw Error('NEURAL_PROVIDER_UNVERIFIED');
  return response.blob();
 }
};

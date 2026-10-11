// Independent, local-only browser sound checks for Founder Command.
// No fetch, no storage, no agent dispatch, and no data writes.
export function createVoiceAudioDiagnostics({
  SpeechSynthesisUtteranceClass,
  speechSynthesis,
  AudioContextClass,
  onStatus=()=>{},
}={}) {
  const speechAvailable=typeof SpeechSynthesisUtteranceClass==='function'
    &&typeof speechSynthesis?.speak==='function'
    &&typeof speechSynthesis?.cancel==='function';
  let active=null;
  function stopSpeech() {
    if(!active)return;
    active=null;
    if(speechAvailable)try{speechSynthesis.cancel();}catch{}
    onStatus('Speech test stopped.');
  }
  function describe() {
    let voices=[];
    try{voices=speechSynthesis?.getVoices?.()||[];}catch{}
    const english=voices.filter(v=>String(v?.lang||'').toLowerCase().startsWith('en')).length;
    return 'Speech API: '+(speechAvailable?'available':'unavailable')
      +'. Installed browser voices: '+voices.length+' (English: '+english+').'
      +' Synth speaking: '+Boolean(speechSynthesis?.speaking)
      +', pending: '+Boolean(speechSynthesis?.pending)
      +', paused: '+Boolean(speechSynthesis?.paused)+'.';
  }
  function testShortSpeech() {
    if(!speechAvailable){onStatus('Speech playback unavailable in this browser.');return false;}
    stopSpeech();
    try{
      const current=new SpeechSynthesisUtteranceClass('Hello. VAOS speaker test.');
      current.lang='en-US';
      current.rate=1;
      current.volume=1;
      current.onstart=()=>{if(active===current)onStatus('Short speech STARTED. Check Windows audio output.');};
      current.onend=()=>{if(active===current){active=null;onStatus('Short speech COMPLETED. Confirm whether it was audible.');}};
      current.onerror=event=>{
        if(active!==current)return;
        active=null;
        const error=typeof event?.error==='string' && /^[a-z-]{1,50}$/.test(event.error)?event.error:'unknown';
        onStatus('Short speech ERROR: '+error+'. Check installed voices, Chrome tab audio and Windows mixer.');
      };
      active=current;
      speechSynthesis.speak(current);
      // Queued does not mean audio has started or been heard.
      if(active===current)onStatus('Short speech QUEUED. No audible playback confirmed yet.');
      return true;
    }catch{
      active=null;onStatus('Short speech failed to queue. Check browser speech settings.');return false;
    }
  }
  async function testTone(){
    if(typeof AudioContextClass!=='function'){
      onStatus('Independent speaker tone unavailable (Web Audio unsupported).');return false;
    }
    let context;
    try{
      context=new AudioContextClass();
      await context.resume();
      const oscillator=context.createOscillator();
      const gain=context.createGain();
      oscillator.type='sine';oscillator.frequency.value=660;
      gain.gain.value=0.12;
      oscillator.connect(gain);gain.connect(context.destination);
      oscillator.onended=()=>{Promise.resolve(context.close()).catch(()=>{});};
      oscillator.start();
      oscillator.stop(context.currentTime+0.55);
      onStatus('Speaker tone STARTED. If silent, check Chrome tab mute and Windows output device.');
      return true;
    }catch{
      if(context)try{await context.close();}catch{}
      onStatus('Speaker tone failed. Check browser audio permissions and Windows output.');
      return false;
    }
  }
  return Object.freeze({testShortSpeech,testTone,stopSpeech,describe,speechAvailable});
}

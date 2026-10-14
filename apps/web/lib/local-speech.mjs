export const SPEECH_LOCALES=Object.freeze({en:'en-IN',ta:'ta-IN',ml:'ml-IN',hi:'hi-IN'});
export function interimTranscript(event){
 const rows=event?.results;if(!rows||!Number.isInteger(rows.length))return '';
 let text='';for(let i=Math.max(0,event.resultIndex||0);i<rows.length;i++)if(rows[i]?.isFinal!==true&&typeof rows[i]?.[0]?.transcript==='string')text+=rows[i][0].transcript+' ';
 return text.trim().slice(0,300);
}
// Local mode is mandatory for wake listening. Never silently fall back to a
// browser vendor's remote recognizer after an on-device availability failure.
export async function prepareLocalSpeech(RecognitionClass,language,{install=false}={}){
 if(typeof RecognitionClass!=='function'||typeof RecognitionClass.available!=='function')return {status:'LOCAL_UNAVAILABLE'};
 let probe;try{probe=new RecognitionClass();}catch{return {status:'LOCAL_UNAVAILABLE'};}
 if(!('processLocally' in probe))return {status:'LOCAL_UNAVAILABLE'};
 const locales=language==='en'?['en-IN','en-US']:[SPEECH_LOCALES[language]].filter(Boolean);
 for(const locale of locales){
  let state;try{state=await RecognitionClass.available({langs:[locale],processLocally:true});}catch{continue;}
  if(state==='available')return {status:'LOCAL_READY',locale};
  if(state==='downloadable'&&install&&typeof RecognitionClass.install==='function'){
   try{if(await RecognitionClass.install({langs:[locale],processLocally:true}))return {status:'LOCAL_READY',locale};}catch{}
  }
 }
 return {status:'LOCAL_UNAVAILABLE'};
}
export function configureSpeechRecognition(recognition,{language='en',localLocale=null,onInterim=()=>{},onActivity=()=>{}}={}){
 recognition.lang=localLocale||SPEECH_LOCALES[language]||SPEECH_LOCALES.en;
 recognition.interimResults=true;recognition.continuous=false;recognition.maxAlternatives=1;
 if(localLocale){if(!('processLocally' in recognition))throw Error('LOCAL_SPEECH_UNAVAILABLE');recognition.processLocally=true;}
 recognition.onspeechstart=()=>onActivity('SPEECH_START');
 recognition.onspeechend=()=>onActivity('SPEECH_END');
 return event=>{const text=interimTranscript(event);if(text)onInterim(text);};
}

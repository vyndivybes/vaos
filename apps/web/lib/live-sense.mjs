/**
 * Browser-local camera snapshot and speech-question controls for JARVIS.
 * Designed from first principles: no ADA backend, third-party script,
 * persistent media, automatic capture, model dispatch, or microphone upload.
 */
export function createCameraSession({
 mediaDevices,video,createCanvas=()=>document.createElement('canvas'),
 onStatus=()=>{}
}={}){
 if(!video||typeof createCanvas!=='function')throw Error('CAMERA_VIEW_REQUIRED');
 let stream=null,generation=0,opening=null;
 const stopTracks=value=>{for(const track of value?.getTracks?.()||[])try{track.stop()}catch{}};
 function stop(){
  generation++;
  const previous=stream;stream=null;
  try{video.pause?.()}catch{}
  try{video.srcObject=null}catch{}
  stopTracks(previous);
  onStatus('Camera off. No live video is being sent.');
 }
 async function start(){
  if(stream)return true;
  if(opening)return opening;
  if(typeof mediaDevices?.getUserMedia!=='function')throw Error('CAMERA_UNAVAILABLE');
  const generationAtStart=++generation;
  const task=(async()=>{
   let candidate=null;
   try{
    candidate=await mediaDevices.getUserMedia({audio:false,video:{
     facingMode:{ideal:'environment'},width:{ideal:640},height:{ideal:480}
    }});
    if(!candidate?.getVideoTracks?.().length)throw Error('CAMERA_VIDEO_UNAVAILABLE');
    if(generationAtStart!==generation){stopTracks(candidate);return false;}
    stream=candidate;video.srcObject=candidate;
    video.muted=true;video.playsInline=true;
    await video.play?.();
    if(generationAtStart!==generation){stopTracks(candidate);return false;}
    onStatus('Camera local preview active. Only a selected snapshot is sent after confirmation.');
    return true;
   }catch(error){
    stopTracks(candidate);
    if(stream===candidate)stream=null;
    try{video.srcObject=null}catch{}
    if(generationAtStart===generation){
     onStatus('Camera permission or preview unavailable. Webcam stopped.');
     throw error;
    }
    return false;
   }
  })();
  opening=task;
  try{return await task}finally{if(opening===task)opening=null;}
 }
 function capture(){
  if(!stream)throw Error('CAMERA_NOT_ACTIVE');
  if(video.readyState<2||!Number.isFinite(video.videoWidth)||!Number.isFinite(video.videoHeight)||
     video.videoWidth<1||video.videoHeight<1||video.videoWidth*video.videoHeight>60000000)
   throw Error('CAMERA_FRAME_NOT_READY');
  const canvas=createCanvas();
  const scale=Math.min(1,760/Math.max(video.videoWidth,video.videoHeight));
  canvas.width=Math.max(1,Math.floor(video.videoWidth*scale));
  canvas.height=Math.max(1,Math.floor(video.videoHeight*scale));
  const ctx=canvas.getContext?.('2d');
  if(!ctx)throw Error('CAMERA_CANVAS_UNAVAILABLE');
  ctx.drawImage(video,0,0,canvas.width,canvas.height);
  let quality=.8,image=canvas.toDataURL('image/jpeg',quality);
  while(image.length>600000&&quality>.3){
   quality-=.1;image=canvas.toDataURL('image/jpeg',quality);
  }
  if(image.length>600000){
   canvas.width=Math.max(1,Math.floor(canvas.width*.6));
   canvas.height=Math.max(1,Math.floor(canvas.height*.6));
   canvas.getContext('2d')?.drawImage(video,0,0,canvas.width,canvas.height);
   image=canvas.toDataURL('image/jpeg',.38);
  }
  if(image.length>600000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(image))
   throw Error('CAMERA_FRAME_TOO_LARGE_OR_INVALID');
  return image;
 }
 return Object.freeze({start,stop,capture,active:()=>stream!==null});
}

/** One spoken question becomes text, never an automatic source request. */
export function createQuestionDictation({RecognitionClass,onText=()=>{},onStatus=()=>{}}={}){
 let active=null,silenceRetries=0;
 function stop(){
  const r=active;active=null;silenceRetries=0;
  if(r)try{r.abort?.()}catch{}
 }
 function start(retry=false){
  if(!retry)silenceRetries=0;
  if(active||typeof RecognitionClass!=='function')return false;
  let r;
  try{
   r=new RecognitionClass();
   r.lang='en-IN';r.continuous=false;r.interimResults=false;r.maxAlternatives=1;
   r.onresult=event=>{
    if(active!==r)return;
    let result=null;
    for(let i=(event?.results?.length||0)-1;i>=0;i--){
     const candidate=event.results[i];
     if(candidate?.isFinal!==true)continue;
     const value=candidate[0]?.transcript;
     if(typeof value==='string'&&value.trim()){result=value.trim();break;}
    }
    active=null;
    try{r.stop?.()}catch{}
    if(!result||result.length<4||result.length>1000||/[\x00-\x1f\x7f]/.test(result)){
     onStatus('No usable final spoken question. Nothing submitted.');return;
    }
    const handled=onText(result)===true;
    if(!handled)onStatus('Question transcribed. Review it, then explicitly choose Analyze.');
   };
   r.onerror=event=>{
    if(active!==r)return;
    active=null;
    if(event?.error==='no-speech'&&silenceRetries<1){
     silenceRetries++;
     onStatus('No speech heard. JARVIS is listening once more.');
     if(start(true))return;
    }
    onStatus('Speech recognition unavailable. Type the question instead.');
   };
   r.onend=()=>{if(active===r)active=null};
   active=r;r.start();
   onStatus('Listening for one question. Browser speech recognition may use a vendor service.');
   return true;
  }catch{
   if(active===r)active=null;
   onStatus('Browser microphone recognition unavailable.');
   return false;
  }
 }
 return Object.freeze({start,stop,active:()=>active!==null});
}

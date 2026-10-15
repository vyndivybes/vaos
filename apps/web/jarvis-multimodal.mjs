import {createCameraSession,createQuestionDictation} from './lib/live-sense.mjs';
import {createVoiceReadback} from './lib/voice-readback.mjs';
const $=id=>document.getElementById(id);
let enabled=false,specialistsEnabled=false,file=null,frameUrl=null,converted='',sourceHash=null,lastFrame=null,documentSource=null,sourceGeneration=0;
async function fileHash(source){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await source.arrayBuffer())),v=>v.toString(16).padStart(2,'0')).join('');}
async function imageDataHash(data){const b64=data.split(',')[1];const bytes=Uint8Array.from(atob(b64),ch=>ch.charCodeAt(0));return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');}
async function request(operation,payload){
 const r=await fetch('/api/jarvis-multimodal',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation,confirm:true,...payload})});
 const j=await r.json();if(!r.ok)throw Error(j.error?.message||j.error?.code||'Operation unavailable');return j.data;
}
// ADA-inspired interaction, adapted without its Electron/Python backend.
const cameraPreview=$('camera-preview');
const camera=createCameraSession({
 mediaDevices:typeof navigator!=='undefined'?navigator.mediaDevices:null,
 video:cameraPreview,
 onStatus:message=>{$('status').textContent=message;}
});
const dictation=createQuestionDictation({
 RecognitionClass:window.SpeechRecognition||window.webkitSpeechRecognition,
 onText:text=>{$('question').value=text;},
 onStatus:message=>{$('status').textContent=message;}
});
const voiceReadback=createVoiceReadback({
 synthesis:window.speechSynthesis,
 UtteranceClass:window.SpeechSynthesisUtterance,
 language:()=> 'en-US',
 onState:mode=>{if(mode==='SPEAKING')$('status').textContent='JARVIS is speaking the displayed advisory explanation.';},
 onError:code=>{$('status').textContent='Browser audio unavailable ('+code+'). The written answer remains visible.';},
 onFinished:mode=>{if(mode==='FINISHED')$('status').textContent='Spoken explanation completed.';}
});
let cameraGeneration=0;
function stopCamera(){
 cameraGeneration++;
 camera.stop();
 cameraPreview.hidden=true;
 $('camera-start').disabled=!enabled;
 $('camera-capture').disabled=true;
 $('camera-stop').disabled=true;
}
$('camera-start').addEventListener('click',async()=>{
 if(!enabled){$('status').textContent='Multimodal pilot is not enabled for this session.';return;}
 if(window.isSecureContext===false){$('status').textContent='Camera needs HTTPS or a secure local browser context.';return;}
 const button=$('camera-start');button.disabled=true;
 try{
  const visible=await camera.start();
  if(!visible||document.visibilityState==='hidden'){stopCamera();return;}
  cameraPreview.hidden=false;
  $('camera-stop').disabled=false;
  $('camera-capture').disabled=false;
 }catch(error){
  stopCamera();
  $('status').textContent='Camera could not start. Check browser camera permission and close other camera apps.';
 }
});
$('camera-stop').addEventListener('click',()=>{
 stopCamera();dictation.stop();voiceReadback.cancel();
});
$('camera-capture').addEventListener('click',async()=>{
 if(!enabled||!camera.active())return;
 const button=$('camera-capture');button.disabled=true;
 const token=cameraGeneration;
 try{
  // A deliberate founder confirmation is required for every isolated snapshot.
  if(!confirm('Send ONE camera snapshot to Workers AI for read-only interpretation? No video stream or microphone audio is sent.'))return;
  const image=camera.capture();
  const expectedHash=await imageDataHash(image);
  if(token!==cameraGeneration||!camera.active()||document.visibilityState==='hidden')return;
  const question=$('question').value.trim()||'Describe what is visible in this selected camera frame without guessing.';
  const data=await request('ANALYZE_IMAGE',{image,question});
  if(token!==cameraGeneration||!camera.active()||document.visibilityState==='hidden')return;
  if(data.actionAuthorized!==false||data.stored!==false||data.provenance?.imageSha256!==expectedHash)
   throw Error('Camera snapshot provenance invalid. Explanation withheld.');
  $('result').textContent='Selected camera snapshot — not continuous video monitoring.\\n\\n'+data.answer+
   '\\n\\nFrame SHA-256: '+expectedHash+'. No business records changed.';
  $('result-panel').hidden=false;
  $('vedm-panel').hidden=false;
  $('status').textContent='JARVIS inspected one consented camera frame. Camera preview is still local. Press Stop camera to close it.';
 }catch(error){if(token===cameraGeneration)$('status').textContent=String(error.message||'Snapshot unavailable');}
 finally{button.disabled=!enabled||!camera.active();}
});
$('dictate-question').addEventListener('click',()=>{
 if(dictation.active()){dictation.stop();$('status').textContent='Question dictation cancelled.';}
 else if(!dictation.start())$('status').textContent='Speech recognition unavailable. Type the question instead.';
});
$('speak-result').addEventListener('click',()=>{
 if($('result-panel').hidden||!$('result').textContent.trim()){
  $('status').textContent='No explanation is available to read aloud.';return;
 }
 const spoken=$('result').textContent.slice(0,4800);
 if(!voiceReadback.speak(spoken))$('status').textContent='Speech playback unavailable; read the displayed answer.';
});
$('stop-result-speech').addEventListener('click',()=>{
 voiceReadback.cancel();$('status').textContent='JARVIS speech stopped.';
});
document.addEventListener('visibilitychange',()=>{
 if(document.visibilityState==='hidden'){stopCamera();dictation.stop();voiceReadback.cancel();}
});
window.addEventListener('pagehide',()=>{
 stopCamera();dictation.stop();voiceReadback.cancel();
});

async function init(){
 try{
 const r=await fetch('/api/jarvis-multimodal',{credentials:'same-origin'});const j=await r.json();
 if(!r.ok)throw Error(j.error?.code||'Sign in required');
 enabled=j.data.enabled===true;
 specialistsEnabled=j.data.specialistsEnabled===true;
 $('status').textContent=enabled?'Founder multimodal pilot enabled (read-only preview).':specialistsEnabled?'Pasted Legal and Marketing reviews available. AI file conversion and image analysis remain disabled.':'Multimodal pilot is disabled on this deployment. Source panel remains visible but analysis is held.';
 $('analyze').disabled=!enabled;
 $('camera-start').disabled=!enabled;
 $('review-legal-text').disabled=!specialistsEnabled;
 $('review-marketing-text').disabled=!specialistsEnabled;
 }catch(e){$('status').textContent=String(e.message);$('analyze').disabled=true;$('review-legal-text').disabled=true;$('review-marketing-text').disabled=true}
}
async function imagePayload(){
 let im,close=()=>{},w,h;
 if(/\.mp4$|\.webm$/i.test(file.name)){
  im=$('video-local');if(!im||im.readyState<2||im.seeking||!im.paused||!Number.isFinite(im.duration)||im.duration<=0)throw Error('Pause on a real visible frame first');w=im.videoWidth;h=im.videoHeight;
  lastFrame={timeSeconds:im.currentTime,durationSeconds:im.duration,sourceSha256:sourceHash};
 }else{
  im=await createImageBitmap(file);w=im.width;h=im.height;close=()=>im.close?.();
 }
 if(!w||!h||w*h>60000000)throw Error('Image dimensions not suitable');
 const scale=Math.min(1,800/Math.max(w,h)),canvas=document.createElement('canvas');
 canvas.width=Math.max(1,Math.floor(w*scale));canvas.height=Math.max(1,Math.floor(h*scale));
 const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(im,0,0,canvas.width,canvas.height);close();
 let quality=.8,out=canvas.toDataURL('image/jpeg',quality);
 while(out.length>600000&&quality>.3){quality-=.1;out=canvas.toDataURL('image/jpeg',quality)}
 if(out.length>600000)throw Error('Image too large after resizing');
 return out;
}

/**
 * The original video never leaves the browser. Seek and compress four sparse
 * visual samples; any transcript must be pasted by the founder separately.
 * Sampling cannot substantiate motion or events between sampled instants.
 */
async function seekVideo(video,seconds){
 if(Math.abs(video.currentTime-seconds)<0.015&&video.readyState>=2)return;
 await new Promise((resolve,reject)=>{
  let settled=false;
  const finish=error=>{
   if(settled)return;settled=true;clearTimeout(timeout);
   video.removeEventListener('seeked',onSeek);
   video.removeEventListener('error',onError);
   error?reject(error):resolve();
  };
  const onSeek=()=>finish(),onError=()=>finish(Error('Video could not seek to the chosen time'));
  const timeout=setTimeout(()=>finish(Error('Video frame decoding timed out')),6000);
  video.addEventListener('seeked',onSeek);video.addEventListener('error',onError);
  try{video.currentTime=seconds}catch(error){finish(error)}
 });
}
function compressedVideoFrame(video){
 if(!video.videoWidth||!video.videoHeight)throw Error('Video frame dimensions unavailable');
 const canvas=document.createElement('canvas');
 const scale=Math.min(1,640/Math.max(video.videoWidth,video.videoHeight));
 canvas.width=Math.max(1,Math.floor(video.videoWidth*scale));
 canvas.height=Math.max(1,Math.floor(video.videoHeight*scale));
 const ctx=canvas.getContext('2d');
 ctx.drawImage(video,0,0,canvas.width,canvas.height);
 let quality=.7,image=canvas.toDataURL('image/jpeg',quality);
 while(image.length>215000&&quality>.28){
  quality-=.08;image=canvas.toDataURL('image/jpeg',quality);
 }
 if(image.length>215000){
  canvas.width=Math.max(1,Math.floor(canvas.width*.65));
  canvas.height=Math.max(1,Math.floor(canvas.height*.65));
  ctx.drawImage(video,0,0,canvas.width,canvas.height);
  image=canvas.toDataURL('image/jpeg',.42);
 }
 if(image.length>215000)throw Error('Video frame exceeds the bounded analysis budget');
 return image;
}
async function sampleLocalVideo(video,original,generation){
 if(!Number.isFinite(video.duration)||video.duration<=0||video.readyState<2)
  throw Error('Wait until video metadata and a local frame have loaded');
 video.pause();
 const positions=[.08,.36,.65,.92].map(fraction=>Math.min(video.duration-.001,Math.max(0,video.duration*fraction)));
 const frames=[];
 for(const time of positions){
  if(file!==original||sourceGeneration!==generation)throw Error('Source changed during video sampling');
  await seekVideo(video,time);
  if(file!==original||sourceGeneration!==generation)throw Error('Source changed during video sampling');
  const image=compressedVideoFrame(video);
  frames.push({timeSeconds:Number(video.currentTime.toFixed(4)),image,imageSha256:await imageDataHash(image)});
 }
 return frames;
}

$('source-file').addEventListener('change',e=>{
 stopCamera();dictation.stop();voiceReadback.cancel();
 sourceGeneration++;
 $('video-transcript').value='';
 $('video-transcript-panel').hidden=true;
 file=e.target.files?.[0]||null;converted='';sourceHash=null;lastFrame=null;documentSource=null;$('doc-panel').hidden=true;$('result-panel').hidden=true;$('vedm-panel').hidden=true;$('vedm-result').textContent='No VEDM comparison has been requested.';
 if(frameUrl){URL.revokeObjectURL(frameUrl);frameUrl=null}
 $('frame-preview').replaceChildren();
 if(file&&/\.(mp4|webm)$/i.test(file.name)){
  $('video-transcript-panel').hidden=false;
  if(file.size>18000000){$('status').textContent='Video exceeds the 18 MB local preview limit';file=null;return}
  const v=document.createElement('video');v.id='video-local';v.controls=true;v.muted=true;v.playsInline=true;
  frameUrl=URL.createObjectURL(file);v.src=frameUrl;$('frame-preview').append(v);
  $('status').textContent='Video stays on your device. JARVIS can sample four timestamps; paste captions if available. Sparse samples do not capture all motion.';
 }
});
$('analyze').addEventListener('click',async()=>{
 if(!enabled||!file)return;
 const question=$('question').value.trim()||'Describe what is visible or written without guessing.';
 const button=$('analyze');button.disabled=true;
 try{
  if(/\.(pdf|docx|pptx)$/i.test(file.name)){
   if(file.size>1000000)throw Error('Document must be at most 1 MB.');
   if(!confirm('Convert this document through Cloudflare Workers AI? No document will be saved in VAOS.'))return;
   let raw='';const arr=new Uint8Array(await file.arrayBuffer());for(let i=0;i<arr.length;i+=8192)raw+=String.fromCharCode(...arr.subarray(i,i+8192));
   const r=await request('CONVERT_DOCUMENT',{name:file.name,base64:btoa(raw)});
   if(typeof r.text!=='string'||typeof r.provenance?.fileSha256!=='string'||typeof r.provenance?.excerptSha256!=='string')
    throw Error('Conversion source hashes are missing; no linked document answer can be claimed.');
   converted=r.text;documentSource={name:r.name,fileSha256:r.provenance.fileSha256,excerptSha256:r.provenance.excerptSha256};
   $('document-text').textContent=converted;
   $('doc-panel').hidden=false;$('vedm-panel').hidden=false;$('status').textContent='Document converted with SHA-256 '+documentSource.fileSha256+'. The extracted text is unverified; check completeness before asking JARVIS.';
  }else if(/\.(mp4|webm)$/i.test(file.name)){
   const original=file,generation=sourceGeneration;
   if(original.size>18000000)throw Error('Video exceeds the 18 MB local analysis limit');
   const transcript=$('video-transcript').value.trim();
   if(transcript.length>4000)throw Error('Pasted transcript exceeds 4,000 characters');
   if(!confirm('Send four compressed video-frame images'+(transcript?' and your pasted transcript':'')+' to Workers AI for read-only analysis? Original video remains on this device.'))return;
   sourceHash=await fileHash(original);
   if(file!==original||sourceGeneration!==generation)throw Error('Video selection changed');
   const video=$('video-local'),frames=await sampleLocalVideo(video,original,generation);
   const data=await request('ANALYZE_VIDEO',{video:{sourceSha256:sourceHash,durationSeconds:video.duration,frames,...(transcript?{transcript}:{})},question});
   if(!Array.isArray(data.frameObservations)||data.provenance?.temporalCoverage!=='SPARSE_SAMPLED_FRAMES_ONLY')
    throw Error('Video-sense timestamp provenance was not returned');
   $('result').textContent=data.answer+'\n\nSAMPLED TIMESTAMP OBSERVATIONS (not continuous footage):\n'+
    data.frameObservations.map(x=>x.timestamp+' — '+x.observation).join('\n')+
    '\n\nOriginal clip association: client-declared, not server-verified. Transcript: '+
    data.provenance.transcriptAuthority+'. No business records were modified.';
   $('result-panel').hidden=false;$('vedm-panel').hidden=false;
   $('status').textContent='Sparse video sense completed across '+data.frameObservations.length+
    ' timestamped frames. Original video remained local. Motion between frames and transcript alignment remain unverified.';
  }else if(/\.(jpg|jpeg|png|webp)$/i.test(file.name)){
   if(!confirm('Send only this image / single video frame to Workers AI? It will not be saved.'))return;
   const chosen=file;if(chosen.size>18000000)throw Error('Source exceeds the 18 MB local analysis limit.');sourceHash=await fileHash(chosen);if(file!==chosen)throw Error('Source changed; select it again.');
   const image=await imagePayload();
   const frame=lastFrame?{...lastFrame,frameImageSha256:await imageDataHash(image)}:null;
   const r=await request('ANALYZE_IMAGE',{image,question,...(frame?{frame}:{})});
   $('result').textContent=r.answer;$('result-panel').hidden=false;$('vedm-panel').hidden=false;
   $('status').textContent='Single-image analysis finished. Image SHA-256: '+r.provenance.imageSha256+(r.provenance.frame?' · selected frame at '+r.provenance.frame.timeSeconds+' seconds; original video hash is client-declared.':'')+' No business record was changed.';
  }else throw Error('Unsupported format');
 }catch(e){$('status').textContent=String(e.message)}finally{button.disabled=!enabled}
});
$('ask-doc').addEventListener('click',async()=>{
 if(!converted||!enabled)return;
 const question=$('question').value.trim();if(question.length<5){$('status').textContent='Enter a question about the source first';return}
 try{
  const r=await request('ANSWER_DOCUMENT',{text:converted,question,source:documentSource});
  const evidence=Array.isArray(r.evidence)?r.evidence.filter(x=>Number.isInteger(x.line)&&typeof x.text==='string').slice(0,5):[];
  $('result').textContent=r.answer+(evidence.length?
   '\n\nEXCERPT LINES (unverified, review against original file):\n'+evidence.map(x=>'Line '+x.line+': '+x.text).join('\n'):'');
  $('result-panel').hidden=false;$('vedm-panel').hidden=false;
  $('status').textContent=(r.status==='HOLD'?'Evidence insufficient. ':'AI file interpretation is unverified. ')+
   'Excerpt SHA-256: '+String(r.provenance?.excerptSha256||'unknown')+
   '. No engineering approvals or business actions.';
 }
 catch(e){$('status').textContent=String(e.message)}
});
// Specialist reviews reuse the authenticated, consent-bound document workflow.
for(const [buttonId,domain] of [['review-legal','LEGAL'],['review-marketing','MARKETING']]){
 $(buttonId).addEventListener('click',async()=>{
  if(!enabled||!converted||!documentSource)return;
  const button=$(buttonId);button.disabled=true;
  try {
   const data=await request('SPECIALIST_REVIEW',{domain,text:converted,source:documentSource});
   if(data.actionAuthorized!==false||data.agentDispatched!==false||
      data.stored!==false||data.sourceAuthority!=='USER_UPLOADED_UNVERIFIED'||
      !Array.isArray(data.checks))throw Error('Specialist report authority invalid');
   $('result').textContent=(domain==='LEGAL'?'LEGAL KEYWORD INVENTORY':'MARKETING COPY SIGNALS')+
    '\n'+data.locatedCount+' of '+data.checks.length+' topics had matching excerpt terms.'+
    '\n\n'+data.checks.map(c=>c.topic+': '+c.status+
      (Number.isInteger(c.line)?' (line '+c.line+')\n'+c.excerpt:'')).join('\n\n')+
    '\n\n'+data.notice+
    '\n\nRequired context:\n'+data.workflow.requiredInputs.join('\n')+
    '\n\nReview steps:\n'+data.workflow.nextSteps.join('\n')+
    '\n\nSource SHA-256: '+data.provenance.excerptSha256+
    '\nExisting department: '+data.ownerAgentId+' (not assigned).';
   $('result-panel').hidden=false;
   $('status').textContent='Preliminary '+domain.toLowerCase()+' keyword review. No AI agent dispatched, legal opinion, campaign score, source certification or business write.';
  }catch(error){$('status').textContent=String(error.message||'Specialist review unavailable');}
  finally{button.disabled=!enabled;}
 });
}


for(const [buttonId,domain] of [['review-legal-text','LEGAL'],['review-marketing-text','MARKETING']]){
 $(buttonId).addEventListener('click',async()=>{
  if(!specialistsEnabled)return;
  const text=$('specialist-copy').value.trim();
  if(text.length<60||text.length>12000){
   $('status').textContent='Paste at least 60 and no more than 12,000 characters for a bounded review.';
   return;
  }
  const button=$(buttonId);button.disabled=true;
  try{
   const data=await request('SPECIALIST_REVIEW',{domain,text});
   if(data.actionAuthorized!==false||data.agentDispatched!==false||data.stored!==false||
      data.sourceAuthority!=='USER_PASTED_UNVERIFIED'||data.score!==null||
      !Array.isArray(data.checks)||data.provenance?.fileHashAuthority!=='NO_FILE_PROVENANCE')
    throw Error('Specialist response was not independently bounded.');
   $('result').textContent=(domain==='LEGAL'?'LEGAL TERMS — EXCERPT ONLY':'MARKETING COPY — EXCERPT ONLY')+
    '\n'+data.locatedCount+' of '+data.checks.length+' topics had matching source terms.'+
    '\n\n'+data.checks.map(c=>c.topic+': '+c.status+
      (Number.isInteger(c.line)?' (line '+c.line+')\n'+c.excerpt:'')).join('\n\n')+
    '\n\n'+data.notice+
    '\n\nRequired context:\n'+data.workflow.requiredInputs.join('\n')+
    '\n\nReview steps:\n'+data.workflow.nextSteps.join('\n')+
    '\n\nPasted excerpt SHA-256: '+data.provenance.excerptSha256+
    '\nDepartmental owner: '+data.ownerAgentId+' (not dispatched). No document authenticity verified.';
   $('result-panel').hidden=false;
   $('status').textContent='Preliminary '+domain.toLowerCase()+' source-text review. No business changes or employee assignment.';
  }catch(error){$('status').textContent=String(error.message||'Specialist review unavailable');}
  finally{button.disabled=!specialistsEnabled;}
 });
}

$('compare-vedm').addEventListener('click',async()=>{
 if(!enabled||!file)return;
 const button=$('compare-vedm');button.disabled=true;
 const answer=$('vedm-result');
 answer.textContent='Reading current controlled VEDM and VIBPE sources…';
 try{
  const raw=$('question').value.trim();
  const q=/(?:vedm|vibpe|material|toray|prepreg|engineering|geometry|frameset|fork|cad|laminate|bom|validation|revision|release)/i.test(raw)
   ?raw.slice(0,300)
   :'What is the current controlling VEDM geometry and what engineering validation gates remain open?';
  const r=await fetch('/api/engineering-knowledge?q='+encodeURIComponent(q),{
   method:'GET',credentials:'same-origin',cache:'no-store'});
  const body=await r.json();
  if(!r.ok)throw Error(body.error?.code||'VEDM source is unavailable');
  const data=body.data;
  if(!data||data.sourceSystem!=='ENGINEERING_FEDERATION'||data.readOnly!==true
    ||data.actionAuthorized!==false||!['HOLD','OBSERVED'].includes(data.status))
   throw Error('Controlled engineering response could not be verified');
  const sources=Array.isArray(data.sources)?data.sources.filter(s=>
   typeof s.sha==='string'&&/^[a-f0-9]{40}$/.test(s.sha)
   &&typeof s.url==='string'
   &&/^https:\/\/github\.com\/vayu-shastr\/(?:veloxis-engineering-design-manual|adv-vibpe)\/blob\/[a-f0-9]{40}\//.test(s.url)
  ).slice(0,8):[];
  answer.textContent='Independent current controlled VEDM / VIBPE status: '+data.status+
   '\n'+data.answer+
   '\n\nCOMMIT-PINNED ENGINEERING SOURCES:\n'+
   (sources.length?sources.map((s,i)=>(i+1)+'. '+s.url+' [SHA '+s.sha+']').join('\n'):
    'No commit-pinned source returned; engineering authority remains unverified.')+
   '\n\nThis is separate engineering evidence. It does not certify the uploaded file, frame, or production release.';
 }catch(error){
  answer.textContent='VEDM authority read unavailable: '+String(error.message||'unknown')+
   '. Do not infer engineering release or design approval.';
 }finally{button.disabled=!enabled;}
});

init();

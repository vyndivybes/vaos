const $=id=>document.getElementById(id);
let enabled=false,file=null,frameUrl=null,converted='',sourceHash=null,lastFrame=null,documentSource=null;
async function fileHash(source){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await source.arrayBuffer())),v=>v.toString(16).padStart(2,'0')).join('');}
async function imageDataHash(data){const b64=data.split(',')[1];const bytes=Uint8Array.from(atob(b64),ch=>ch.charCodeAt(0));return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');}
async function request(operation,payload){
 const r=await fetch('/api/jarvis-multimodal',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation,confirm:true,...payload})});
 const j=await r.json();if(!r.ok)throw Error(j.error?.message||j.error?.code||'Operation unavailable');return j.data;
}
async function init(){
 try{
 const r=await fetch('/api/jarvis-multimodal',{credentials:'same-origin'});const j=await r.json();
 if(!r.ok)throw Error(j.error?.code||'Sign in required');
 enabled=j.data.enabled===true;
 $('status').textContent=enabled?'Founder multimodal pilot enabled (read-only preview).':'Multimodal pilot is disabled on this deployment. Source panel remains visible but analysis is held.';
 $('analyze').disabled=!enabled;
 }catch(e){$('status').textContent=String(e.message);$('analyze').disabled=true}
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
$('source-file').addEventListener('change',e=>{
 file=e.target.files?.[0]||null;converted='';sourceHash=null;lastFrame=null;documentSource=null;$('doc-panel').hidden=true;$('result-panel').hidden=true;$('vedm-panel').hidden=true;$('vedm-result').textContent='No VEDM comparison has been requested.';
 if(frameUrl){URL.revokeObjectURL(frameUrl);frameUrl=null}
 $('frame-preview').replaceChildren();
 if(file&&/\.(mp4|webm)$/i.test(file.name)){
  if(file.size>18000000){$('status').textContent='Video exceeds the 18 MB local preview limit';file=null;return}
  const v=document.createElement('video');v.id='video-local';v.controls=true;v.muted=true;v.playsInline=true;
  frameUrl=URL.createObjectURL(file);v.src=frameUrl;$('frame-preview').append(v);
  $('status').textContent='The video stays on your device. Pause on one frame before analysis.';
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
  }else if(/\.(jpg|jpeg|png|webp|mp4|webm)$/i.test(file.name)){
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

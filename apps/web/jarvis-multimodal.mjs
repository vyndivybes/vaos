const $=id=>document.getElementById(id);
let enabled=false,file=null,frameUrl=null,converted='';
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
  im=$('video-local');if(!im||im.readyState<2)throw Error('Play or pause on a real visible frame first');w=im.videoWidth;h=im.videoHeight;
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
 file=e.target.files?.[0]||null;converted='';$('doc-panel').hidden=true;$('result-panel').hidden=true;
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
   const r=await request('CONVERT_DOCUMENT',{name:file.name,base64:btoa(raw)});converted=r.text;$('document-text').textContent=converted;
   $('doc-panel').hidden=false;$('status').textContent='Document converted to an unverified excerpt; review it before asking JARVIS.';
  }else if(/\.(jpg|jpeg|png|webp|mp4|webm)$/i.test(file.name)){
   if(!confirm('Send only this image / single video frame to Workers AI? It will not be saved.'))return;
   const image=await imagePayload();const r=await request('ANALYZE_IMAGE',{image,question});
   $('result').textContent=r.answer;$('result-panel').hidden=false;
   $('status').textContent='Single-image analysis finished. No business record was changed.';
  }else throw Error('Unsupported format');
 }catch(e){$('status').textContent=String(e.message)}finally{button.disabled=!enabled}
});
$('ask-doc').addEventListener('click',async()=>{
 if(!converted||!enabled)return;
 const question=$('question').value.trim();if(question.length<5){$('status').textContent='Enter a question about the source first';return}
 try{const r=await request('ANSWER_DOCUMENT',{text:converted,question});
 $('result').textContent=r.answer;$('result-panel').hidden=false;
 $('status').textContent='AI interpretation is unverified advisory text. No actions executed.';}
 catch(e){$('status').textContent=String(e.message)}
});
init();

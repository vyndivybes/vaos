import {parseEngineeringMesh,compareEngineeringVertices} from './lib/engineering-mesh.mjs';
import {planEngineeringViewerQuestion,describeEngineeringBounds} from './lib/engineering-viewer-intents.mjs';
const $=id=>document.getElementById(id);let current=null,yaw=.35,pitch=.15,zoom=1,drag=null,loadGeneration=0;
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
async function read(file){if(!file||file.size>18000000)throw Error('Choose an artifact no larger than 18 MB.');const bytes=await file.arrayBuffer();return {name:file.name,sha256:await hash(bytes),mesh:parseEngineeringMesh(bytes,file.name)};}
function provenance(){if(!current)return;$('mesh-provenance').textContent=JSON.stringify({source:current.name,sha256:current.sha256,declaredRevision:$('revision').value||null,declaredUnits:$('units').value,classification:'USER_UPLOADED_PROPOSED_ARTIFACT',representation:current.mesh.kind,bounds:current.mesh.bounds,notice:current.mesh.notice,engineeringReleaseGranted:false},null,2);}
function draw(){const canvas=$('mesh'),ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);if(!current)return;const mesh=current.mesh;
 const project=p=>{const x=(p[0]-mesh.centre[0])/mesh.scale,y=(p[1]-mesh.centre[1])/mesh.scale,z=(p[2]-mesh.centre[2])/mesh.scale;const u=x*Math.cos(yaw)-z*Math.sin(yaw),v=x*Math.sin(yaw)+z*Math.cos(yaw);const w=y*Math.cos(pitch)-v*Math.sin(pitch);return [canvas.width/2+u*canvas.width*.75*zoom,canvas.height/2-w*canvas.width*.75*zoom];};
 ctx.strokeStyle='#c5ac78';ctx.fillStyle='#dce5e9';ctx.lineWidth=.8;const triangles=mesh.kind.endsWith('TRIANGLES');const stride=triangles?3:1,skip=Math.max(1,Math.ceil(mesh.vertices.length/(stride*5000)))*stride;
 for(let i=0;i<mesh.vertices.length;i+=skip){const p=project(mesh.vertices[i]);if(triangles){const q=project(mesh.vertices[i+1]),r=project(mesh.vertices[i+2]);ctx.beginPath();ctx.moveTo(...p);ctx.lineTo(...q);ctx.lineTo(...r);ctx.closePath();ctx.stroke();}else ctx.fillRect(p[0],p[1],2,2);}
 ctx.fillStyle='#fff';ctx.font='18px Arial';ctx.fillText(triangles?'Uploaded STL · bounded triangle preview':'STEP reference points · surfaces not tessellated',20,30);}
$('mesh-file').addEventListener('change',async e=>{const generation=++loadGeneration;try{const value=await read(e.target.files[0]);if(generation!==loadGeneration)return;current=value;yaw=.35;pitch=.15;zoom=1;provenance();draw();$('mesh-status').textContent=current.mesh.vertices.length+' source vertices. '+current.mesh.notice;}catch(e){if(generation===loadGeneration){current=null;draw();$('mesh-status').textContent=String(e.message);}}});
for(const id of ['revision','units'])$(id).addEventListener('change',provenance);
$('mesh').addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY};e.target.setPointerCapture(e.pointerId);});$('mesh').addEventListener('pointermove',e=>{if(!drag)return;yaw+=(e.clientX-drag.x)/150;pitch+=(e.clientY-drag.y)/150;drag={x:e.clientX,y:e.clientY};draw();});$('mesh').addEventListener('pointerup',()=>drag=null);$('mesh').addEventListener('pointercancel',()=>drag=null);$('mesh').addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(.2,Math.min(8,zoom*(e.deltaY<0?1.1:.9)));draw();},{passive:false});$('reset').addEventListener('click',()=>{yaw=.35;pitch=.15;zoom=1;draw();});
$('compare').addEventListener('click',async()=>{try{if(!current||!$('revision').value||!$('compare-revision').value||$('units').value==='UNSPECIFIED')throw Error('Choose both revision references and declare common units before comparison.');const first=current,other=await read($('compare-file').files[0]);if(current!==first)throw Error('First source changed.');$('comparison').textContent=JSON.stringify({first:{name:first.name,revision:$('revision').value,sha256:first.sha256},second:{name:other.name,revision:$('compare-revision').value,sha256:other.sha256},declaredCommonUnits:$('units').value,...compareEngineeringVertices(first.mesh,other.mesh)},null,2);}catch(e){$('comparison').textContent=String(e.message);}});

let activeEngineeringMic=null;
function sayEngineeringAnswer(text){
 $('engineering-answer').textContent=text;
 if(document.visibilityState!=='visible'||typeof window.speechSynthesis?.speak!=='function'||typeof window.SpeechSynthesisUtterance!=='function')return;
 try{
  window.speechSynthesis.cancel();
  const utterance=new window.SpeechSynthesisUtterance(text.slice(0,850));
  utterance.lang='en-IN';utterance.rate=.97;
  window.speechSynthesis.speak(utterance);
 }catch{/* Visible text remains the source of truth. */}
}
function answerEngineeringQuestion(){
 const request=$('engineering-question').value.trim();
 const action=planEngineeringViewerQuestion(request);
 if(action.kind==='DENY'){sayEngineeringAnswer('I can inspect this geometry, but I cannot edit, generate, measure unrecoverable physical clearances, or approve engineering release. Use controlled VEDM engineering review for such decisions.');return;}
 if(!current){sayEngineeringAnswer('Please upload a local STL or STEP artifact first. Nothing was sent to any server.');return;}
 if(action.kind==='VIEW'){
  const angles={TOP:[0,Math.PI/2],SIDE:[Math.PI/2,0],FRONT:[0,0],ISOMETRIC:[.35,.15]};
  [yaw,pitch]=angles[action.view];zoom=1;draw();
  sayEngineeringAnswer('Certainly. Showing the '+action.view.toLowerCase()+' projected view of the uploaded '+(current.mesh.kind==='STEP_REFERENCE_POINTS_ONLY'?'STEP reference points':'STL triangles')+'. This is a local visual inspection, not a dimensional or release approval.');
 }else if(action.kind==='ZOOM'){
  zoom=Math.max(.2,Math.min(8,zoom*action.factor));draw();sayEngineeringAnswer('The local engineering preview is now '+(action.factor>1?'zoomed in.':'zoomed out.'));
 }else if(action.kind==='BOUNDS'){
  sayEngineeringAnswer(describeEngineeringBounds(current.mesh,$('units').value));
 }else if(action.kind==='PROVENANCE'){
  provenance();sayEngineeringAnswer('Loaded source: '+current.name+'. SHA-256: '+current.sha256+'. The revision label and coordinate units are user-declared. This is a proposed artifact and no engineering release is implied.');
 }else sayEngineeringAnswer('Please ask me to show the top, front or side view, zoom, report coordinate bounds, or show source provenance. I cannot generate, validate or approve CAD.');
}
$('engineering-ask').addEventListener('click',answerEngineeringQuestion);
$('engineering-question').addEventListener('keydown',event=>{
 if(event.key==='Enter'){event.preventDefault();answerEngineeringQuestion();}
});
$('engineering-mic').addEventListener('click',()=>{
 const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(activeEngineeringMic){try{activeEngineeringMic.abort()}catch{}activeEngineeringMic=null;return;}
 if(typeof Recognition!=='function'){$('engineering-answer').textContent='Browser speech recognition is not available. Type your engineering question instead.';return;}
 let mic;try{
  mic=new Recognition();mic.lang='en-IN';mic.continuous=false;mic.interimResults=false;
  mic.onresult=event=>{
   if(activeEngineeringMic!==mic)return;
   const result=[...(event.results||[])].find(x=>x.isFinal)?.[0]?.transcript;
   activeEngineeringMic=null;try{mic.stop()}catch{}
   if(typeof result==='string'&&result.trim().length>=3){
    $('engineering-question').value=result.slice(0,220);answerEngineeringQuestion();
   }
  };
  mic.onerror=()=>{if(activeEngineeringMic===mic){activeEngineeringMic=null;$('engineering-answer').textContent='Microphone unavailable. Type a view question instead.';}};
  mic.onend=()=>{if(activeEngineeringMic===mic)activeEngineeringMic=null;};
  activeEngineeringMic=mic;mic.start();
  $('engineering-answer').textContent='Listening for one engineering view question…';
 }catch{activeEngineeringMic=null;$('engineering-answer').textContent='Microphone unavailable. Type a question instead.';}
});
function stopEngineeringMedia(){
 const mic=activeEngineeringMic;activeEngineeringMic=null;try{mic?.abort()}catch{}
 try{window.speechSynthesis?.cancel()}catch{}
}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')stopEngineeringMedia();});
window.addEventListener('pagehide',stopEngineeringMedia);

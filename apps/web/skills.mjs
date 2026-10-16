const $=id=>document.getElementById(id);
const local=location.hostname==='127.0.0.1';
let endpoint='',token='',capabilities={},timer=null,reviewedJob=null,currentArtifact=null,currentResult='',voiceGeneration=0,recording=null,mapView=null;
const handled=new Set(),voiceJobs=new Map();
let browserSteps=[];
const message=value=>{$('app-status').textContent=value;};
const friendly={PAIRING_REQUIRED:'The pairing code is missing or expired. Reconnect your computer.',PYTHON_UNAVAILABLE:'The companion’s Python tools are not installed or configured.',VOICE_MODEL_NOT_INSTALLED:'Install the local voice model before recording.',DESKTOP_WINDOW_CHANGED:'The requested window is unavailable or its title changed. No input was sent.',BROWSER_PRIVATE_ADDRESS_DENIED:'Browser tasks require a public website address.',SKILL_PURPOSE_UNSUPPORTED:'This version can generate text-cleanup tools. Choose one of the listed operations.'};
async function api(path,method='GET',data){
 if(!token)throw Error('PAIRING_REQUIRED');
 const response=await fetch(endpoint+path,{method,headers:{Authorization:'Bearer '+token,...(data===undefined?{}:{'Content-Type':'application/json'})},body:data===undefined?undefined:JSON.stringify(data),credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(15000)});
 const result=await response.json();if(!response.ok)throw Error(result.error||'REQUEST_FAILED');return result;
}
function failure(error){message(friendly[error.message]||'Operation unavailable: '+error.message);}
function bindForm(id,handler){$(id).addEventListener('submit',async event=>{event.preventDefault();const button=event.submitter;button.disabled=true;try{await handler(Object.fromEntries(new FormData(event.target)),event.target);}catch(error){failure(error);}finally{button.disabled=false;}});}
function button(label,action){const element=document.createElement('button');element.textContent=label;element.addEventListener('click',()=>Promise.resolve(action()).catch(failure));return element;}
function article(title,body){const element=document.createElement('article'),heading=document.createElement('h2'),content=document.createElement('pre');heading.textContent=title;content.textContent=body;element.append(heading,content);return element;}
function panel(name){
 for(const view of document.querySelectorAll('[data-view]'))view.hidden=view.dataset.view!==name;
 for(const tab of document.querySelectorAll('[data-panel]')){const active=tab.dataset.panel===name;if(active){tab.setAttribute('aria-current','page');$('panel-title').textContent=tab.querySelector('span').textContent;}else tab.removeAttribute('aria-current');}
 $('result-panel').hidden=true;
}
for(const tab of document.querySelectorAll('[data-panel]'))tab.addEventListener('click',()=>{panel(tab.dataset.panel);$('skill-workspace').focus({preventScroll:true});if(token&&tab.dataset.panel==='documents')void refreshArtifacts();if(token&&tab.dataset.panel==='memory')void refreshMemory();if(token&&tab.dataset.panel==='routines')void refreshRoutines();if(token&&tab.dataset.panel==='forge')void refreshSkills();});
function showResult(job){
 if(job.kind==='voice.transcribe'&&voiceJobs.get(job.id)!==voiceGeneration)return;
 const result=job.result||{};
 currentResult=result.text||JSON.stringify(result,null,2);currentArtifact=result.artifact||null;
 $('result-text').textContent=currentResult;$('result-panel').hidden=false;$('result-download').hidden=!currentArtifact;
 if(job.kind==='voice.transcribe'&&voiceJobs.get(job.id)===voiceGeneration){
  const draft=result.text||'';$('vaos-voice-question').value=draft.slice(0,300);
  $('vaos-main-voice').dispatchEvent(new CustomEvent('vaos-transcript',{detail:{text:draft.slice(0,300)}}));
  $('capture-state').textContent=draft?'Question captured. Review it, then select Ask VAOS.':'No speech recognized. Try again.';
 }
}
async function refreshJobs(){
 if(!token)return;
 const jobs=await api('/api/jobs');$('job-list').replaceChildren();
 if(!jobs.length){const li=document.createElement('li');li.textContent='No tasks yet.';li.className='muted';$('job-list').append(li);}
 for(const job of jobs.slice(0,12)){
  const li=document.createElement('li');li.className='job';li.dataset.state=job.state;
  const title=document.createElement('strong'),phase=document.createElement('small'),actions=document.createElement('div');
  title.textContent=job.kind.replaceAll('.',' / ');phase.textContent=job.state+' · '+(job.events.at(-1)?.message||'');actions.className='actions';
  if(job.state==='review')actions.append(button('Review action',()=>{reviewedJob=job;$('review-details').textContent=JSON.stringify(job.review,null,2);$('review-dialog').showModal();}));
  if(['queued','running','review'].includes(job.state))actions.append(button('Stop',async()=>{await api('/api/jobs/'+job.id+'/stop','POST',{});await refreshJobs();}));
  if(job.result)actions.append(button('View result',()=>showResult(job)));
  li.append(title,phase,actions);$('job-list').append(li);
  if(['succeeded','failed','stopped'].includes(job.state)&&!handled.has(job.id)){
   handled.add(job.id);
   if(job.state==='succeeded'){showResult(job);message('Task completed. Review the result.');}
   else message(friendly[job.error]||job.events.at(-1)?.message||job.state);
  }
 }
 clearTimeout(timer);timer=null;
 if(jobs.some(j=>['queued','running','review'].includes(j.state)))timer=setTimeout(()=>void refreshJobs().catch(failure),900);
}
async function submit(kind,input){const job=await api('/api/jobs','POST',{kind,input});message(job.state==='review'?'Action prepared. Review it in Task activity before it can run.':'Task queued on your computer.');await refreshJobs();return job;}
async function connect(address,code){
 const url=new URL(address);
 if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('Use an address such as http://127.0.0.1:47831');
 endpoint=url.origin;token=code.trim();
 try{const status=await api('/api/status');capabilities=status.capabilities;}catch(error){token='';throw error;}
 $('connection-state').textContent='Local companion connected';$('connect-open').hidden=true;$('disconnect').hidden=false;
 $('copy-pair-code').hidden=!local;$('shutdown').hidden=false;
 $('capabilities').replaceChildren();
 for(const [name,value] of Object.entries(capabilities)){const ready=typeof value==='object'?Object.values(value).every(Boolean):value;const li=document.createElement('li');li.textContent=name+': '+(ready?'available':'setup needed');li.dataset.ready=String(ready);$('capabilities').append(li);}
 $('connect-dialog').close();message('Connected to your computer. Choose a skill to begin.');await refreshJobs();
}
$('connect-open').addEventListener('click',()=>$('connect-dialog').showModal());
$('connect-cancel').addEventListener('click',()=>$('connect-dialog').close());
$('copy-pair-code').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(token);message('Pairing code copied. Open VAOS Skills, choose Connect computer, and paste it there.');}catch{message('Clipboard unavailable. Restart the companion without --open to display a session code in its terminal.');}});
$('shutdown').addEventListener('click',async()=>{if(!confirm('Stop the companion, its running tasks and scheduled routines?'))return;try{await api('/api/shutdown','POST',{confirm:'STOP COMPANION'});void stopCapture(false);token='';clearTimeout(timer);$('connection-state').textContent='Companion stopped';$('shutdown').hidden=true;$('disconnect').hidden=true;$('copy-pair-code').hidden=true;$('connect-open').hidden=false;message('Companion stopped. Routines will resume only after you start it again.');}catch(error){failure(error);}});
bindForm('connect-form',async data=>{try{await connect(data.endpoint,data.token);$('connect-error').textContent='';}catch(error){$('connect-error').textContent=friendly[error.message]||error.message;}});
$('disconnect').addEventListener('click',async()=>{try{await api('/api/revoke','POST',{});}catch{}stopCapture(false);window.speechSynthesis?.cancel();token='';capabilities={};clearTimeout(timer);$('connection-state').textContent='Companion disconnected';$('connect-open').hidden=false;$('disconnect').hidden=true;message('Pairing revoked. Reopen the companion for a new code.');});
$('refresh-jobs').addEventListener('click',()=>void refreshJobs().catch(failure));
$('approve-action').addEventListener('click',async()=>{if(!reviewedJob)return;try{await api('/api/jobs/'+reviewedJob.id+'/approve','POST',{hash:reviewedJob.hash,confirm:'RUN LOCAL ACTION'});$('review-dialog').close();reviewedJob=null;await refreshJobs();}catch(error){failure(error);}});
$('reject-action').addEventListener('click',async()=>{if(reviewedJob)await api('/api/jobs/'+reviewedJob.id+'/stop','POST',{});reviewedJob=null;$('review-dialog').close();await refreshJobs();});
bindForm('document-form',data=>submit('document.create',data));
bindForm('browser-form',data=>submit('browser.research',data));
function browserStep(data){if(!data.target.trim())throw Error('Enter the field label or button/link text.');return {action:data.action,target:data.target,targetType:data.action==='fill'?'label':data.action==='download'?'link':'button',...(data.action==='fill'?{value:data.value}:{})};}
function renderBrowserSteps(){$('browser-steps').replaceChildren();browserSteps.forEach((step,i)=>{const li=document.createElement('li');li.append(document.createTextNode(step.action+' · '+step.target+' '),button('Remove',()=>{browserSteps.splice(i,1);renderBrowserSteps();}));$('browser-steps').append(li);});}
$('browser-add-step').addEventListener('click',()=>{try{if(browserSteps.length>=8)throw Error('A browser task can contain at most eight steps.');const form=$('browser-action-form');browserSteps.push(browserStep(Object.fromEntries(new FormData(form))));form.elements.target.value='';form.elements.value.value='';renderBrowserSteps();}catch(error){failure(error);}});
bindForm('browser-action-form',async data=>{const steps=[...browserSteps];if(data.target.trim())steps.push(browserStep(data));if(!steps.length)throw Error('Add at least one browser action.');await submit('browser.workflow',{url:data.url,steps,writePaths:data.writePaths.split(/\r?\n/).map(p=>p.trim()).filter(Boolean)});browserSteps=[];renderBrowserSteps();$('browser-action-form').elements.value.value='';});
bindForm('desktop-form',data=>submit('desktop.action',{...data,x:Number(data.x),y:Number(data.y)}));
async function refreshMemory(search=''){
 try{const rows=await api('/api/memories?q='+encodeURIComponent(search));$('memory-list').replaceChildren();
  if(!rows.length)$('memory-list').textContent='No matching saved memories.';
  for(const row of rows){const item=article(row.title,row.body);item.append(button('Edit',()=>{for(const [key,value] of Object.entries(row)){const field=$('memory-form').elements.namedItem(key);if(field)field.value=value;}$('memory-form').elements.title.focus();}),button('Delete',async()=>{if(confirm('Delete this saved memory from your computer?')){await api('/api/memories/'+row.id,'DELETE');await refreshMemory();}}));$('memory-list').append(item);}
 }catch(error){failure(error);}
}
bindForm('memory-form',async(data,form)=>{if(!data.id)delete data.id;await api('/api/memories','POST',data);form.reset();message('Memory saved locally.');await refreshMemory();});
bindForm('memory-search',data=>refreshMemory(data.q));
async function refreshRoutines(){try{const rows=await api('/api/routines');$('routine-list').replaceChildren();for(const row of rows){const item=article(row.title,row.eventName?'On event '+row.eventName:'Every '+row.intervalMs/60000+' minutes while the companion is open');item.append(button('Delete routine',async()=>{await api('/api/routines/'+row.id,'DELETE');await refreshRoutines();}));$('routine-list').append(item);}if(!rows.length)$('routine-list').textContent='No saved routines.';}catch(error){failure(error);}}
bindForm('routine-form',async data=>{await api('/api/routines','POST',{title:data.title,kind:data.kind,input:data.kind==='document.create'?{format:'pdf',title:data.title,body:data.body}:{},...(data.trigger==='event'?{eventName:data.eventName}:{intervalMs:Number(data.minutes)*60000})});message('Routine saved. It runs while the companion is open.');await refreshRoutines();});
bindForm('event-form',async data=>{await api('/api/events','POST',{name:data.name,id:crypto.randomUUID()});message('Event sent. Matching routines will appear in Task activity.');await refreshJobs();});
async function refreshSkills(){try{const rows=await api('/api/skills');$('skill-list').replaceChildren();$('approved-skills').replaceChildren();for(const row of rows){const item=article(row.definition.name,row.state+' · '+JSON.stringify(row.definition,null,2)+'\nReviewed SHA-256: '+row.hash);if(row.state==='approved')item.append(button('Revoke tool',async()=>{await api('/api/skills/'+row.id+'/revoke','POST',{hash:row.hash});await refreshSkills();}));if(row.state==='tested')item.append(button('Approve tested tool',async()=>{await api('/api/skills/'+row.id+'/approve','POST',{hash:row.hash});await refreshSkills();}));if(row.state==='approved'){const option=document.createElement('option');option.value=row.id;option.textContent=row.definition.name;$('approved-skills').append(option);}$('skill-list').append(item);}if(!rows.length)$('skill-list').textContent='No custom tools yet.';}catch(error){failure(error);}}
bindForm('forge-form',async data=>{const result=await api('/api/skills/propose','POST',{name:data.name,purpose:data.purpose,tests:[{input:data.input,expected:data.expected}]});message(result.state==='tested'?'Test passed. Review and approve the tool to enable it.':'Test failed. The tool cannot be approved. Adjust the purpose or expected result.');await refreshSkills();});
bindForm('skill-run-form',data=>submit('skill.run',data));
function upload(file){return new Promise((ok,fail)=>{if(file.size>10000000)return fail(Error('The selected file exceeds 10 MB.'));const reader=new FileReader();reader.onerror=()=>fail(Error('FILE_READ_FAILED'));reader.onload=()=>ok(String(reader.result).split(',')[1]);reader.readAsDataURL(file);});}
async function ocr(file){const format=file.type==='image/png'?'png':file.type==='image/jpeg'?'jpg':null;if(!format)throw Error('Choose a PNG or JPEG image.');return submit('image.ocr',{format,data:await upload(file)});}
bindForm('ocr-form',async(_data,form)=>{await ocr(form.elements.image.files[0]);});
$('capture-screen').addEventListener('click',async()=>{let stream;try{if(!token)throw Error('PAIRING_REQUIRED');stream=await navigator.mediaDevices.getDisplayMedia({video:true,audio:false});const video=document.createElement('video');video.srcObject=stream;await video.play();const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;canvas.getContext('2d').drawImage(video,0,0);const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));stream.getTracks().forEach(t=>t.stop());await ocr(new File([blob],'selected-screen.png',{type:'image/png'}));}catch(error){failure(error);}finally{stream?.getTracks().forEach(t=>t.stop());}});
async function refreshArtifacts(){try{const rows=await api('/api/artifacts');$('artifact-list').replaceChildren();for(const row of rows){const item=article(row.filename,row.bytes+' bytes · '+new Date(row.created).toLocaleString());item.append(button('Download',()=>downloadArtifact(row)),button('Delete file',async()=>{if(confirm('Delete this generated file from the companion? Your previously downloaded copies remain.')){await api('/api/artifacts/'+row.id,'DELETE');await refreshArtifacts();}}));$('artifact-list').append(item);}if(!rows.length)$('artifact-list').textContent='No generated files yet.';}catch(error){failure(error);}}
async function downloadArtifact(artifact){const response=await fetch(endpoint+'/api/artifacts/'+artifact.id,{headers:{Authorization:'Bearer '+token},credentials:'omit',referrerPolicy:'no-referrer'});if(!response.ok)throw Error('DOWNLOAD_FAILED');const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');link.href=url;link.download=artifact.filename||'VAOS-report';link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
async function stopCapture(send){
 const active=recording;if(!active){if(!send)voiceGeneration++;return;}
 recording=null;clearTimeout(active.timeout);cancelAnimationFrame(active.frame);$('record').disabled=false;$('record-stop').disabled=true;
 active.send=send;if(active.recorder.state!=='inactive')active.recorder.stop();active.stream.getTracks().forEach(t=>t.stop());await active.context.close().catch(()=>{});$('waveform').getContext('2d').clearRect(0,0,640,64);
 if(!send){voiceGeneration++;$('capture-state').textContent='Microphone off. Recording discarded.';}
}
$('record').addEventListener('click',async()=>{let pendingStream,pendingContext;try{
 if(!capabilities.voice)throw Error('VOICE_MODEL_NOT_INSTALLED');
 await stopCapture(false);window.speechSynthesis?.cancel();if(!$('vaos-voice-stop').disabled)$('vaos-voice-stop').click();
 const generation=++voiceGeneration,stream=pendingStream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
 if(generation!==voiceGeneration){stream.getTracks().forEach(t=>t.stop());return;}
 const context=pendingContext=new AudioContext(),analyser=context.createAnalyser();context.createMediaStreamSource(stream).connect(analyser);analyser.fftSize=256;
 const mime=['audio/webm','audio/ogg'].find(type=>MediaRecorder.isTypeSupported(type));if(!mime){stream.getTracks().forEach(t=>t.stop());await context.close();throw Error('Browser recording format is unsupported.');}
 const recorder=new MediaRecorder(stream,{mimeType:mime}),chunks=[];
 const active={stream,context,recorder,chunks,send:false,generation,frame:0};recording=active;pendingStream=null;pendingContext=null;
 const canvas=$('waveform'),ctx=canvas.getContext('2d'),levels=new Uint8Array(analyser.frequencyBinCount);
 function draw(){if(recording!==active)return;analyser.getByteFrequencyData(levels);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#d1ad65';for(let i=0;i<32;i++){const height=levels[i*2]/4;ctx.fillRect(i*20,32-height/2,10,height);}active.frame=requestAnimationFrame(draw);}draw();
 recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
 recorder.onstop=async()=>{try{if(!active.send||generation!==voiceGeneration)return;const blob=new Blob(chunks,{type:mime}),data=await upload(blob);if(generation!==voiceGeneration)return;const job=await api('/api/jobs','POST',{kind:'voice.transcribe',input:{format:mime.includes('ogg')?'ogg':'webm',data}});if(generation!==voiceGeneration){await api('/api/jobs/'+job.id+'/stop','POST',{});return;}voiceJobs.set(job.id,generation);$('capture-state').textContent='Transcribing on your computer…';await refreshJobs();}catch(error){failure(error);}};
 recorder.onerror=()=>{void stopCapture(false);message('Recording failed. Microphone capture stopped.');};
 recorder.start();active.timeout=setTimeout(()=>void stopCapture(true),30000);$('record').disabled=true;$('record-stop').disabled=false;$('capture-state').textContent='Recording locally. Finish sends the audio; Stop audio discards it.';
}catch(error){pendingStream?.getTracks().forEach(t=>t.stop());if(pendingContext)await pendingContext.close().catch(()=>{});failure(error);}});
$('record-stop').addEventListener('click',()=>void stopCapture(true));
$('audio-stop').addEventListener('click',()=>{void stopCapture(false);window.speechSynthesis?.cancel();for(const id of voiceJobs.keys())void api('/api/jobs/'+id+'/stop','POST',{}).catch(()=>{});if(!$('vaos-voice-stop').disabled)$('vaos-voice-stop').click();});
function speak(text){if(!window.speechSynthesis||!window.SpeechSynthesisUtterance){message('Speech playback is unavailable in this browser.');return;}window.speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(text.slice(0,5000));utterance.onerror=()=>message('Speech playback failed. Read the displayed result.');window.speechSynthesis.speak(utterance);}
$('result-speak').addEventListener('click',()=>speak(currentResult));
$('result-download').addEventListener('click',()=>{if(currentArtifact)void downloadArtifact(currentArtifact).catch(failure);});
$('map-toggle').addEventListener('click',async()=>{const target=$('capability-map');target.hidden=!target.hidden;if(!target.hidden){try{if(!mapView){const {createSkillsMap}=await import('/skills-map.mjs');mapView=createSkillsMap(target,capabilities);}}catch{target.textContent='3D is unavailable here. The capability list above remains available.';}}});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState!=='visible'){void stopCapture(false);window.speechSynthesis?.cancel();}});
window.addEventListener('pagehide',()=>{void stopCapture(false);clearTimeout(timer);mapView?.dispose();});
if(local){$('vaos-voice-ask').disabled=true;$('vaos-voice-status').textContent='For authenticated business questions, copy the pairing code above, then ';const link=document.createElement('a');link.href='https://vaos.vayushastr.workers.dev/skills.html';link.target='_blank';link.rel='noopener noreferrer';link.textContent='open VAOS Skills and connect this computer.';$('vaos-voice-status').append(link);}
else import('/main-voice.mjs').catch(()=>message('VAOS voice controls could not load. Refresh the page.'));
const fragment=new URLSearchParams(location.hash.slice(1)),pair=fragment.get('pair');
if(pair){history.replaceState(null,'',location.pathname);if(local)void connect(location.origin,pair).catch(failure);}

import {VISUAL_MODES,getVisualMode,resolveVisualMode} from './lib/visual-command-model.mjs';

const $=id=>document.getElementById(id);
const main=$('vc-main'),auth=$('vc-auth-status'),menu=$('vc-menu'),message=$('vc-message');
const business=$('business-intelligence'),frameShell=$('vc-frame-shell'),frame=$('vc-frame');
const linkShell=$('vc-link-shell'),link=$('vc-link'),open=$('vc-open-view');
let current=null,biLoaded=false,loadingBi=false,recognition=null;

function messageText(text){message.textContent=text;}

function drawMenu(){
 for(const item of VISUAL_MODES){
  const button=document.createElement('button');
  button.type='button';button.className='vc-menu-item';button.dataset.visual=item.id;
  button.append(Object.assign(document.createElement('strong'),{textContent:item.label}),
    Object.assign(document.createElement('small'),{textContent:item.kicker}));
  button.addEventListener('click',()=>selectVisual(item.id));
  menu.append(button);
 }
}

async function loadBi(){
 if(biLoaded||loadingBi)return;
 loadingBi=true;messageText('Loading the existing signed-source BI Studio…');
 try{
  await import('./bi-entry.mjs');
  biLoaded=true;
  messageText('BI Studio ready. Select a qualified metric, period and chart/table view.');
 }catch{
  messageText('BI Studio could not load. Use Open full workspace to inspect authorized records.');
 }finally{loadingBi=false;}
}

function selectVisual(id,{push=true}={}){
 const mode=getVisualMode(id);
 if(!mode)return false;
 current=mode.id;
 for(const button of menu.querySelectorAll('[data-visual]')){
  const active=button.dataset.visual===mode.id;
  button.setAttribute('aria-current',active?'page':'false');
 }
 $('vc-view-kicker').textContent=mode.kicker;
 $('vc-view-title').textContent=mode.title;
 $('vc-view-description').textContent=mode.description;
 open.href=mode.href;link.href=mode.href;
 business.hidden=mode.renderer!=='bi';
 frameShell.hidden=mode.renderer!=='embed';
 linkShell.hidden=mode.renderer!=='link';
 if(mode.renderer==='bi'){
  if(frame.getAttribute('src'))frame.removeAttribute('src');
  void loadBi();
 }else if(mode.renderer==='embed'){
  if(frame.getAttribute('src')!==mode.href)frame.src=mode.href;
  frame.title=mode.title+' · authenticated VAOS view';
 }else if(frame.getAttribute('src'))frame.removeAttribute('src');
 if(push){
  const url=new URL(location.href);
  url.searchParams.set('visual',mode.id);
  history.replaceState(null,'',url);
 }
 return true;
}

function openIntent(raw){
 const selected=resolveVisualMode(raw);
 if(!selected){messageText('No safe visual destination matched. Choose a workspace below. Only read-only navigation is supported.');return;}
 selectVisual(selected.id);
 messageText('Showing '+selected.title+'. Its source and authorization checks are retained.');
}

function setupVoice(){
 const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
 const mic=$('vc-mic');
 if(typeof SpeechRecognition!=='function'){
  mic.disabled=true;mic.title='Speech recognition is unavailable in this browser. Use the text command.';
  return;
 }
 mic.addEventListener('click',()=>{
  if(recognition){try{recognition.abort();}catch{} recognition=null;mic.setAttribute('aria-pressed','false');return;}
  try{
   const engine=new SpeechRecognition();
   recognition=engine;engine.lang='en-IN';engine.continuous=false;engine.interimResults=false;engine.maxAlternatives=1;
   mic.setAttribute('aria-pressed','true');
   messageText('Listening for a visual navigation request. No recording is saved by VAOS.');
   engine.onresult=event=>{
    const raw=event.results?.[0]?.[0]?.transcript||'';
    $('vc-command-input').value=raw.slice(0,240);
    openIntent(raw);
   };
   engine.onerror=()=>messageText('Microphone recognition unavailable. Use the text command.');
   engine.onend=()=>{if(recognition===engine)recognition=null;mic.setAttribute('aria-pressed','false');};
   engine.start();
  }catch{
   recognition=null;mic.setAttribute('aria-pressed','false');
   messageText('Microphone could not start. Use the text command.');
  }
 });
}

async function bootstrap(){
 try{
  const response=await fetch('/api/session',{credentials:'same-origin',cache:'no-store'});
  if(response.status===401){location.replace('/login');return;}
  if(!response.ok)throw Error('Authentication service unavailable; visual workspaces remain hidden.');
  const session=await response.json();
  if(session.authenticated!==true)throw Error('Authentication not confirmed; visual workspaces remain hidden.');
  auth.hidden=true;main.hidden=false;
  drawMenu();
  $('vc-command-form').addEventListener('submit',event=>{
   event.preventDefault();openIntent($('vc-command-input').value);
  });
  setupVoice();
  const initial=new URL(location.href).searchParams.get('visual');
  selectVisual(getVisualMode(initial)?initial:'overview',{push:false});
 }catch(e){auth.textContent=e.message||'Unable to verify authorization. Sign in and retry.';}
}
void bootstrap();

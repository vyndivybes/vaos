import {VISUAL_MODES,getVisualMode,resolveVisualMode} from './lib/visual-command-model.mjs';

const $=id=>document.getElementById(id);
const main=$('vc-main'),auth=$('vc-auth-status'),menu=$('vc-menu'),message=$('vc-message');
const business=$('business-intelligence'),nativeHost=$('vc-native-host');
const linkShell=$('vc-link-shell'),link=$('vc-link'),open=$('vc-open-view');
let current=null,biLoaded=false,loadingBi=false,recognition=null;
let nativeCleanup=null,visualSelection=0;

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

async function loadNativeVisual(mode,revision){
 messageText('Opening '+mode.title+' in this workspace…');
 try{
  const {mountVisualCommandViz}=await import('./visual-command-native.mjs');
  if(revision!==visualSelection||current!==mode.id)return;
  nativeCleanup=mountVisualCommandViz(nativeHost,mode.id,{onNavigate:kind=>selectVisual(kind)});
  messageText('Showing '+mode.title+'. The charts are examples, not live operational results.');
 }catch{
  if(revision!==visualSelection)return;
  messageText('This example could not load. Use Open full workspace to see the full visual tool.');
 }
}

function selectVisual(id,{push=true}={}){
 const mode=getVisualMode(id);
 if(!mode)return false;
 nativeCleanup?.();nativeCleanup=null;
 const revision=++visualSelection;
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
 nativeHost.hidden=mode.renderer!=='native';
 linkShell.hidden=mode.renderer!=='link';
 nativeHost.replaceChildren();
 if(mode.renderer==='bi')void loadBi();
 if(mode.renderer==='native')void loadNativeVisual(mode,revision);
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
 messageText(selected.renderer==='link'
  ?'Open '+selected.title+' in the full workspace to keep its tools and access controls visible.'
  :'Opening '+selected.title+' with its existing source and authorization checks.');
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

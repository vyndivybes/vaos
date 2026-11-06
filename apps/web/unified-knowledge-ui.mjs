import {SOURCE_INFO} from './neural-knowledge-client.mjs';
import {UNIVERSE_SOURCES,mergeKnowledgeSources,selectKnowledgeView,
 historicalSearchGraph,googleSearchGraph,githubEvidenceGraph,githubRepositoryInventoryGraph,chatHistoryGraph} from './lib/unified-knowledge-graph.mjs';
import {createUniverseRenderer,universeColor} from './unified-knowledge-render.mjs';

const $=id=>document.getElementById(id);
const LABELS=Object.fromEntries([...SOURCE_INFO.map(x=>[x.id,x.label]),
 ['gmail','Gmail'],['drive','Google Drive'],['github','GitHub'],['chatgpt','ChatGPT export'],
 ['vyndios','VYNDI OS historical'],['vaos','VAOS historical']]);
const governed=new Set(SOURCE_INFO.map(x=>x.id));
const docs=new Map(),statuses=new Map(),holds=new Map();
let graph={nodes:[],edges:[],sources:[]},focus=null;
const renderer=createUniverseRenderer($('universe-svg'),id=>{focus=id;$('universe-search').value='';$('universe-mode').value='lineage';render();});
const status=(message,blocked=false)=>{
 const el=$('universe-status');el.textContent=message;el.classList.toggle('is-hold',blocked);
};
function choices(){
 const root=$('universe-sources');
 const checked=new Set([...root.querySelectorAll('input:checked')].map(e=>e.value));
 if(!root.children.length)for(const s of governed)checked.add(s);
 root.replaceChildren();
 for(const source of UNIVERSE_SOURCES){
  const label=document.createElement('label');label.className='universe-source';
  const input=document.createElement('input');input.type='checkbox';input.value=source;input.checked=checked.has(source);
  input.addEventListener('change',()=>{render();});
  const icon=document.createElement('i');icon.style.background=universeColor(source);icon.setAttribute('aria-hidden','true');
  const title=document.createElement('span');title.textContent=LABELS[source];
  const help=document.createElement('small');
  const state=statuses.get(source);
  help.textContent=docs.has(source)?docs.get(source).nodes.length+' observed':
   state==='NOT_COMMISSIONED'?'HOLD':state?.includes('CONFIGURED')?'CHECK':
    governed.has(source)?'Not loaded':'On demand';
  label.append(input,icon,title,help);root.append(label);
 }
}
const selected=()=>[...$('universe-sources').querySelectorAll('input:checked')].map(input=>input.value);
function rebuild(){
 try{graph=mergeKnowledgeSources([...docs.values()]);}
 catch{graph={nodes:[],edges:[],sources:[]};status('Source evidence contract rejected. No graph was displayed.',true);}
 choices();render();
}
async function readJSON(url){
 const response=await fetch(url,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
 const body=await response.json();
 if(!response.ok)throw Error(body?.error?.code||body?.reason||'SOURCE_HTTP_'+response.status);
 return body;
}
function pair(dl,name,value){
 const dt=document.createElement('dt'),dd=document.createElement('dd');
 dt.textContent=name;dd.textContent=String(value??'—');dl.append(dt,dd);
}
function inspect(){
 const details=$('universe-details'),related=$('universe-related');
 details.replaceChildren();related.replaceChildren();
 const node=graph.nodes.find(n=>n.id===focus);
 $('universe-focus-label').textContent=node?.label||'All selected evidence';
 $('universe-clear-focus').disabled=!node;
 if(!node){pair(details,'Selection','Choose any node to inspect directional lineage.');related.textContent='No node selected.';return;}
 for(const [label,value] of [['Record',node.label],['Source',LABELS[node.source]],['Type',node.kind],
  ['Source reference',node.sourceRef],['Revision',node.sourceRevision],['Observed at',node.observedAt],
  ['Pinned checksum',node.integrityVerified?'Verified':'Unverified'],
  ['Independent validation',node.independentVerification?'Verified':'Not certified'],
  ['Authority','Read only · no release authority']])pair(details,label,value);
 const edges=graph.edges.filter(e=>e.from===node.id||e.to===node.id).slice(0,40);
 if(!edges.length){related.textContent='No asserted relationships.';return;}
 for(const edge of edges){
  const other=graph.nodes.find(n=>n.id===(edge.from===node.id?edge.to:edge.from));
  if(!other)continue;
  const button=document.createElement('button');button.type='button';button.className='universe-related-item';
  button.textContent=(edge.from===node.id?'→ ':'← ')+edge.relation+' · '+other.label;
  button.addEventListener('click',()=>{focus=other.id;$('universe-search').value='';render();});
  related.append(button);
 }
}
function results(view){
 const list=$('universe-results');list.replaceChildren();
 if(!view.nodes.length){list.textContent='No observed source nodes match these filters.';return;}
 for(const node of view.nodes.slice(0,34)){
  const item=document.createElement('button');item.type='button';item.className='universe-result';
  const dot=document.createElement('i');dot.style.background=universeColor(node.source);
  const name=document.createElement('span');name.textContent=node.label;
  const source=document.createElement('small');source.textContent=LABELS[node.source]||node.source;
  item.append(dot,name,source);
  item.addEventListener('click',()=>{focus=node.id;$('universe-mode').value='lineage';$('universe-search').value='';render();});
  list.append(item);
 }
}
function render(){
 const sources=selected();
 if(focus&&!graph.nodes.some(n=>n.id===focus&&sources.includes(n.source)))focus=null;
 const mode=$('universe-mode').value;
 let view;
 try{view=sources.length?selectKnowledgeView(graph,{sources,search:$('universe-search').value,
  focus,direction:$('universe-direction').value,depth:Number($('universe-depth').value),
  asOf:$('universe-date').value,limit:mode==='matrix'?30:180}):
  {nodes:[],edges:[],totalMatchedNodes:0,truncated:false};}
 catch(error){status('Filter HOLD: '+String(error.message),true);return;}
 $('universe-total').textContent=String(graph.nodes.filter(n=>sources.includes(n.source)).length);
 $('universe-visible').textContent=String(view.nodes.length);
 $('universe-links').textContent=String(view.edges.length);
 $('universe-truncated').textContent=view.truncated?'Bounded view; narrow the search':'Selected view';
 $('universe-empty').hidden=view.nodes.length>0;
 inspect();results(view);renderer.render(view,mode,focus);
}
async function load(){
 const button=$('universe-load');button.disabled=true;holds.clear();
 status('Reading authorized sources; private records remain in the authenticated session.');
 try{
  const r=await readJSON('/api/neural-knowledge?source=registry');
  if(!Array.isArray(r?.data?.sources))throw Error('REGISTRY_INVALID');
  statuses.clear();for(const x of r.data.sources)statuses.set(x.id,x.status);
  for(const source of selected().filter(x=>governed.has(x))){
   docs.delete(source);
   if(statuses.get(source)==='NOT_COMMISSIONED'){holds.set(source,'Uncommissioned');continue;}
   try{
    const reply=await readJSON('/api/neural-knowledge?source='+encodeURIComponent(source));
    const d=reply?.data;
    if(d?.schemaVersion!=='VAOS_NEUTRAL_GRAPH_V1'||d.source!==source||d.status!=='OBSERVED'||
     d.readOnly!==true||d.actionAuthorized!==false)throw Error('UNQUALIFIED_RESPONSE');
    docs.set(source,d);
   }catch(error){holds.set(source,String(error.message||'SOURCE_HOLD'));}
  }
  status(docs.size+' observed source datasets; '+holds.size+' unavailable or uncommissioned.',holds.size>0);
 }catch(error){status('Source registry HOLD: '+String(error.message||'UNAVAILABLE'),true);}
 finally{button.disabled=false;rebuild();}
}
async function searchPrivate(event){
 event.preventDefault();
 const source=$('universe-private-source').value,q=$('universe-private-q').value.trim();
 const button=$('universe-private-submit');button.disabled=true;
 try{
  if(q.length<2||q.length>90)throw Error('QUERY_INVALID');
  let data;
  if(source==='gmail'||source==='drive'){
   const route=source==='gmail'?'mail':'drive';
   const r=await readJSON('/api/google-workspace/'+route+'?q='+encodeURIComponent(q));
   if(r.status!=='PASS'||r.actionAuthorized!==false)throw Error(r.reason||'OAUTH_REQUIRED');
   data=googleSearchGraph(source,source==='gmail'?r.messages:r.files);
  }else if(source==='github'){
   if(!/^[A-Za-z0-9][A-Za-z0-9 _.-]{3,89}$/.test(q))throw Error('GITHUB_QUERY_INVALID');
   const r=await readJSON('/api/federated-knowledge?q='+encodeURIComponent(q));
   if(r?.data?.readOnly!==true||r?.data?.actionAuthorized!==false)throw Error('GITHUB_SOURCE_HOLD');
   data=githubEvidenceGraph(r.data.evidence||[]);
   if(r.data.failedSources?.length)holds.set('github','Some allowlisted repositories unavailable');
  }else throw Error('SOURCE_DENIED');
  docs.set(source,data);
  const checkbox=[...$('universe-sources').querySelectorAll('input')].find(x=>x.value===source);
  if(checkbox)checkbox.checked=true;
  focus=null;rebuild();
  status(data.nodes.length+' observed '+LABELS[source]+' metadata nodes in this session. No mail bodies or Drive documents were copied.');
 }catch(error){status('Private lookup HOLD: '+String(error.message||'UNAVAILABLE')+'. Check authorization.',true);}
 finally{button.disabled=false;}
}
async function importHistory(){
 const input=$('universe-chat-file'),file=input.files?.[0];if(!file)return;
 try{
  if(file.size>20_000_000)throw Error('EXPORT_TOO_LARGE');
  const data=chatHistoryGraph(JSON.parse(await file.text()));
  docs.set('chatgpt',data);
  const checkbox=[...$('universe-sources').querySelectorAll('input')].find(x=>x.value==='chatgpt');
  if(checkbox)checkbox.checked=true;
  focus=null;rebuild();
  status(data.nodes.length+' ChatGPT history metadata nodes loaded locally. Message content discarded; zero upload.');
 }catch(error){status('Archive HOLD: '+String(error.message||'EXPORT_INVALID')+'. Choose conversations.json.',true);}
 finally{input.value='';}
}
async function loadRepos(){
 const button=$('universe-repos');button.disabled=true;
 try{
  const response=await readJSON('/api/universe-repositories');
  const d=response?.data;
  if(d?.schemaVersion!=='VAOS_GITHUB_REPOSITORY_INVENTORY_V1'||d.status!=='OBSERVED'||
   d.readOnly!==true||d.actionAuthorized!==false)throw Error('INVENTORY_NOT_GOVERNED');
  const result=githubRepositoryInventoryGraph(d.repositories);
  docs.set('github',result);
  const checkbox=[...$('universe-sources').querySelectorAll('input')].find(x=>x.value==='github');
  if(checkbox)checkbox.checked=true;
  focus=null;rebuild();
  status('Observed '+d.repositories.length+' repositories visible to the configured VAOS credential.'+
   (d.truncated?' Source pagination was truncated.':'')+' Additional GitHub accounts require their own authorization.');
 }catch(error){status('GitHub inventory HOLD: '+String(error.message||'UNAVAILABLE'),true);}
 finally{button.disabled=false;}
}
$('universe-repos').addEventListener('click',loadRepos);
$('universe-load').addEventListener('click',load);
$('universe-private-form').addEventListener('submit',searchPrivate);
$('universe-chat-file').addEventListener('change',importHistory);
for(const name of ['universe-search','universe-mode','universe-direction','universe-depth','universe-date'])
 $(name).addEventListener(name==='universe-search'?'input':'change',render);
$('universe-clear-focus').addEventListener('click',()=>{focus=null;render();});
$('universe-reset').addEventListener('click',renderer.reset);
$('universe-zoom-in').addEventListener('click',()=>renderer.adjust(1.2));
$('universe-zoom-out').addEventListener('click',()=>renderer.adjust(.83));
choices();render();
window.addEventListener('vaos:history-search-results',event=>{
 const rows=Array.isArray(event?.detail?.records)?event.detail.records.slice(0,350):[];
 const sources=[...new Set(rows.map(r=>r?.source))].filter(Boolean);
 for(const source of sources){
  try{
   const projected=historicalSearchGraph(source,rows);
   docs.set(source,projected);
  }catch{status('Historical results require qualified source provenance.',true);return;}
 }
 for(const checkbox of $('universe-sources').querySelectorAll('input')){
  if(sources.includes(checkbox.value))checkbox.checked=true;
 }
 focus=null;rebuild();
});

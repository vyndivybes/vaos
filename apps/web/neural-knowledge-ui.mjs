import {SOURCE_INFO,selectGraphView,graphPositions,sourceReadiness} from './neural-knowledge-client.mjs';

const byId=id=>document.getElementById(id);
const svg=byId('graph-svg');
const namespace='http://www.w3.org/2000/svg';
const sourceRegistry=new Map();
let activeSource='vyndi-vedm';
let currentGraph=null,selectedNodeId=null;
let zoom=1,offsetX=0,offsetY=0,plotGroup=null,drag=null;
const ROOT_WIDTH=1040,ROOT_HEIGHT=650;

function labelPairs(element,pairs){
 element.replaceChildren();
 for(const [key,value] of pairs){
  const dt=document.createElement('dt'),dd=document.createElement('dd');
  dt.textContent=key;dd.textContent=String(value??'—');
  element.append(dt,dd);
 }
}
function svgNode(name,attrs={}){
 const node=document.createElementNS(namespace,name);
 for(const [name,value] of Object.entries(attrs))node.setAttribute(name,String(value));
 return node;
}
function status(text,kind='neutral'){
 const element=byId('graph-status');
 element.textContent=text;
 element.className='notice'+(kind==='hold'?' is-hold':kind==='ready'?' is-ready':'');
}
function guidance(source){
 if(source==='vyndi-vedm')return 'VYNDI OS signed-read bridge is not yet qualified. Verify service binding, signing and replay-protected export.';
 return 'Commission a reviewed metadata-only snapshot in VAOS R2 and pin its exact SHA-256 hash. Local SPARK data is never tunneled.';
}
function sourceDescription(){
 const info=SOURCE_INFO.find(item=>item.id===activeSource);
 byId('explorer-title').textContent=info.label+' · '+info.detail;
 byId('source-description').textContent=info.origin+' · read only';
}
function sourceButtons(){
 const container=byId('source-list');
 container.replaceChildren();
 for(const [index,item] of SOURCE_INFO.entries()){
  const button=document.createElement('button');
  button.type='button';button.className='source-item';
  button.dataset.source=item.id;button.setAttribute('aria-pressed',String(item.id===activeSource));
  const icon=document.createElement('span');icon.className='source-icon';
  icon.setAttribute('aria-hidden','true');icon.textContent=['◈','◇','⌁','▤','◎','▧','⬡'][index];
  const text=document.createElement('span');text.className='source-labels';
  const name=document.createElement('strong'),description=document.createElement('small');
  name.textContent=item.label;description.textContent=item.detail;text.append(name,description);
  const reading=document.createElement('span');
  const availability=sourceRegistry.get(item.id)?.status??'UNKNOWN';
  reading.className='source-status'+(availability==='NOT_COMMISSIONED'?' is-hold':availability.includes('CONFIGURED')?' is-configured':'');
  reading.textContent=availability==='NOT_COMMISSIONED'?'HOLD':availability.includes('CONFIGURED')?'CHECK':'UNKNOWN';
  reading.title=sourceReadiness(availability);
  button.append(icon,text,reading);
  button.addEventListener('click',()=>chooseSource(item.id));
  container.append(button);
 }
}
function clearDisplay(message){
 currentGraph=null;selectedNodeId=null;plotGroup=null;
 byId('metric-nodes').textContent='—';
 byId('metric-edges').textContent='—';
 byId('metric-evidence').textContent='NOT LOADED';
 byId('view-count').textContent='No data displayed';
 byId('node-results').textContent='Load a graph to inspect individual records.';
 byId('related-nodes').textContent='Select a node to inspect relationships.';
 byId('selected-title').textContent='Select a graph node';
 labelPairs(byId('details'),[['State','No node selected']]);
 labelPairs(byId('lineage'),[['Qualification','Awaiting source retrieval']]);
 svg.replaceChildren();
 byId('graph-empty').hidden=false;
 byId('graph-empty').querySelector('h3').textContent='Awaiting a qualified source';
 byId('graph-empty').querySelector('p').textContent=message;
 zoom=1;offsetX=0;offsetY=0;
}
function chooseSource(source){
 if(!SOURCE_INFO.some(x=>x.id===source))return;
 activeSource=source;sourceDescription();sourceButtons();
 byId('node-query').value='';
 byId('kind-filter').replaceChildren(new Option('All node types','all'));
 clearDisplay('No synthetic records are displayed. '+guidance(activeSource));
 const registry=sourceRegistry.get(activeSource);
 if(registry?.status==='NOT_COMMISSIONED')status(sourceReadiness(registry.status)+'. '+guidance(activeSource),'hold');
 else status('Selected '+SOURCE_INFO.find(s=>s.id===activeSource).label+'. Choose Load source.');
}
async function readRegistry(){
 try{
  const response=await fetch('/api/neural-knowledge?source=registry',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
  const body=await response.json();
  if(!response.ok||!Array.isArray(body?.data?.sources))throw Error(body?.error?.code||'REGISTRY_UNAVAILABLE');
  sourceRegistry.clear();
  for(const entry of body.data.sources)if(SOURCE_INFO.some(s=>s.id===entry.id))sourceRegistry.set(entry.id,entry);
  byId('source-status').textContent=sourceRegistry.size+' source contracts · None marked live without verification';
  sourceButtons();
  if(sourceRegistry.get(activeSource)?.status!=='NOT_COMMISSIONED')await loadSource();
  else status(sourceReadiness('NOT_COMMISSIONED')+'. '+guidance(activeSource),'hold');
 }catch(error){
  byId('source-status').textContent='Registry HOLD · '+error.message;
  sourceButtons();status('Knowledge registry unavailable. Sign in as founder and verify the gateway configuration.','hold');
 }
}
function updateKindFilter(){
 const select=byId('kind-filter');
 select.replaceChildren(new Option('All node types','all'));
 const kinds=[...new Set(currentGraph.nodes.map(node=>node.kind).filter(Boolean))].sort();
 for(const kind of kinds)select.add(new Option(kind.replaceAll('_',' '),kind));
}
function updateTransform(){
 if(plotGroup)plotGroup.setAttribute('transform','translate('+offsetX+' '+offsetY+') scale('+zoom+')');
}
function adjustZoom(factor){
 zoom=Math.max(.55,Math.min(3.5,zoom*factor));updateTransform();
}
function inspectNode(id){
 if(!currentGraph)return;
 const node=currentGraph.nodes.find(n=>n.id===id);
 if(!node)return;
 selectedNodeId=id;byId('selected-title').textContent=node.label;
 labelPairs(byId('details'),[
  ['Node ID',node.id],['Type',node.kind],['Original source reference',node.sourceRef],
  ['Authority',node.authorityClass],['Revision',node.revision],['Gate status',node.gateStatus],
  ['Lifecycle',node.lifecycle],['Evidence state',node.evidenceState],
  ['Release effect',node.releaseEffect||'Not applicable'],
  ['Valid from',node.effectiveFrom],['Valid to',node.effectiveTo]
 ]);
 const list=byId('related-nodes');list.replaceChildren();
 const related=currentGraph.edges.filter(e=>e.from===id||e.to===id).slice(0,50);
 if(!related.length)list.textContent='No linked relationships in this source snapshot.';
 for(const edge of related){
  const destination=edge.from===id?edge.to:edge.from;
  const other=currentGraph.nodes.find(n=>n.id===destination);
  if(!other)continue;
  const button=document.createElement('button');button.type='button';button.className='related-item';
  button.textContent=edge.relation+' · '+other.label;
  button.addEventListener('click',()=>inspectNode(other.id));
  list.append(button);
 }
 renderGraph();
}
function buildNodeList(view){
 const list=byId('node-results');list.replaceChildren();
 if(!view.nodes.length){list.textContent='No matching nodes in this approved graph.';return;}
 for(const node of view.nodes.slice(0,30)){
  const item=document.createElement('button');item.type='button';item.className='node-item';
  const title=document.createElement('span'),kind=document.createElement('small');
  title.textContent=node.label;kind.textContent=node.kind+' · '+node.id;
  item.append(title,kind);item.addEventListener('click',()=>inspectNode(node.id));list.append(item);
 }
}
function renderGraph(){
 if(!currentGraph)return;
 const view=selectGraphView(currentGraph,{query:byId('node-query').value,kind:byId('kind-filter').value});
 const layout=new Map(graphPositions(view.nodes).map(row=>[row.id,row]));
 svg.replaceChildren();
 const title=svgNode('title');title.textContent=currentGraph.source+' graph, '+view.nodes.length+' visible nodes and '+view.edges.length+' visible relationships';svg.append(title);
 const plot=svgNode('g',{class:view.nodes.length>18?'graph-dense':'graph-sparse'});plotGroup=plot;
 const links=svgNode('g',{'aria-hidden':'true'});
 for(const edge of view.edges){
  const a=layout.get(edge.from),b=layout.get(edge.to);
  if(!a||!b)continue;
  const line=svgNode('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,class:'graph-link'});
  links.append(line);
 }
 plot.append(links);
 const nodes=svgNode('g');
 for(const node of view.nodes){
  const pos=layout.get(node.id);
  const attrs={class:'graph-node'+(selectedNodeId===node.id?' is-selected':''),tabindex:0,role:'button','aria-label':'Inspect '+node.label,transform:'translate('+pos.x+' '+pos.y+')'};
  const g=svgNode('g',attrs);
  g.append(svgNode('circle',{r:selectedNodeId===node.id?9:6.5,cx:0,cy:0}));
  const labelOnLeft=pos.x>180;
  const text=svgNode('text',{x:labelOnLeft?-12:12,y:4,'text-anchor':labelOnLeft?'end':'start','aria-hidden':'true'});
  text.textContent=node.label.length>40?node.label.slice(0,39)+'…':node.label;
  g.append(text);
  g.addEventListener('click',()=>inspectNode(node.id));
  g.addEventListener('keydown',event=>{
   if(event.key!=='Enter'&&event.key!==' ')return;
   event.preventDefault();
   inspectNode(node.id);
   svg.querySelector('.graph-node.is-selected')?.focus();
  });
  nodes.append(g);
 }
 plot.append(nodes);svg.append(plot);updateTransform();
 byId('graph-empty').hidden=view.nodes.length!==0;
 if(!view.nodes.length){
  byId('graph-empty').querySelector('h3').textContent='No matching records';
  byId('graph-empty').querySelector('p').textContent='Try a different filter. The source contained '+currentGraph.nodes.length+' nodes.';
 }
 byId('view-count').textContent='Showing '+view.nodes.length+'/'+view.totalNodes+' nodes · '+view.edges.length+'/'+view.totalEdges+' links';
 buildNodeList(view);
}
function sourceEvidence(graph){
 labelPairs(byId('lineage'),[
  ['Source',graph.source],['Source revision',graph.sourceRevision],['Source repository',graph.sourceRepository],
  ['Observed at',graph.observedAt],['Source as of',graph.asOfDate],
  ['Integrity verified',graph.integrityVerified?'Yes — pinned snapshot hash':'No — not independently verified'],
  ['Independent source verification',graph.independentVerification?'Yes':'No'],
  ['Business truth certified',graph.currentBusinessTruthCertified?'Yes':'No'],
  ['Release authorized',graph.releaseAuthorized?'Yes':'No'],
  ['Blocking engineering gates',(graph.blockingGateIds||[]).join(', ')||'None reported']
 ]);
}
async function loadSource(){
 const button=byId('load-graph');
 button.disabled=true;clearDisplay('Verifying the requested source without creating any demonstration data…');
 status('Checking authenticated '+activeSource+' source…');
 try{
  const response=await fetch('/api/neural-knowledge?source='+encodeURIComponent(activeSource),{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
  const body=await response.json();
  if(!response.ok||body?.data?.schemaVersion!=='VAOS_NEUTRAL_GRAPH_V1'||body?.data?.source!==activeSource){
   throw Error(body?.error?.code||('SOURCE_HTTP_'+response.status));
  }
  currentGraph=body.data;
  updateKindFilter();sourceEvidence(currentGraph);
  byId('metric-nodes').textContent=String(currentGraph.nodes.length);
  byId('metric-edges').textContent=String(currentGraph.edges.length);
  byId('metric-evidence').textContent=currentGraph.integrityVerified?'HASH VERIFIED':'SOURCE OBSERVED';
  if(!currentGraph.nodes.length){
   status('Source returned no displayable nodes. No records were invented.','hold');
  }else{
   status('Observed '+currentGraph.nodes.length+' nodes and '+currentGraph.edges.length+' links. Source review and operational authority remain separate.','ready');
  }
  renderGraph();
 }catch(error){
  status('Source HOLD: '+error.message+'. '+guidance(activeSource),'hold');
  byId('graph-empty').querySelector('h3').textContent='Source not available';
  byId('graph-empty').querySelector('p').textContent=guidance(activeSource);
  byId('metric-evidence').textContent='HOLD';
 }finally{button.disabled=false;}
}

byId('knowledge-search').addEventListener('submit',async event=>{
 event.preventDefault();
 const query=byId('knowledge-query').value.trim();
 const output=byId('knowledge-results'),notice=byId('knowledge-status');
 output.replaceChildren();
 if(!/^[A-Za-z0-9][A-Za-z0-9 _.-]{3,119}$/.test(query)){
  notice.textContent='Enter 4–120 non-secret letters, numbers, spaces or basic punctuation.';return;
 }
 const submit=byId('knowledge-search').querySelector('button[type=submit]');
 submit.disabled=true;notice.textContent='Reading source-pinned repository evidence…';
 try{
  const response=await fetch('/api/federated-knowledge?q='+encodeURIComponent(query),{
   credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}
  });
  const body=await response.json();
  if(!response.ok||!body?.data||body.data.readOnly!==true||body.data.actionAuthorized!==false)
   throw Error(body?.error?.code||'FEDERATED_SOURCE_HOLD');
  const data=body.data;
  const entries=[...(Array.isArray(data.evidence)?data.evidence:[])].slice(0,20);
  notice.textContent=entries.length+' source documents with excerpts · '+(data.failedSources?.length||0)+' source failures. Review original files before drawing conclusions.';
  if(!entries.length){
   output.textContent='No source-cited evidence returned. A successful request does not certify indexing, freshness or completeness.';
  }
  for(const item of entries){
   const article=document.createElement('article');article.className='knowledge-record';
   const title=document.createElement('h3');title.textContent=String(item.repository||'Source')+' / '+String(item.path||'Document');
   article.append(title);
   const provenance=document.createElement('p');
   provenance.textContent='Pinned blob: '+String(item.sha||'unverified');
   article.append(provenance);
   for(const excerpt of (Array.isArray(item.excerpts)?item.excerpts:[]).slice(0,3)){
    const p=document.createElement('p');p.textContent='Line '+String(excerpt.line)+': '+String(excerpt.text||'');article.append(p);
   }
   try{
    const url=new URL(item.url);
    if(url.protocol!=='https:'||url.hostname!=='github.com')throw Error('SOURCE_LINK_INVALID');
    const a=document.createElement('a');a.href=url.href;a.rel='noopener noreferrer';a.target='_blank';a.textContent='Review pinned file in GitHub';
    article.append(a);
   }catch{const warning=document.createElement('p');warning.textContent='Source link withheld';article.append(warning);}
   output.append(article);
  }
 }catch(error){
  notice.textContent='Repository knowledge HOLD: '+error.message+'. Verify founder session, private GitHub read authorization and source availability.';
 }finally{submit.disabled=false;}
});


byId('personal-google-search').addEventListener('submit',async event=>{
 event.preventDefault();
 const form=byId('personal-google-search'),output=byId('personal-google-results');
 const notice=byId('personal-google-status'),type=byId('personal-google-service').value;
 const query=byId('personal-google-query').value.trim();
 output.replaceChildren();
 if(!['drive','mail'].includes(type)||query.length<2||query.length>90){notice.textContent='Choose a source and enter 2–90 characters.';return;}
 const button=form.querySelector('button[type=submit]');button.disabled=true;
 notice.textContent='Reading only the permitted '+(type==='drive'?'Drive metadata':'Gmail results')+'…';
 try{
  const endpoint=type==='drive'?'/api/google-workspace/drive?q=':'/api/google-workspace/mail?q=';
  const res=await fetch(endpoint+encodeURIComponent(query),{
   method:'GET',credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
  if(!res.ok)throw Error('GOOGLE_AUTHENTICATION_REQUIRED');
  const data=await res.json();
  if(data.status!=='PASS'||data.actionAuthorized!==false)throw Error(data.reason||'GOOGLE_SCOPE_RECONNECT_REQUIRED');
  const rows=type==='drive'?data.files:data.messages;
  if(!Array.isArray(rows))throw Error('GOOGLE_SOURCE_RESPONSE_INVALID');
  notice.textContent=rows.length+' private '+(type==='drive'?'files':'messages')+' returned. Search is on-demand, not a neural graph import.';
  if(!rows.length){output.textContent='No matching records in the connected Google account.';return;}
  for(const row of rows.slice(0,30)){
   const card=document.createElement('article');card.className='knowledge-record';
   const h=document.createElement('h3');h.textContent=type==='drive'?String(row.name||'Untitled'):String(row.subject||'No subject');
   card.append(h);
   const p=document.createElement('p');
   p.textContent=type==='drive'?String(row.type||'File')+' · '+String(row.modifiedAt||''):
    String(row.from||'')+' · '+String(row.date||'');
   card.append(p);
   if(type==='mail'){const snippet=document.createElement('p');snippet.textContent=String(row.snippet||'').slice(0,240);card.append(snippet);}
   if(type==='drive'&&typeof row.url==='string'){
    try{const url=new URL(row.url);if(url.protocol==='https:'&&url.hostname==='drive.google.com'){
     const a=document.createElement('a');a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';a.textContent='Open in Google Drive';card.append(a);
    }}catch{}
   }
   output.append(card);
  }
 }catch(error){
  notice.textContent='Google knowledge HOLD: '+String(error.message||'UNAVAILABLE')+'. Use Connect / renew Google permission, then retry.';
 }finally{button.disabled=false;}
});

byId('load-graph').addEventListener('click',loadSource);
byId('node-query').addEventListener('input',renderGraph);
byId('kind-filter').addEventListener('change',renderGraph);
byId('zoom-in').addEventListener('click',()=>adjustZoom(1.22));
byId('zoom-out').addEventListener('click',()=>adjustZoom(1/1.22));
byId('reset-view').addEventListener('click',()=>{zoom=1;offsetX=0;offsetY=0;updateTransform();});
svg.addEventListener('wheel',event=>{if(!currentGraph)return;event.preventDefault();adjustZoom(event.deltaY<0?1.1:1/1.1);},{passive:false});
svg.addEventListener('pointerdown',event=>{
 if(!currentGraph||event.target.closest('.graph-node'))return;
 drag={startX:event.clientX,startY:event.clientY,originX:offsetX,originY:offsetY};
 svg.classList.add('is-dragging');svg.setPointerCapture(event.pointerId);
});
svg.addEventListener('pointermove',event=>{
 if(!drag)return;
 const box=svg.getBoundingClientRect();
 offsetX=drag.originX+(event.clientX-drag.startX)*ROOT_WIDTH/box.width;
 offsetY=drag.originY+(event.clientY-drag.startY)*ROOT_HEIGHT/box.height;
 updateTransform();
});
for(const eventName of ['pointerup','pointercancel','lostpointercapture'])svg.addEventListener(eventName,()=>{drag=null;svg.classList.remove('is-dragging');});
sourceDescription();sourceButtons();
void readRegistry();

/**
 * VAOS unified knowledge view model.
 * Aggregates only authenticated, observed, read-only source responses in browser memory.
 * This module never extracts, persists, infers, or approves source content.
 */
export const UNIVERSE_SOURCES=Object.freeze([
 'vyndi-vedm','graphify','graphiti','llm-wiki','brain-atlas','obsidian','dify',
 'gmail','drive','github','chatgpt'
]);
const ALLOWED=new Set(UNIVERSE_SOURCES);
const MAX_NODES=20000,MAX_EDGES=40000;
const VALID_ID=/^[A-Za-z0-9][A-Za-z0-9_.:/#@-]{0,259}$/;
const REPO=/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SHA40=/^[a-f0-9]{40}$/;
const safe=(value,max=180)=>typeof value==='string'&&value.trim()&&value.length<=max&&!/[\u0000-\u001f\u007f]/.test(value)?value.trim():null;
const date=(value)=>typeof value==='string'&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
const failure=(name)=>{throw Error('KNOWLEDGE_'+name)};
function dateFilter(asOf){
 if(asOf==null||asOf==='')return null;
 if(!/^\d{4}-\d\d-\d\d$/.test(asOf))failure('DATE_INVALID');
 const result=new Date(asOf+'T00:00:00Z');
 if(!Number.isFinite(result.getTime())||result.toISOString().slice(0,10)!==asOf)failure('DATE_INVALID');
 return asOf+'T23:59:59.999Z';
}
function sourceEnvelope(source,nodes,edges){
 return {source,status:'OBSERVED',readOnly:true,actionAuthorized:false,
  sourceRevision:'ephemeral-session',observedAt:new Date().toISOString(),
  integrityVerified:false,independentVerification:false,nodes,edges};
}
export function mergeKnowledgeSources(documents=[]){
 if(!Array.isArray(documents)||documents.length>16)failure('SOURCE_DENIED');
 const nodes=[],edges=[],sources=[],known=new Set();
 for(const doc of documents){
  if(!ALLOWED.has(doc?.source))failure('SOURCE_DENIED');
  if(doc.readOnly!==true||doc.actionAuthorized!==false||doc.status!=='OBSERVED')failure('NOT_GOVERNED');
  if(!Array.isArray(doc.nodes)||!Array.isArray(doc.edges)||nodes.length+doc.nodes.length>MAX_NODES||
    edges.length+doc.edges.length>MAX_EDGES)failure('SIZE_DENIED');
  const source=doc.source;
  const revision=safe(doc.sourceRevision,180);
  const observedAt=date(doc.observedAt);
  if(!revision||!observedAt)failure('PROVENANCE_INVALID');
  const accepted=new Set();
  for(const row of doc.nodes){
   const id=safe(row?.id,260),label=safe(row?.label,180);
   if(!id||!VALID_ID.test(id)||!label)continue;
   const mergedId=source+'::'+id;
   if(known.has(mergedId))failure('DUPLICATE_NODE');
   const kind=safe(row.kind,60)||'record',sourceRef=safe(row.sourceRef,220)||id;
   nodes.push({id:mergedId,nativeId:id,label,kind,source,sourceRef,
    sourceRevision:revision,observedAt,integrityVerified:doc.integrityVerified===true,
    independentVerification:doc.independentVerification===true,
    validFrom:date(row.validFrom),validTo:date(row.validTo)});
   known.add(mergedId);accepted.add(id);
  }
  for(const row of doc.edges){
   const from=safe(row?.from,260),to=safe(row?.to,260),relation=safe(row?.relation,80);
   if(!from||!to||!relation||!accepted.has(from)||!accepted.has(to))continue;
   const validFrom=date(row.validFrom),validTo=date(row.validTo);
   if(validFrom&&validTo&&validFrom>validTo)continue;
   edges.push({from:source+'::'+from,to:source+'::'+to,relation,
    source,validFrom,validTo,sourceRevision:revision});
  }
  sources.push({id:source,observedAt,sourceRevision:revision,
   integrityVerified:doc.integrityVerified===true,nodeCount:accepted.size});
 }
 return {nodes,edges,sources,readOnly:true,actionAuthorized:false};
}
export function selectKnowledgeView(graph,{sources=[],search='',focus=null,direction='both',depth=2,
 asOf='',kind='all',limit=180}={}){
 const active=new Set(sources);
 const selected=(Array.isArray(graph?.nodes)?graph.nodes:[]).filter(n=>
  (!active.size||active.has(n.source))&&(kind==='all'||n.kind===kind));
 const ids=new Set(selected.map(n=>n.id));
 const now=dateFilter(asOf);
 const candidateEdges=(Array.isArray(graph?.edges)?graph.edges:[]).filter(e=>
  ids.has(e.from)&&ids.has(e.to)&&(!now||(!e.validFrom||e.validFrom<=now)&&
   (!e.validTo||e.validTo>=now)));
 let visible=new Set(ids);
 if(focus){
  visible=new Set(ids.has(focus)?[focus]:[]);
  const maxDepth=Number.isInteger(depth)?Math.max(0,Math.min(5,depth)):2;
  const directionMode=['both','ancestors','descendants'].includes(direction)?direction:'both';
  let frontier=[focus];
  for(let layer=0;layer<maxDepth;layer++){
   const next=[];
   for(const edge of candidateEdges){
    const allowForward=directionMode!=='ancestors';
    const allowBackward=directionMode!=='descendants';
    for(const [a,b,enabled] of [[edge.from,edge.to,allowForward],[edge.to,edge.from,allowBackward]]){
     if(enabled&&frontier.includes(a)&&!visible.has(b)){
      visible.add(b);next.push(b);
     }
    }
   }
   frontier=next;
   if(!next.length)break;
  }
 }
 const query=String(search||'').trim().toLowerCase().slice(0,120);
 const matched=selected.filter(n=>visible.has(n.id)&&(!query||
  [n.label,n.nativeId,n.kind,n.source,n.sourceRef].some(s=>String(s||'').toLowerCase().includes(query))));
 const cap=Number.isInteger(limit)?Math.max(1,Math.min(300,limit)):180;
 const nodes=matched.slice(0,cap);
 const allowed=new Set(nodes.map(n=>n.id));
 const allEdges=candidateEdges.filter(e=>allowed.has(e.from)&&allowed.has(e.to));
 return {nodes,edges:allEdges.slice(0,900),totalMatchedNodes:matched.length,
  totalMatchedEdges:allEdges.length,truncated:matched.length>cap||allEdges.length>900,
  focus:focus&&allowed.has(focus)?focus:null};
}
export function layoutKnowledgeView(view,{mode='constellation'}={}){
 const nodes=Array.isArray(view?.nodes)?view.nodes:[];
 if(!nodes.length)return [];
 const n=nodes.length;
 const sources=[...new Set(nodes.map(v=>v.source))];
 const srcIndex=new Map(sources.map((v,i)=>[v,i]));
 const indexed=new Map(nodes.map((v,i)=>[v.id,i]));
 if(mode==='lanes')return nodes.map((v,i)=>{
  const lane=srcIndex.get(v.source);
  const row=nodes.slice(0,i).filter(x=>x.source===v.source).length;
  const count=nodes.filter(x=>x.source===v.source).length;
  return {id:v.id,x:65+(row+1)*1060/(count+1),y:90+(lane+0.5)*520/sources.length};
 });
 if(mode==='timeline'){
  const stamps=nodes.map(x=>Date.parse(x.validFrom||x.observedAt)).filter(Number.isFinite);
  const min=Math.min(...stamps),max=Math.max(...stamps);
  return nodes.map((v,i)=>({
   id:v.id,x:90+1000*(max===min?(i+1)/(n+1):(Date.parse(v.validFrom||v.observedAt)-min)/(max-min)),
   y:95+(srcIndex.get(v.source)+.5)*490/sources.length
  }));
 }
 if(mode==='lineage'&&view.focus){
  const hops=new Map([[view.focus,0]]);
  for(let j=0;j<6;j++){
   let updated=false;
   for(const e of view.edges||[]){
    const a=hops.get(e.from),b=hops.get(e.to);
    if(a!==undefined&&b===undefined){hops.set(e.to,a+1);updated=true;}
    if(b!==undefined&&a===undefined){hops.set(e.from,b+1);updated=true;}
   }
   if(!updated)break;
  }
  const levels=new Map();
  for(const v of nodes){const k=Math.min(5,hops.get(v.id)??5);if(!levels.has(k))levels.set(k,[]);levels.get(k).push(v.id);}
  return nodes.map(v=>{
   const k=Math.min(5,hops.get(v.id)??5),group=levels.get(k);
   return {id:v.id,x:95+k*193,y:70+(group.indexOf(v.id)+1)*530/(group.length+1)};
  });
 }
 return nodes.map((v,i)=>{
  const angle=i*2.399963229728653;
  const radius=34+Math.sqrt((i+.4)/n)*270;
  return {id:v.id,x:600+Math.cos(angle)*radius*1.6,y:345+Math.sin(angle)*radius};
 });
}
export function googleSearchGraph(source,rows){
 if(!['gmail','drive'].includes(source))failure('SOURCE_DENIED');
 if(!Array.isArray(rows))failure('SOURCE_INVALID');
 const nodes=[];
 for(const row of rows.slice(0,100)){
  const id=safe(row?.id,260);
  if(!id||!VALID_ID.test(id))continue;
  const label=safe(source==='gmail'?row.subject:row.name,180)||'Untitled source record';
  nodes.push({id,label,sourceRef:source+':'+id,kind:source==='gmail'?'message':'file'});
 }
 return sourceEnvelope(source,nodes,[]);
}
export function githubEvidenceGraph(evidence){
 if(!Array.isArray(evidence))failure('SOURCE_INVALID');
 const nodes=[],edges=[],seen=new Set();
 for(const row of evidence.slice(0,150)){
  const repo=safe(row?.repository,160),path=safe(row?.path,250),sha=row?.sha;
  if(!repo||!REPO.test(repo)||!path||!SHA40.test(sha||''))continue;
  const repoId='repo:'+repo,fileId='file:'+repo+'/'+path+'@'+sha;
  if(!seen.has(repoId)){nodes.push({id:repoId,label:repo,kind:'repository',sourceRef:repo});seen.add(repoId);}
  if(seen.has(fileId))continue;
  nodes.push({id:fileId,label:path,kind:'file',sourceRef:repo+'/'+path+'@'+sha});
  edges.push({from:repoId,to:fileId,relation:'CONTAINS'});
  seen.add(fileId);
 }
 return sourceEnvelope('github',nodes,edges);
}
export function chatHistoryGraph(input){
 const conversations=Array.isArray(input)?input:input?.conversations;
 if(!Array.isArray(conversations))failure('EXPORT_INVALID');
 if(conversations.length>5000)failure('EXPORT_SIZE_DENIED');
 const nodes=[],edges=[];
 for(const conversation of conversations){
  const id=safe(conversation?.id,160),title=safe(conversation?.title,180);
  if(!id||!VALID_ID.test(id))continue;
  const convId='conversation:'+id;
  nodes.push({id:convId,label:title||'Untitled conversation',kind:'conversation',sourceRef:'chatgpt:'+id});
  const map=conversation.mapping&&typeof conversation.mapping==='object'&&!Array.isArray(conversation.mapping)?conversation.mapping:{};
  const ids=[];
  for(const [key,item] of Object.entries(map)){
   const message=item?.message;
   if(!message||!safe(key,160)||!VALID_ID.test(key))continue;
   const id='message:'+conversation.id+':'+key;
   const role=safe(message.author?.role,30)||'unknown';
   nodes.push({id,label:role+' message',kind:'chat_message',sourceRef:'chatgpt:'+conversation.id+'/'+key});
   edges.push({from:convId,to:id,relation:'HAS_MESSAGE'});
   ids.push(key);
  }
  const idSet=new Set(ids);
  for(const key of ids){
   const parent=map[key]?.parent;
   if(typeof parent==='string'&&idSet.has(parent))
    edges.push({from:'message:'+conversation.id+':'+parent,to:'message:'+conversation.id+':'+key,relation:'REPLIES_TO'});
  }
  if(nodes.length>MAX_NODES||edges.length>MAX_EDGES)failure('EXPORT_SIZE_DENIED');
 }
 return sourceEnvelope('chatgpt',nodes,edges);
}

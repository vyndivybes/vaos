/**
 * VAOS neutral knowledge graph v1 — metadata only. No inference, embeddings,
 * model calls, approval propagation, transaction writes, or automatic sync.
 * Sources retain separate authority and provenance.
 */
export const NEUTRAL_GRAPH_SOURCES=Object.freeze(['vyndi-vedm','graphify','graphiti','llm-wiki','brain-atlas']);
const IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9_.:/#-]{0,159}$/;
const SHA=/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/;
const KIND=/^[a-z][a-z0-9_-]{0,49}$/i;
const REL=/^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const CLASS={ 'vyndi-vedm':'reviewed-reference',graphify:'advisory',graphiti:'model-derived','llm-wiki':'advisory','brain-atlas':'advisory' };
const HIDDEN=new Set(['contact','person','user','credential','secret','employee','email','phone']);
function fail(code){const e=new Error('NEUTRAL_GRAPH_'+code);e.code='NEUTRAL_GRAPH_'+code;e.retryable=false;throw e}
function text(v,max=180){return typeof v==='string'&&v.trim()&&v.length<=max&&!/[\x00-\x1f\x7f]/.test(v)?v.trim():null}
function id(v){return typeof v==='string'&&IDENTIFIER.test(v)?v:null}
function iso(value){if(typeof value!=='string'||!Number.isFinite(Date.parse(value))||!/^\d{4}-\d\d-\d\dT/.test(value))return null;return new Date(value).toISOString()}
function array(rows,max){if(!Array.isArray(rows)||rows.length>max)fail('SIZE_DENIED');return rows}
function optionalText(value,max){if(value==null)return null;const out=text(value,max);if(!out)fail('PROVENANCE_INVALID');return out}
function dateOnly(value){
 if(value==null)return null;
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)fail('PROVENANCE_INVALID');
 return value;
}
function node(x,source,kindKey,titleKey){
 if(!x||typeof x!=='object'||Array.isArray(x))fail('NODE_INVALID');
 const key=id(x.id),label=text(x[titleKey],140);
 const kind=text(x[kindKey],50)||'record';
 if(!key||!label||!KIND.test(kind))fail('NODE_INVALID');
 if(HIDDEN.has(kind.toLowerCase()))return null;
 const ref=text(source==='vyndi-vedm'?x.sourceRef:source==='llm-wiki'?x.sourceRef:key,180);
 if(!ref)fail('NODE_INVALID');
 return Object.freeze({id:key,label,kind,sourceRef:ref,authorityClass:CLASS[source],...(source==='vyndi-vedm'?{
  releaseEffect:text(x.releaseEffect,40)||'none',
  revision:optionalText(x.revision,80),lifecycle:optionalText(x.lifecycle,50),
  gateStatus:optionalText(x.gateStatus,50),evidenceState:optionalText(x.evidenceState,50),
  effectiveFrom:dateOnly(x.effectiveFrom),effectiveTo:dateOnly(x.effectiveTo),
 }:{})});
}
function edge(x,source,allowed){
 if(!x||typeof x!=='object'||Array.isArray(x))fail('EDGE_INVALID');
 const from=id(source==='graphiti'||source==='graphify'||source==='brain-atlas'?x.source:x.from);
 const to=id(source==='graphiti'||source==='graphify'||source==='brain-atlas'?x.target:x.to);
 const relation=text(x.relation||x.type,64);
 if(!from||!to||!relation||!REL.test(relation))fail('EDGE_INVALID');
 if(!allowed.has(from)||!allowed.has(to))return null;
 const validFrom=x.valid_at===undefined?null:iso(x.valid_at);
 const validTo=x.invalid_at===undefined?null:iso(x.invalid_at);
 if((x.valid_at!==undefined&&!validFrom)||(x.invalid_at!==undefined&&!validTo)
   ||(validFrom&&validTo&&validFrom>validTo))fail('EDGE_INVALID');
 return Object.freeze({from,to,relation,validFrom,validTo});
}
export function normalizeNeutralGraph(input,{integrityVerified=false}={}){
 if(!input||typeof input!=='object'||Array.isArray(input)||input.schemaVersion!=='VAOS_NEUTRAL_GRAPH_SOURCE_V1')fail('SOURCE_INVALID');
 const source=input.sourceType;
 if(!NEUTRAL_GRAPH_SOURCES.includes(source))fail('SOURCE_DENIED');
 if(!SHA.test(input.sourceRevision||'')||!iso(input.observedAt))fail('PROVENANCE_INVALID');
 const raw=input.payload;
 if(!raw||typeof raw!=='object'||Array.isArray(raw))fail('SOURCE_INVALID');
 if(source==='vyndi-vedm'){
  if(raw.schemaVersion!=='VYNDI_VEDM_AUTHORITY_READ_V1'||raw.readOnly!==true||
     raw.actionAuthorized!==false||raw.currentRuntimeAuthorityVerified!==false||
     raw.sourceCommit!==input.sourceRevision||!text(raw.sourceRepository,180)||raw.sourceAuthority&&raw.sourceAuthority!=='compileVedmAuthorityGraph')fail('AUTHORITY_DENIED');
 }
 let originalNodes,originalEdges,kindKey,titleKey;
 if(source==='vyndi-vedm'){
  originalNodes=array(raw.nodes,120);originalEdges=array(raw.edges,240);kindKey='kind';titleKey='title';
 }else if(source==='graphiti'){
  originalNodes=array(raw.entities,300);originalEdges=array(raw.facts,600);kindKey='kind';titleKey='name';
 }else if(source==='llm-wiki'){
  originalNodes=array(raw.pages,300);originalEdges=array(raw.links,600);kindKey='kind';titleKey='title';
 }else{
  originalNodes=array(raw.nodes,300);originalEdges=array(raw.edges,600);kindKey='type';titleKey='title';
 }
 const filtered=originalNodes.map(x=>node(x,source,kindKey,titleKey)).filter(Boolean);
 const unique=new Set();
 for(const n of filtered){if(unique.has(n.id))fail('NODE_INVALID');unique.add(n.id)}
 const hidden=new Set(originalNodes.filter(x=>x&&HIDDEN.has(String(x[kindKey]||'').toLowerCase())).map(x=>x.id));
 const edges=[];
 for(const rawEdge of originalEdges){
  const f=source==='graphiti'||source==='graphify'||source==='brain-atlas'?rawEdge?.source:rawEdge?.from;
  const t=source==='graphiti'||source==='graphify'||source==='brain-atlas'?rawEdge?.target:rawEdge?.to;
  if(hidden.has(f)||hidden.has(t))continue;
  const row=edge(rawEdge,source,unique);
  if(!row)fail('EDGE_INVALID');
  edges.push(row);
 }
 return Object.freeze({
  schemaVersion:'VAOS_NEUTRAL_GRAPH_V1',source,sourceRevision:input.sourceRevision,
  observedAt:iso(input.observedAt),sourceRepository:source==='vyndi-vedm'?raw.sourceRepository:null,
  status:'OBSERVED',readOnly:true,actionAuthorized:false,businessEffectsExecuted:false,
  independentVerification:false,currentBusinessTruthCertified:false,causalRelationshipsVerified:false,
  sourceDataFreshnessCertified:false,
  integrityVerified:integrityVerified===true,
  // Do not treat source graph snapshots or inferred associations as release authority.
  releaseAuthorized:false,
  ...(source==='vyndi-vedm'?{
   asOfDate:dateOnly(raw.asOfDate),sourceReleaseReady:raw.releaseReady===true,
   blockingGateIds:Object.freeze(array(raw.blockingGateIds??[],40).map(value=>{const out=id(value);if(!out)fail('PROVENANCE_INVALID');return out})),
   issueCodes:Object.freeze(array(raw.issueCodes??[],40).map(value=>{const out=text(value,80);if(!out)fail('PROVENANCE_INVALID');return out})),
  }:{}),
  nodes:Object.freeze(filtered),edges:Object.freeze(edges),
 });
}

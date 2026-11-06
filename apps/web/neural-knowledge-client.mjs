// Public, dependency-free view model. Real graph data comes only from the authenticated API.
export const SOURCE_INFO=Object.freeze([
 {id:'vyndi-vedm',label:'VYNDI OS',detail:'Engineering authority graph',kind:'engineering',origin:'signed bridge'},
 {id:'graphify',label:'Graphify',detail:'Architecture relationships',kind:'architecture',origin:'SPARK reviewed snapshot'},
 {id:'graphiti',label:'Graphiti',detail:'Time-valid facts',kind:'temporal',origin:'SPARK reviewed snapshot'},
 {id:'llm-wiki',label:'LLM Wiki',detail:'Referenced knowledge pages',kind:'wiki',origin:'reviewed snapshot'},
 {id:'brain-atlas',label:'Brain Atlas',detail:'Neural schema atlas',kind:'atlas',origin:'SPARK reviewed snapshot'},
 {id:'obsidian',label:'Obsidian',detail:'Reviewed notes and backlinks',kind:'notes',origin:'reviewed snapshot'},
 {id:'dify',label:'Dify',detail:'Workflow topology',kind:'workflow',origin:'reviewed snapshot'}
]);
export function sourceReadiness(status){
 switch(status){
  case 'CONFIGURED_UNVERIFIED':return 'Signed source configured, live read unverified';
  case 'PIN_CONFIGURED_UNVERIFIED':return 'Reviewed checksum configured, content unverified';
  case 'NOT_COMMISSIONED':return 'Source not commissioned';
  default:return 'Source status unknown';
 }
}
export function selectGraphView(graph,{query='',kind='all',limit=120}={}){
 const inputNodes=Array.isArray(graph?.nodes)?graph.nodes:[];
 const inputEdges=Array.isArray(graph?.edges)?graph.edges:[];
 const text=String(query??'').trim().toLowerCase().slice(0,120);
 const safeLimit=Number.isInteger(limit)?Math.max(1,Math.min(300,limit)):120;
 const nodes=inputNodes.filter(n=>{
  if(!n||typeof n.id!=='string'||typeof n.label!=='string')return false;
  if(kind!=='all'&&n.kind!==kind)return false;
  return !text||[n.label,n.id,n.kind,n.sourceRef].some(v=>String(v||'').toLowerCase().includes(text));
 }).slice(0,safeLimit);
 const ids=new Set(nodes.map(n=>n.id));
 const edges=inputEdges.filter(e=>ids.has(e?.from)&&ids.has(e?.to)).slice(0,600);
 return {nodes,edges,totalNodes:inputNodes.length,totalEdges:inputEdges.length};
}
export function graphPositions(nodes){
 if(!Array.isArray(nodes)||!nodes.length)return [];
 const count=nodes.length;
 return nodes.map((node,i)=>{
  const angle=i*2.399963229728653;
  const r=42+Math.sqrt((i+0.3)/count)*238;
  return {id:node.id,x:Number((Math.cos(angle)*r*1.45).toFixed(3)),y:Number((Math.sin(angle)*r).toFixed(3))};
 });
}

/**
 * Curated source-backed import edges from the user's Graphify VAOS CODE INDEX.
 * Build 3ed2d4c4-522a-4723-82df-55975cd78520, indexed 2026-11-21.
 * These are code dependencies, NOT enterprise object lineage or neural runtime links.
 * Refresh only against a new promoted Graphify index with exact commit evidence.
 */
export const GRAPHIFY_VAOS_SNAPSHOT=Object.freeze({
 repository:'vyndivybes/vaos',
 commitSha:'22bf6538293105a0d7b8383adf3e237e3137254f',
 buildId:'3ed2d4c4-522a-4723-82df-55975cd78520',
 indexedAt:'2026-11-21T03:17:49.801625Z',
 indexedNodeCount:8174,
 indexedEdgeCount:17441,
 communityCount:476,
 subset:'CURATED_STATIC_IMPORT_EDGES',
 graphScope:'CODE_DEPENDENCIES_ONLY',
 businessTruthCertified:false,
 liveRuntimeConnectionsVerified:false,
 actionAuthorized:false,
 readOnly:true
});
const nodes=[
 ['spatial','Spatial Command','apps/web/spatial-command.mjs','analytics'],
 ['spatial-model','Signed-source projection','apps/web/spatial-command-model.mjs','business'],
 ['spatial-3d','Spatial Three.js','apps/web/spatial-three.mjs','analytics'],
 ['spatial-memory','View memory','apps/web/lib/spatial-view-memory.mjs','knowledge'],
 ['neural-ui','Neural graph explorer','apps/web/neural-knowledge-ui.mjs','knowledge'],
 ['neural-model','Graph filter and layout','apps/web/neural-knowledge-client.mjs','knowledge'],
 ['visual','Visual analytics','apps/web/visual-intelligence.mjs','analytics'],
 ['visual-renderers','Chart renderers','apps/web/advanced-visual-renderers.mjs','analytics'],
 ['scenario-model','Scenario schema','apps/web/lib/advanced-visual-model.mjs','analytics'],
 ['executive-evidence','Executive source evidence','apps/web/executive-evidence.mjs','business'],
 ['factory','Factory scenario view','apps/web/factory-twin-view.mjs','analytics'],
 ['visual-overview','Scenario overview','apps/web/visual-overview.mjs','analytics'],
 ['bi-api','Enterprise BI endpoint','apps/web/api/enterprise-bi.mjs','business'],
 ['auth','Session verification','apps/web/lib/auth.mjs','runtime'],
 ['bi-model','Business day model','apps/web/bi-model.mjs','business'],
 ['vyndi-bridge','VYNDI signed-read client','platform/execution/vyndi-read-bridge-client.mjs','business'],
 ['supabase','Durable store adapter','platform/persistence/supabase-store.mjs','runtime'],
 ['config','Durable config resolver','apps/web/lib/durable-control-provider.mjs','runtime'],
 ['worker','Cloudflare Worker','apps/web/cloudflare-worker.mjs','runtime']
];
export const GRAPHIFY_VAOS_NODES=Object.freeze(nodes.map(([id,label,path,group])=>
 Object.freeze({id,label,path,group,kind:'code',businessTruthCertified:false})
));
const imports=[
 ['spatial','spatial-model'],['spatial','spatial-memory'],['spatial','spatial-3d'],
 ['neural-ui','neural-model'],
 ['visual','visual-renderers'],['visual','scenario-model'],['visual','executive-evidence'],
 ['visual','factory'],['visual','visual-overview'],
 ['bi-api','auth'],['bi-api','bi-model'],['bi-api','vyndi-bridge'],
 ['bi-api','supabase'],['bi-api','config'],
 ['worker','bi-api']
];
export const GRAPHIFY_VAOS_EDGES=Object.freeze(imports.map(([from,to])=>
 Object.freeze({from,to,relation:'imports_from',confidence:1,source:'GRAPHIFY_INDEXED_CODE'})
));
const safeGroup=new Set(['all','knowledge','analytics','business','runtime']);
const idMap=new Map(GRAPHIFY_VAOS_NODES.map(n=>[n.id,n]));
export function graphifyNodeHref(node){
 if(!node||!idMap.has(node.id)||idMap.get(node.id).path!==node.path)return null;
 return 'https://github.com/'+GRAPHIFY_VAOS_SNAPSHOT.repository+'/blob/'+
  GRAPHIFY_VAOS_SNAPSHOT.commitSha+'/'+node.path;
}
/** Visibility filter; never elevates graph topology to source certification. */
export function projectGraphifyArchitecture({query='',group='all',focus='all'}={}){
 const search=String(query).trim().toLowerCase().slice(0,100);
 const domain=safeGroup.has(group)?group:'all';
 const focused=idMap.has(focus)?focus:null;
 let nodes=GRAPHIFY_VAOS_NODES.filter(node=>{
  if(domain!=='all'&&node.group!==domain)return false;
  if(search&&!([node.id,node.label,node.path,node.group].some(v=>v.toLowerCase().includes(search))))return false;
  if(focused&&node.id!==focused&&!GRAPHIFY_VAOS_EDGES.some(e=>
    (e.from===focused&&e.to===node.id)||(e.to===focused&&e.from===node.id)))return false;
  return true;
 });
 const ids=new Set(nodes.map(node=>node.id));
 const edges=GRAPHIFY_VAOS_EDGES.filter(edge=>ids.has(edge.from)&&ids.has(edge.to)&&
   (!focused||edge.from===focused||edge.to===focused));
 return {nodes,edges,totalIndexedNodes:GRAPHIFY_VAOS_SNAPSHOT.indexedNodeCount,
  totalIndexedEdges:GRAPHIFY_VAOS_SNAPSHOT.indexedEdgeCount,
  subsetNodes:GRAPHIFY_VAOS_NODES.length,subsetEdges:GRAPHIFY_VAOS_EDGES.length,
  snapshotSha:GRAPHIFY_VAOS_SNAPSHOT.commitSha,
  businessDataStatus:'SEPARATE_SIGNED_READ',readOnly:true,actionAuthorized:false,
  liveRuntimeConnectionsVerified:false};
}

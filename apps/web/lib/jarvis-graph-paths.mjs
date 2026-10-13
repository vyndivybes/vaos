import {validatePersistentGraph} from './jarvis-persistent-graph.mjs';
const DOMAINS=new Set(['QA_CAPA','ENGINEERING_BASELINE','PROJECT_RISK']);
const LIMITS=Object.freeze({maxHops:4,maxPaths:10,maxExpansions:1000});
/** Directed metadata paths only; a link does not establish causality. */
export function queryGraphPaths(raw,{from,to}={}){
 if(!DOMAINS.has(from)||!DOMAINS.has(to)||from===to)throw Error('GRAPH_QUERY_INVALID');
 if(raw===null)return null; // Validate the query before any source read.
 const graph=validatePersistentGraph(raw);
 const links=[...graph.links].sort((a,b)=>a.id.localeCompare(b.id));
 const nodeDomains=new Map();
 for(const link of links)for(const [node,domain] of [[link.source,link.sourceDomain],[link.target,link.targetDomain]]){
  if(nodeDomains.has(node)&&nodeDomains.get(node)!==domain)throw Error('G2B_GRAPH_INVALID');
  nodeDomains.set(node,domain);
 }
 const paths=[];let expansions=0,searchLimited=false,pathLimitReached=false;
 const walk=(node,steps,seen)=>{
  if(searchLimited||pathLimitReached)return;
  if(steps.length===LIMITS.maxHops)return;
  for(const link of links){
   if(link.source!==node||seen.has(link.target))continue;
   if(expansions===LIMITS.maxExpansions){searchLimited=true;return;}
   expansions++;
   const next=[...steps,link];
   if(link.targetDomain===to){
    if(paths.length===LIMITS.maxPaths){pathLimitReached=true;return;}
    paths.push(next);
   }else walk(link.target,next,new Set([...seen,link.target]));
   if(searchLimited||pathLimitReached)return;
  }
 };
 for(const [node,domain] of [...nodeDomains].sort(([a],[b])=>a.localeCompare(b))){
  if(domain===from)walk(node,[],new Set([node]));
  if(searchLimited||pathLimitReached)break;
 }
 return {schemaVersion:'G2B_DIRECTED_PATHS_V1',from,to,asOf:graph.asOf,
  status:paths.length?'PATHS_OBSERVED':'NO_PATH_OBSERVED',paths,limits:LIMITS,
  expansions,searchLimited,pathLimitReached,
  boundedSearchComplete:!searchLimited&&!pathLimitReached,
  enterpriseGraphComplete:false,unprojectedLinkCount:graph.unprojectedLinkCount,
  heldLegacyLinkCount:graph.heldLegacyLinkCount,eligibleLinkCount:graph.eligibleLinkCount,
  sourceDataFreshnessCertified:false,sourceRecordVersionsVerified:false,
  causalRelationshipsVerified:false,cryptographicSignatureVerified:false,
  actionAuthorized:false,agentDispatchAuthorized:false,
  notes:'Directed link metadata within four hops only. No observed path does not establish absence of an enterprise relationship. Source freshness, versions and causality remain unverified.'};
}

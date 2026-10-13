/** JARVIS X foundation: transient source-status graph, abstract review-slot
 * optimizer, and qualified-role proposals. No graph database, no production
 * scheduling solver, no agent dispatch, no writes, and no additional AI calls.
 * All domain statuses must come from the already-verified VAOS read gateway.
 */
const AUTHORITIES=Object.freeze({
 COMMERCIAL:'listSalesOrders',
 FINANCE:'getAccountingWorkbench',
 PROCUREMENT:'getConfiguredDemandShortages',
 INVENTORY:'getAuthoritativeInventory',
 PRODUCTION:'getProductionJobCards',
 PEOPLE:'listPeopleOfficeAuthority',
 ENGINEERING:'VEDM_CURRENT_CONFIGURATION'
});
const DOMAINS=Object.freeze(Object.keys(AUTHORITIES));
const ALLOWED=new Set(DOMAINS);
const DEPENDENCIES=Object.freeze([
 ['PROCUREMENT','INVENTORY'],
 ['PROCUREMENT','PRODUCTION'],
 ['INVENTORY','PRODUCTION'],
 ['ENGINEERING','PRODUCTION'],
 ['FINANCE','PROCUREMENT'],
 ['COMMERCIAL','PRODUCTION'],
 ['PEOPLE','PRODUCTION']
]);
const WEIGHT=Object.freeze({
 ENGINEERING:5,PROCUREMENT:4,PRODUCTION:4,FINANCE:3,
 INVENTORY:3,COMMERCIAL:2,PEOPLE:2
});
const EFFORT=Object.freeze({ENGINEERING:2,FINANCE:2,PROCUREMENT:1,PRODUCTION:1,
 INVENTORY:1,COMMERCIAL:1,PEOPLE:1});
const NEXT=Object.freeze({
 COMMERCIAL:'Reconcile selected order records with engineering-ready capacity.',
 FINANCE:'Reconcile ledger coverage with bank cash and confirmed funding.',
 PROCUREMENT:'Match shortage lines to approved BOM, inventory reservations and active job cards.',
 INVENTORY:'Compare stock records with reservations and purchase receipts.',
 PRODUCTION:'Verify job-card readiness, available materials and release conditions.',
 PEOPLE:'Validate competency and staffing assignments against planned work.',
 ENGINEERING:'Check VEDM release authority, material qualification and VIBPE validation limitations.'
});
const RECEIPT_MAX_AGE_MS=5*60*1000;
function gatewayReceipt(row,clock){
 // The timestamp is generated only after a successful authorized gateway
 // read. Never confuse it with record-created or source-updated times.
 if(row.status!=='OBSERVED')return Object.freeze({at:null,ageSeconds:null,status:'NO_OBSERVED_RECEIPT'});
 const stamp=row.gatewayReadAt;
 const parsed=typeof stamp==='string'&&/^\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\d\\.\\d{3}Z$/.test(stamp)
  ?Date.parse(stamp):NaN;
 const possible=Number.isFinite(parsed)&&new Date(parsed).toISOString()===stamp;
 const age=Number.isFinite(clock)&&possible?clock-parsed:NaN;
 if(!Number.isFinite(age)||age<0)return Object.freeze({
  at:null,ageSeconds:null,status:'INVALID_OR_UNVERIFIED_GATEWAY_RECEIPT'});
 return Object.freeze({at:stamp,ageSeconds:Math.floor(age/1000),
  status:age<=RECEIPT_MAX_AGE_MS?'RECENT_GATEWAY_READ':'STALE_GATEWAY_READ'});
}
function validObservations(rows){
 return Array.isArray(rows)&&rows.length<=3&&new Set(rows.map(x=>x?.tool)).size===rows.length&&
  rows.every(x=>x&&ALLOWED.has(x.tool)&&['OBSERVED','HOLD'].includes(x.status)&&
   (x.status!=='OBSERVED'||x.sourceAuthority===AUTHORITIES[x.tool]));
}
/** Authority-checked transient topology. Edges mean POSSIBLE relationships
 * from governance schema, not evidence that one event caused another.
 * No source summaries, customer data, or record contents are copied.
 */
export function buildEvidenceGraph(observations=[],{now=Date.now()}={}){
 if(!validObservations(observations))throw Error('JARVIS_X_EVIDENCE_INVALID');
 const nodes=observations.map(x=>Object.freeze({
  id:x.tool,status:x.status,authority:x.status==='OBSERVED'?AUTHORITIES[x.tool]:null,
  gatewayReceipt:gatewayReceipt(x,now),sourceUpdatedAt:null,sourceAgeVerified:false
 }));
 const ids=new Set(nodes.map(n=>n.id));
 const edges=DEPENDENCIES.filter(([a,b])=>ids.has(a)&&ids.has(b)).map(([from,to])=>({
  from,to,relationId:'rel:v1:'+from+':'+to,
  assurance:'UNVERIFIED_DEPENDENCY_HYPOTHESIS'
 }));
 return Object.freeze({
  graphAuthority:'TRANSIENT_SOURCE_STATUS_ONLY',
  relationSchemaVersion:'SOURCE_RELATIONS_V1',sourceRecordsPersisted:false,
  nodes,edges,observedCount:nodes.filter(n=>n.status==='OBSERVED').length,
  holdCount:nodes.filter(n=>n.status==='HOLD').length,
  temporalAuthority:nodes.some(x=>x.gatewayReceipt.at!==null)
   ?'GATEWAY_READ_RECEIPTS_ONLY':'NO_TRUSTED_SOURCE_TIMESTAMPS',
  gatewayReadCoverage:nodes.filter(x=>x.gatewayReceipt.status==='RECENT_GATEWAY_READ').length,
  sourceDataFreshnessCertified:false,
  causalRelationshipsVerified:false,persistentGraphCreated:false
 });
}
const validAction=x=>x&&typeof x.id==='string'&&/^[A-Z_]{1,40}$/.test(x.id)&&
 ALLOWED.has(x.owner)&&x.evidenceStatus==='OBSERVED'&&
 Number.isSafeInteger(x.reviewCost)&&x.reviewCost>=1&&x.reviewCost<=3&&
 Number.isSafeInteger(x.priority)&&x.priority>=1&&x.priority<=10;
/** Enumerate all feasible review subsets. Optimizes *policy heuristic units*
 * only: neither costs nor priority points are monetary/production estimates.
 */
export function optimizeReviewQueue(actions=[],{reviewSlots=2}={}){
 if(!Array.isArray(actions)||actions.length>7||
  actions.some(x=>!validAction(x))||
  new Set(actions.map(x=>x.id)).size!==actions.length||
  !Number.isSafeInteger(reviewSlots)||reviewSlots<1||reviewSlots>3)
  throw Error('JARVIS_X_OPTIMIZATION_INVALID');
 let best=[],bestScore=-1,bestEffort=0;
 for(let mask=0;mask<(1<<actions.length);mask++){
  const chosen=actions.filter((_,i)=>mask&(1<<i));
  const effort=chosen.reduce((n,x)=>n+x.reviewCost,0);
  if(effort>reviewSlots)continue;
  const score=chosen.reduce((n,x)=>n+x.priority,0);
  const a=chosen.map(x=>x.id).join('|'),b=best.map(x=>x.id).join('|');
  if(score>bestScore||(score===bestScore&&(
   effort<bestEffort||(effort===bestEffort&&a<b)))){
   best=chosen;bestScore=score;bestEffort=effort;
  }
 }
 return Object.freeze({
  reviewSlots,selected:best.map(x=>({...x})),
  totalPriority:bestScore,selectedReviewUnits:bestEffort,
  objectiveType:'HEURISTIC_REVIEW_PRIORITY_ONLY',
  scoreProvenance:'FIXED_POLICY_EXAMPLE_NOT_CALIBRATED',
  monetaryForecastCertified:false,capacityForecastCertified:false,
  executionAuthorized:false,simulationOnly:true
 });
}
export function planGovernedAgentReviews(graph){
 if(!graph||graph.graphAuthority!=='TRANSIENT_SOURCE_STATUS_ONLY'||
  !Array.isArray(graph.nodes)||graph.nodes.length>3||
  graph.nodes.some(x=>!ALLOWED.has(x?.id)||!['OBSERVED','HOLD'].includes(x.status)))
  throw Error('JARVIS_X_COORDINATION_INVALID');
 return Object.freeze({
  operation:'PROPOSE_ONLY',dispatchedAgents:0,authorizedWrites:0,
  reviews:graph.nodes.map(node=>({
   id:'REVIEW_'+node.id,domain:node.id,evidenceStatus:node.status,
   role:'QUALIFIED_'+node.id+'_REVIEWER',
   qualification:'UNVERIFIED',assignment:'NOT_DISPATCHED',
   suggestion:NEXT[node.id]
  })),
  authorityRequired:'FOUNDER_GOVERNED_WORKFLOW',
  qualificationRequired:true
 });
}
export function createJarvisXPreview({observations=[],reviewSlots=2,now=Date.now()}={}){
 const evidenceGraph=buildEvidenceGraph(observations,{now});
 const coordination=planGovernedAgentReviews(evidenceGraph);
 const reviewActions=evidenceGraph.nodes.filter(x=>x.status==='OBSERVED').map(x=>({
  id:'REVIEW_'+x.id,owner:x.id,evidenceStatus:x.status,
  reviewCost:EFFORT[x.id],priority:WEIGHT[x.id]
 }));
 const optimization=optimizeReviewQueue(reviewActions,{reviewSlots});
 const status=evidenceGraph.observedCount>0?'REVIEW_PREVIEW':'HOLD';
 const chosen=optimization.selected.map(x=>x.owner);
 const observedNodes=evidenceGraph.nodes.filter(x=>x.status==='OBSERVED');
 const provenanceReadiness=observedNodes.length===0?'READ_RECEIPTS_MISSING'
  :observedNodes.every(x=>x.gatewayReceipt.status==='RECENT_GATEWAY_READ')
   ?'RECENT_GATEWAY_RECEIPTS_ONLY':'READ_RECEIPTS_PARTIAL_OR_STALE';
 const unresolvedDomains=evidenceGraph.nodes.filter(x=>x.status==='HOLD').map(x=>x.id);
 const limitations=Object.freeze(['NO_REAL_COST_OR_CAPACITY_OPTIMIZATION',
  'NO_CAUSAL_PROOF','SOURCE_FRESHNESS_UNVERIFIED','NO_AGENT_QUALIFICATION_PROOF']);
 const brief=status==='HOLD'
  ?'JARVIS X HOLD — No authorized source was observed. Verify source availability before proposing decisions. No agent was dispatched.'
  :'JARVIS X SIMULATION — '+evidenceGraph.observedCount+' source domains observed; '+
   evidenceGraph.holdCount+' on HOLD. Hypothetical review budget: '+reviewSlots+
   ' abstract review slots, NOT staff hours or production capacity; source freshness not verified. Review first: '+
   (chosen.length?chosen.join(', '):'none')+
   '. Dependencies are unverified schema hypotheses, not causes. Gateway receipt: '+
   (provenanceReadiness==='RECENT_GATEWAY_RECEIPTS_ONLY'?'recent only; source age unknown':'unverified or stale')+
   '. No agent dispatched or business action taken.';
 return Object.freeze({
  status,evidenceGraph,optimization,coordination,brief,
  evidenceFreshness:'UNVERIFIED',unresolvedDomains,limitations,
  provenanceReadiness,sourceDataFreshnessCertified:false,
  autonomousOperationsEnabled:false,productionPlanningEligible:false,
  mode:'READ_ONLY_ADVISORY_PREVIEW',
  qualifiedForProductionOptimization:false,
  simulationOnly:true,extraModelCalls:0,extraNetworkCalls:0,
  actionAuthorized:false,agentDispatchAuthorized:false
 });
}

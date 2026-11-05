// Governed, read-only visual navigation. This catalog never authorizes actions.
export const VISUAL_MODES=Object.freeze([
 Object.freeze({id:'bi',title:'Business intelligence',kicker:'ASK · INSPECT · EVIDENCE',description:'Conversational dashboards with source-linked bars and tables. Revenue and forecasts need separately qualified records.',href:'/workforce-analytics.html',renderer:'bi',label:'BI Studio'}),
 Object.freeze({id:'graph',title:'Neural knowledge graph',kicker:'NODES · EDGES · LINEAGE',description:'Read-only knowledge relationships with provenance. External graphs require qualified source snapshots.',href:'/neural-knowledge.html',renderer:'embed',label:'Neural graph'}),
 Object.freeze({id:'engineering',title:'Engineering geometry',kicker:'3D · STL · STEP',description:'Local rotate and zoom preview of uploaded geometry; no engineering release or CAD validation.',href:'/engineering-viewer.html',renderer:'embed',label:'3D engineering'}),
 Object.freeze({id:'agents',title:'Agent supervision',kicker:'MISSIONS · AUTHORITY',description:'Inspect supervised agent status, evidence, and execution holds. A registered agent is not proof of liveness.',href:'/agent-supervision.html',renderer:'embed',label:'Agent activity'}),
 Object.freeze({id:'finance',title:'Financial performance',kicker:'LEDGER · CASH · FCF',description:'Existing posted-ledger financial scorecards and scenario views. Unqualified financial values are withheld.',href:'/workforce-analytics.html',renderer:'embed',label:'Finance'}),
 Object.freeze({id:'people',title:'Workforce intelligence',kicker:'PEOPLE · WORKLOAD',description:'Read authorized workforce records, workload, completion states and qualified planning evidence.',href:'/workforce-analytics.html',renderer:'embed',label:'People'}),
 Object.freeze({id:'operations',title:'Operational intelligence',kicker:'PRODUCTION · INVENTORY',description:'Open governed manufacturing and supply-chain modules; a live factory digital twin has not been qualified.',href:'/workspace?view=manufacturing',renderer:'link',label:'Operations'}),
 Object.freeze({id:'governance',title:'Risk and governance',kicker:'APPROVALS · AUDIT',description:'Open the policy, risk, evidence and approval workspace; no read-only visualization overrides a gate.',href:'/workspace?view=governance',renderer:'link',label:'Governance'})
]);

export function getVisualMode(id){
 return VISUAL_MODES.find(item=>item.id===id)||null;
}

// Priority is intentional: specialized requests outrank generic dashboard terms.
const INTENTS=[
 ['graph',/\b(graphiti|graphify|brain\s*graph|knowledge\s*graph|ontology|neural|lineage\s*graph)\b/],
 ['engineering',/\b(3d|cad|stl|step|geometry|mesh|engineering\s*viewer|digital\s*twin)\b/],
 ['agents',/\b(agent|agents|mission|missions|orchestration|supervision)\b/],
 ['finance',/\b(finance|financial|profit|cash|revenue|fcf|ledger|balance\s*sheet|p&l)\b/],
 ['people',/\b(hr|people|employee|employees|workforce|staff|headcount)\b/],
 ['operations',/\b(mes|manufacturing|production|factory|inventory|logistics|supplier|procurement|warehouse|supply\s*chain)\b/],
 ['governance',/\b(governance|risk|approval|approvals|audit|compliance)\b/],
 ['bi',/\b(bi|dashboard|business\s*intelligence|analytics|crm|sales|kpi|report|charts?|tables?)\b/],
];
export function resolveVisualMode(raw){
 if(typeof raw!=='string')return null;
 const q=raw.trim().toLowerCase().replace(/\s+/g,' ').slice(0,240);
 if(!q||/\b(delete|erase|remove|send|execute|approve|reject|commit|modify|publish|deploy|transfer)\b/.test(q))return null;
 const hit=INTENTS.find(([,regex])=>regex.test(q));
 return hit?getVisualMode(hit[0]):null;
}

// Governed, read-only visual navigation. This catalog never authorizes actions.
export const VISUAL_MODES=Object.freeze([
 Object.freeze({id:'overview',title:'Executive visual cockpit',kicker:'KPI · FLOWS · PLANNING',description:'Illustration-grade, multi-chart enterprise cockpit with interactive drill-down and explicitly unverified scenario KPIs.',href:'/visual-intelligence.html?viz=overview',renderer:'embed',label:'Executive cockpit'}),
 Object.freeze({id:'sankey',title:'Sankey process flows',kicker:'FLOW · LOSS · TRANSFER',description:'Interactive, quantity-scaled process flows. Synthetic or unverified user scenario only; no source-to-source material balance claimed.',href:'/visual-intelligence.html?viz=sankey',renderer:'embed',label:'Sankey flows'}),
 Object.freeze({id:'factory',title:'Factory digital twin preview',kicker:'3D · STATIONS · SCENARIO',description:'Rotatable isometric 3D plant topology with scenario station states. Not a machine-connected or certified physical twin.',href:'/visual-intelligence.html?viz=factory',renderer:'embed',label:'3D factory preview'}),
 Object.freeze({id:'simulation',title:'Predictive scenario simulation',kicker:'MONTE CARLO · P10 / P50 / P90',description:'Reproducible, browser-only probabilistic cash scenarios from explicitly entered hypothetical assumptions; not an approved forecast.',href:'/visual-intelligence.html?viz=simulation',renderer:'embed',label:'Monte Carlo'}),
 Object.freeze({id:'heatmap',title:'Operational heatmaps',kicker:'INTENSITY · COVERAGE',description:'Scenario measurement matrices with explicit unknown cells and no implied production actuals.',href:'/visual-intelligence.html?viz=heatmap',renderer:'embed',label:'Heatmaps'}),
 Object.freeze({id:'waterfall',title:'Financial waterfall bridge',kicker:'COST DRIVERS · BRIDGE',description:'Illustrative arithmetic cost/revenue bridge; source ledger figures are not inferred.',href:'/visual-intelligence.html?viz=waterfall',renderer:'embed',label:'Waterfall'}),
 Object.freeze({id:'funnel',title:'CRM opportunity funnel',kicker:'LEADS · CONVERSION',description:'Illustrative CRM stage funnel. Verified pipeline conversion requires CRM source qualification.',href:'/visual-intelligence.html?viz=funnel',renderer:'embed',label:'CRM funnel'}),
 Object.freeze({id:'timeline',title:'Gantt planning view',kicker:'SCHEDULE · CONSTRAINTS',description:'Hypothetical work-package schedules; no production order commitments inferred.',href:'/visual-intelligence.html?viz=timeline',renderer:'embed',label:'Gantt planning'}),
 Object.freeze({id:'logistics',title:'Logistics geography sketch',kicker:'COORDINATES · LOCATIONS',description:'Coordinate-only transport illustration; not road routing, geolocation tracking or delivery ETA.',href:'/visual-intelligence.html?viz=logistics',renderer:'embed',label:'Logistics sketch'}),
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
 ['overview',/\b(executive\s*visual\s*cockpit|visual\s*overview|intelligence\s*overview|visual\s*dashboard|executive\s*cockpit)\b/],
 ['sankey',/\b(sankey|material\s*flow\s*(diagram|visual)|flow\s*diagram)\b/],
 ['factory',/\b(factory\s*(digital\s*)?twin|3d\s*factory|manufacturing\s*(digital\s*)?twin|factory\s*layout)\b/],
 ['simulation',/\b(monte\s*carlo|predictive\s*simulation|scenario\s*(simulation|analysis)|probability\s*band)\b/],
 ['heatmap',/\b(heatmaps?|utilization\s*matrix|capacity\s*matrix)\b/],
 ['waterfall',/\b(waterfall|cost\s*bridge|profit\s*bridge)\b/],
 ['funnel',/\b(funnel|conversion\s*(chart|stages?))\b/],
 ['timeline',/\b(gantt|timeline\s*chart|production\s*schedule\s*chart)\b/],
 ['logistics',/\b(logistics\s*(map|route|sketch)|shipment\s*map|geographic\s*(map|plot))\b/],
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

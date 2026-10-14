/** Read-only VEDM/VIBPE engineering finding.
 * VEDM controls configuration. KP and Co-Pilot guide the reasoning only.
 * Never infer approval or release from a model, method, or count.
 */
const TOPICS=Object.freeze([
 {re:/\b(change|changes|ecr|eco|ecn|revision|configuration|authority|baseline|releas|supersed|document control)\b/i,kp:['KP-13','KP-14','KP-15']},
 {re:/\b(geometry|fork|clearance|tyre|tire|stack|reach|wheelbase|fit|toe overlap)\b/i,kp:['KP-01','KP-02','KP-09','KP-12','KP-16']},
 {re:/\b(laminate|ply|prepreg|material|composite|toray|tsai|hashin)\b/i,kp:['KP-01','KP-02','KP-03','KP-04','KP-06','KP-10','KP-11','KP-12','KP-16']},
 {re:/\b(fea|structural|finite element|stress|strain)\b/i,kp:['KP-01','KP-02','KP-03','KP-06','KP-08','KP-14','KP-16']},
 {re:/\b(cfd|aero|kamm|drag)\b/i,kp:['KP-01','KP-05','KP-07','KP-08','KP-14','KP-16']},
 {re:/\b(ndt|quality|manufactur|process|inspection|test)\b/i,kp:['KP-04','KP-10','KP-11','KP-12','KP-13','KP-14']},
]);
export function routeKpModules(question){
 const text=String(question||'');
 const matched=TOPICS.filter(x=>x.re.test(text));
 if(!matched.length)return ['KP-13','KP-14','KP-15'];
 return [...new Set(matched.flatMap(x=>x.kp))].slice(0,10);
}
export function parseVedmAuthority(markdown){
 if(typeof markdown!=='string'||markdown.length<120||markdown.length>18000
    ||!/current configuration status/i.test(markdown)
    ||!/\|\s*Configuration object\s*\|\s*Authority state\s*\|/i.test(markdown))
  throw Error('VEDM_AUTHORITY_UNVERIFIED');
 const lines=markdown.split(/\r?\n/);
 const records=[];
 for(const line of lines){
  if(!line.startsWith('|')||line.length>1200)continue;
  const cells=line.split('|').slice(1,-1).map(x=>x.trim().replace(/\*\*/g,'').replace(/\`/g,''));
  if(cells.length!==2||/^(configuration object|[-: ]+)$/i.test(cells[0]))continue;
  if(!cells[0]||!cells[1]||cells[0].length>160||cells[1].length>240)continue;
  records.push({object:cells[0],status:cells[1]});
 }
 if(!records.length||!records.some(x=>/controlling/i.test(x.status)))throw Error('VEDM_AUTHORITY_UNVERIFIED');
 const gateLine=lines.find(x=>/open decisive gates remain/i.test(x))||'';
 return {records:records.slice(0,18),openGates:gateLine.replace(/\*\*/g,'').slice(0,440),
  issue:(markdown.match(/\*\*Current issue:\*\*\s*`([^`]+)`/)||[])[1]||null};
}
function safeRow(row){
 if(!row||typeof row!=='object'||Array.isArray(row))throw Error('ENGINEERING_DATA_UNVERIFIED');
 // Only controlled identity, revision, status and class are projected.
 const identity=String(row.id||'').trim();
 const status=String(row.status||'').trim();
 if(!identity||identity.length>100||!status||status.length>70||
    !/^[A-Za-z0-9_.:/-]+$/.test(identity)||!/^[a-zA-Z0-9_ -]+$/.test(status))
  throw Error('ENGINEERING_DATA_UNVERIFIED');
 return {id:identity,status,
  revision:String(row.revision_code||row.revisionCode||'').slice(0,60).replace(/[^A-Za-z0-9_.:/-]/g,''),
  category:String(row.change_class||'').slice(0,40).replace(/[^A-Za-z0-9_-]/g,'')};
}
export function buildEngineeringFinding({
 question,vedmStatus,knowledgeRegister,engineeringData,sourceRefs=[],
 vibpeAvailable=false,sourceTimestamp=null,
}={}){
 let authority;
 try{authority=parseVedmAuthority(vedmStatus);}catch{}
 if(!authority)return {status:'HOLD',
  answer:'Current VEDM controlling configuration could not be verified. No engineering revision or release claim is permitted. Check authorized VEDM source access and try again.',
  sources:[],sourceSystem:'ENGINEERING_FEDERATION',advisoryOnly:true};
 if(!engineeringData||!Array.isArray(engineeringData.changeOrders)||
     !Array.isArray(engineeringData.baselines)||
     engineeringData.changeOrders.length>100||engineeringData.baselines.length>100)
  throw Error('ENGINEERING_DATA_UNVERIFIED');
 const ecos=engineeringData.changeOrders.map(safeRow),baselines=engineeringData.baselines.map(safeRow);
 const changelog=ecos.length?ecos.slice(0,3).map(x=>x.id+' ('+x.status+(x.category?', '+x.category:'')+')').join('; '):
  'no registered ECO rows returned — this does not mean there are no engineering changes';
 const baselinePart=baselines.length?baselines.slice(0,3).map(x=>x.id+(x.revision?' Rev '+x.revision:'')+' ('+x.status+')').join('; '):
  'no engineering baseline rows returned';
 const wanted=routeKpModules(question);
 const kp=typeof knowledgeRegister==='string'?wanted.filter(x=>new RegExp('\\b'+x+'\\b').test(knowledgeRegister)):[];
 const relevant=authority.records.filter(x=>/controlling|not released|superseded/i.test(x.status)).slice(0,5);
 const state=relevant.map(x=>x.object+': '+x.status).join('; ');
 const prepregQuestion=/\b(?:toray|prepreg|resin system|t700s|t800s)\b/i.test(question||'')
  &&/\b(?:validat|qualified|approved|production|material|final)\w*/i.test(question||'');
 const bomQuestion=/\b(?:bom|bill of materials)\b/i.test(question||'')
  &&/\b(?:procure|purchas|buy|orders?|start|releas)/i.test(question||'');
 const materialGateOpen=/\bMATERIAL-01\b/i.test(authority.openGates||'')||
  /\bMATERIAL-01\b[^\n]{0,110}\b(?:OPEN|HOLD|unqualified|pending)\b/i.test(vedmStatus||'');
 const focused=prepregQuestion?[
  'TORAY / PREPREG VALIDATION — '+(materialGateOpen
   ?'No final production-qualified Toray prepreg is established by the controlling VEDM record. MATERIAL-01 remains an open gate; supplier candidate discussions are not validation or release.'
   :'The inspected controlling VEDM records do not establish a production-qualified Toray prepreg. Obtain the signed material qualification and supplier allowables before claiming release.'),
  'A production job-card count is not evidence of prepreg validation.'
 ]:bomQuestion?[
  'BOM / PROCUREMENT AUTHORITY — Preliminary supplier research, draft RFQs, quotations and lead-time comparisons can be prepared without a released manufacturing BOM.',
  'Issuing production purchase orders, calculating approved material quantities or authorizing build/production release from a proposed BOM is not permitted through this read-only workflow. Released BOM, approved engineering/material inputs and governed purchasing authorization remain prerequisites.',
  'A shortage-line count does not certify the purchase quantity or authorize procurement.'
 ]:[];

 const answer=[
  ...focused,
  'Present engineering record check: '+ecos.length+' ECO rows observed ('+changelog+'); '+baselines.length+' PDM baseline rows ('+baselinePart+').',
  'VEDM controlling configuration: '+(state||'no relevant controlling status found in the current register')+'.',
  authority.openGates?'Current VEDM open gates: '+authority.openGates:'',
  kp.length?'VIBPE Co-Pilot method routing: '+kp.join(', ')+' — advisory knowledge, not design authority.':'VIBPE method register could not be verified.',
  vibpeAvailable?'Co-Pilot rules retrieved for advisory interpretation only; no solver or Co-Pilot execution was performed.':'VIBPE Co-Pilot source unavailable; no analysis execution or recommendation was qualified.',
  'Engineering sign-off, release, supplier allowables, mesh FEA and physical validation require their own controlled evidence. An ECO count does not establish all design changes.',
 ].filter(Boolean).join(' ');
 const sources=Array.isArray(sourceRefs)?sourceRefs.filter(x=>x&&typeof x.url==='string'&&/^https:\/\/github\.com\/vayu-shastr\/(?:veloxis-engineering-design-manual|adv-vibpe)\/blob\/[0-9a-f]{40}\//.test(x.url)).slice(0,6):[];
 return {status:'OBSERVED',answer:answer.slice(0,3400),sources,advisoryOnly:true,
  sourceSystem:'ENGINEERING_FEDERATION',sourceTimestamp:sourceTimestamp||null,
  authorityScope:'VEDM_CURRENT_CONFIGURATION',methodAuthority:'K_EXTERNAL_METHOD',
  engineeringRecordsObserved:{changeOrders:ecos.length,baselines:baselines.length},
  kpModules:kp};
}

import {parseCookies,SESSION_COOKIE,verifySessionToken} from '../lib/auth.mjs';
import {apiError} from '../lib/api-contracts.mjs';
import {makeCommercialReader} from './voice-commercial.mjs';
import {getVyndiBridgeRoute} from '../../../packages/contracts/vyndi-write-bridge.mjs';
import {parseVedmAuthority,buildEngineeringFinding} from '../lib/engineering-knowledge.mjs';

const FOUNDER='shyamsundhar1982@gmail.com';
const VEDM='vayu-shastr/veloxis-engineering-design-manual';
const VIBPE='vayu-shastr/adv-vibpe';
const VOICE_FLAG='founder-readonly-browser-v1';
const ACTION='ENGINEERING.OBSERVE_CONFIGURATION';
const MAX_TEXT=16000;
const CORE=[
 'CURRENT_CONFIGURATION_STATUS.md',
 'VIBPE_Copilot/KNOWLEDGE_PACK_REGISTER.md',
];
function permittedIssue(value){
 return typeof value==='string'&&/^00_CONTROL\/CURRENT_CONFIGURATION_STATUS_Rev-[0-9A-Za-z.-]+\.md$/.test(value)&&value.length<=175;
}
async function repoReader(repo,token,fetchImpl){
 const headers={'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json',
  'X-GitHub-Api-Version':'2022-11-28','User-Agent':'VAOS-Governed-Engineering-ReadOnly'};
 async function get(suffix){
  const url='https://api.github.com/repos/'+repo+suffix;
  const response=await fetchImpl(url,{method:'GET',headers,redirect:'manual',signal:AbortSignal.timeout(6500)});
  if(!response.ok)throw Error('ENGINEERING_SOURCE_UNAVAILABLE');
  return response.json();
 }
 const ref=await get('/git/ref/heads/main');
 const sha=ref?.object?.sha;
 if(!/^[0-9a-f]{40}$/.test(sha||''))throw Error('ENGINEERING_SOURCE_INVALID');
 const document=async(path)=>{
  if(!/^[A-Za-z0-9_.\/-]+$/.test(path)||path.includes('..')||path.length>185)
    throw Error('ENGINEERING_PATH_INVALID');
  const doc=await get('/contents/'+path.split('/').map(encodeURIComponent).join('/')+'?ref='+sha);
  if(doc?.encoding!=='base64'||typeof doc.content!=='string'
   ||!Number.isInteger(doc.size)||doc.size<30||doc.size>MAX_TEXT)
   throw Error('ENGINEERING_DOCUMENT_INVALID');
  const bytes=Uint8Array.from(atob(doc.content.replace(/\s/g,'')),c=>c.charCodeAt(0));
  if(bytes.length!==doc.size)throw Error('ENGINEERING_DOCUMENT_INVALID');
  return {content:new TextDecoder('utf-8',{fatal:true}).decode(bytes),
   source:{repository:repo,path,sha,url:'https://github.com/'+repo+'/blob/'+sha+'/'+path}};
 };
 return {document};
}
export function createEngineeringKnowledgeHandler({
 fetchImpl=globalThis.fetch,getReader=makeCommercialReader,
}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET')return res.status(405).json(apiError('METHOD_NOT_ALLOWED','GET required'));
  const session=verifySessionToken(parseCookies(req.headers?.cookie||'')[SESSION_COOKIE]);
  if(!session)return res.status(401).json(apiError('UNAUTHENTICATED','Founder sign-in required'));
  if(session.email!==FOUNDER)return res.status(403).json(apiError('FOUNDER_ONLY','Founder-only engineering knowledge view'));
  if(req.env?.VAOS_VOICE_CONTROL!==VOICE_FLAG)
   return res.status(409).json(apiError('VOICE_DISABLED','Read-only founder voice not commissioned'));
  let question='';try{question=new URL(req.url).searchParams.get('q')||''}catch{}
  if(question.length<5||question.length>300||/[\x00-\x1f\x7f]/.test(question)
    ||/\b(password|secret|token|credential|private key|api key)\b/i.test(question))
   return res.status(422).json(apiError('QUERY_REJECTED','Bounded non-secret engineering question required'));
  const hold=(message,code)=>res.status(200).json({data:{
   status:'HOLD',answer:message,diagnosticCode:code,readOnly:true,actionAuthorized:false,
   sourceSystem:'ENGINEERING_FEDERATION',advisoryOnly:true,sources:[]}});

  const token=req.env?.VAOS_FEDERATED_GITHUB_TOKEN;
  if(typeof token!=='string'||token.length<20)
   return hold('Controlled VEDM knowledge source is not authorized. No current design authority can be asserted.',
      'VEDM_CREDENTIAL_UNAVAILABLE');
  let vedm,current,register,issued;
  try{
   vedm=await repoReader(VEDM,token,fetchImpl);
   current=await vedm.document(CORE[0]);
   const resolved=parseVedmAuthority(current.content);
   if(!permittedIssue(resolved.issue))throw Error('VEDM_ISSUE_INVALID');
   issued=await vedm.document(resolved.issue);
   if(!/configuration|authority|fork|geometry/i.test(issued.content))throw Error('VEDM_ISSUE_INVALID');
   register=await vedm.document(CORE[1]);
  }catch{
   return hold('Unable to verify VEDM current configuration and its cited controlled issue. Engineering authority stays on HOLD.',
    'VEDM_CURRENT_AUTHORITY_UNAVAILABLE');
  }
  let vibpe=null;
  try{
   const source=await repoReader(VIBPE,token,fetchImpl);
   const file=await source.document('docs/VIBPE-COPILOT-2-ARCHITECTURE.md');
   if(/Co-Pilot|VIBPE/i.test(file.content)&&/governance|advisory|truth/i.test(file.content))vibpe=file;
  }catch{/* An inaccessible Co-Pilot is advisory-unavailable; never silently manufacture results. */}
  const route=getVyndiBridgeRoute(ACTION);
  if(!route||route.effectClass!=='read'||route.executionEnabled!==true)
   return hold('VEDM authority was retrieved, but no qualified VYNDI engineering read route is available. The combined finding is on HOLD.','ENGINEERING_BRIDGE_UNQUALIFIED');
  let engineeringData;
  try{
   const result=await getReader(req.env).execute({actionType:ACTION,
    id:'engineering-evidence:'+crypto.randomUUID(),intentId:'engineering-evidence:'+crypto.randomUUID(),
    payload:{limit:100,missionId:'founder-engineering-intelligence'}
   });
   if(result?.actionType!==ACTION||result?.sourceAuthority!==route.authority)throw Error('ENGINEERING_AUTHORITY_MISMATCH');
   engineeringData=result.data;
  }catch{
   return hold('VEDM source retrieved, but current engineering ECR/ECO and baseline records could not be independently read from VYNDI OS. Combined answer on HOLD.',
    'VYNDI_ENGINEERING_READ_UNAVAILABLE');
  }
  try{
   const sources=[current.source,issued.source,register.source,...(vibpe?[vibpe.source]:[])];
   const finding=buildEngineeringFinding({question,vedmStatus:current.content,
     knowledgeRegister:register.content,engineeringData,sourceRefs:sources,
     vibpeAvailable:!!vibpe,sourceTimestamp:new Date().toISOString()});
   return res.status(200).json({data:{...finding,readOnly:true,actionAuthorized:false,
    vibpeExecution:'NOT_INVOKED',engineeringApproval:'HUMAN_ONLY'}});
  }catch{
   return hold('Controlled engineering records could not pass validation. No engineering release or status was inferred.',
    'ENGINEERING_SOURCE_SCHEMA');
  }
 };
}
export default createEngineeringKnowledgeHandler();

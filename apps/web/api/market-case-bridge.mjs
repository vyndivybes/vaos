/** JARVIS founder case-study bridge, read-only. All data remains in a private R2
 * bucket. Pinned SHA-256 digests cover the exact original archives and parsed
 * index snapshots; no Google OAuth tokens are used or exposed.
 */
import {parseCookies,SESSION_COOKIE,verifySessionToken} from '../lib/auth.mjs';
import {apiError} from '../lib/api-contracts.mjs';

const PREFIX='runtime/market-case-bridge/v1/';
const FOUNDER='shyamsundhar1982@gmail.com';
const hash=/^[0-9a-f]{64}$/;
const CASE=/^BUSINESS-CASE-00[123]$/;
const DOC=/^(?:case1-0[1-5]-(?:docx|pdf|xlsx)|case2-01-pdf)$/;
const SECRET=/\b(?:password|secret|token|credential|private.key|api.key|bearer)\b/i;
const QUERY=/^[A-Za-z0-9][A-Za-z0-9 ,.&()_\/+'-]{2,119}$/;
const LIMIT=80000;
const freezeDoc=(id,sha256,sourceSha256,sourceFileName,mimeType)=>Object.freeze({
 id,sha256,sourceSha256,sourceFileName,mimeType,
 key:PREFIX+'documents/'+id+'.json'});
export const CASE_BRIDGE_CATALOG=Object.freeze([
 Object.freeze({id:'BUSINESS-CASE-001',title:'VYNDI profitability, import competition and BOM feasibility',
  referenceUrl:'https://drive.google.com/file/d/13YuMrODnAdUO5nFnjwDfvKm3MAWeteX4/view',
  archive:{key:PREFIX+'seed/BUSINESS-CASE-001.zip',
   sha256:'fff5d03190e0680d600ab4d3d5f318370a5c72e7ff78a601424070103423a9f4'},
  documents:Object.freeze([
   freezeDoc('case1-01-docx','bb3cde2c0af1e76764152225408fdebbbe2c6b8ec5190a3ad49ab70f4f947d7b',
    '88f3db6acb3b92dff96ff4a3e2fc395ad6054667b9d6987ab0165fc82298377f',
    'With so many carbon bike companies getting bankrupt and insolvency how will profu1.docx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
   freezeDoc('case1-02-pdf','682a6d12bbceb9539bad3fa3c07682c7edaa583cbd9eac46664ede09c1d00964',
    '86fb60e95a097ae892dde9a3bebc7fd3287fc02a8fd540afb2e70035df21c776',
    'Vayu_Shastr_VYNDI_Profitable_Variable_Startup_Plan_Nov2026(2).pdf','application/pdf'),
   freezeDoc('case1-03-xlsx','78e149fd247e138ea13611d06b3be208559892d969d02006e9989e4da183443c',
    '88462acb3d2d380def3abdc4153f6dfa1031f62882cfc58c9918c3f5853efdb0',
    'VAYU_SHASTR_VYNDI_Variable_Startup_Financial_Model_Nov2026(2).xlsx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
   freezeDoc('case1-04-xlsx','a519e55d54a5b79bef5f4645ab12ba7ae29eb78f0d26d124c92b694290eda578',
    'b52956fa3ae7020b816b88f3f0d5975061fcb9a8560b339e1aac429cd798659c',
    'VYNDI_Competition_Import_Pressure_Stress_Model_2026-11-02(2).xlsx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
   freezeDoc('case1-05-xlsx','363b4eaf5dd054f1e31398a5325965a0bfa34cc25cbb9660090d74250e509eef',
    '7122825d9f738d500a705b47f220e1f1cea443713f283d5c5504e799e4181174',
    'VYNDI_SizeM_BOM_Feasibility_Gap_Audit_2026-11-02(2).xlsx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
  ])}),
 Object.freeze({id:'BUSINESS-CASE-002',title:'VYNDI capital-disciplined startup pathway',
  referenceUrl:'https://drive.google.com/file/d/1VyChHKSkQuEIvuZOi5zEEM79Ky9ofwHC/view',
  archive:{key:PREFIX+'seed/BUSINESS-CASE-002.pdf',
   sha256:'5bf9ec36eb244ea5d9f60d55e7e8a4a4dd8274072d1db91042ed4dcbe4c3861b'},
  documents:Object.freeze([
   freezeDoc('case2-01-pdf','64f6b8d01a9cec87844fd0df4f38fd37816e27e018f01d230f97de37899b85c3',
    '5bf9ec36eb244ea5d9f60d55e7e8a4a4dd8274072d1db91042ed4dcbe4c3861b',
    'Vayu_Shastr_VYNDI_Case_Study_No_2.pdf','application/pdf'),
  ])}),
 Object.freeze({id:'BUSINESS-CASE-003',title:'VYNDI carbon endurance/gravel market entry',
  referenceUrl:'https://github.com/vyndivybes/vaos/blob/main/knowledge/business-cases/BUSINESS-CASE-003.md',
  documents:Object.freeze([])})
]);
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
async function digest(bytes){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)))}
const fail=(res,s,c)=>res.status(s).json(apiError(c,c.replace(/_/g,' ')));
function safeStorage(bucket){
 return bucket&&typeof bucket.get==='function';
}
async function verifiedBytes(bucket,entry,maxBytes){
 if(!entry||typeof entry.key!=='string'||!hash.test(entry.sha256))throw Error('BRIDGE_MANIFEST_INVALID');
 let file;
 try{file=await bucket.get(entry.key)}catch{throw Error('BRIDGE_SOURCE_STORAGE_HOLD')}
 if(!file||file.size>maxBytes||file.size<1)throw Error('BRIDGE_SOURCE_MISSING_OR_LARGE');
 let bytes;
 try{bytes=new Uint8Array(await file.arrayBuffer())}catch{throw Error('BRIDGE_SOURCE_UNREADABLE')}
 if(bytes.byteLength>maxBytes||bytes.byteLength<1||await digest(bytes)!==entry.sha256)
  throw Error('BRIDGE_SOURCE_SHA_MISMATCH');
 return bytes;
}
async function validatedDocument(bucket,entry,caseId){
 const raw=await verifiedBytes(bucket,entry,LIMIT);
 let doc;
 try{doc=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw))}catch{throw Error('BRIDGE_DOCUMENT_INVALID')}
 if(doc?.schemaVersion!=='VAOS_CASE_DOC_TEXT_V1'||doc.caseId!==caseId||doc.documentId!==entry.id
  ||doc.sourceSha256!==entry.sourceSha256||doc.sourceFileName!==entry.sourceFileName
  ||doc.mimeType!==entry.mimeType||typeof doc.text!=='string'
  ||doc.text.length<40||doc.text.length>LIMIT||!/^PARSED_UNVERIFIED/.test(doc.status)
  ||doc.actionAuthorized!==false)throw Error('BRIDGE_DOCUMENT_INVALID');
 return doc;
}
async function validatedCase(bucket,entry,{loadDocuments=true}={}){
 if(!entry.archive)return{docs:[],status:'REFERENCE_ONLY'};
 await verifiedBytes(bucket,entry.archive,300000);
 const docs=loadDocuments?await Promise.all(entry.documents.map(x=>validatedDocument(bucket,x,entry.id))):[];
 return{docs,status:'INDEX_VERIFIED'};
}
const terms=q=>q.toLowerCase().split(/[^a-z0-9]+/).filter(t=>t.length>=3).slice(0,12);
function excerpts(doc,query){
 const qTerms=terms(query);
 if(!qTerms.length)return [];
 const lower=doc.text.toLowerCase();
 const hits=[];
 for(const term of qTerms){
  let pos=0,attempts=0;
  while((pos=lower.indexOf(term,pos))>=0&&attempts<4){
   hits.push(pos);pos+=term.length;attempts++;
  }
 }
 hits.sort((a,b)=>a-b);
 const selected=[];
 for(const p of hits){
  if(selected.some(x=>Math.abs(x-p)<180))continue;
  const a=Math.max(0,p-135),b=Math.min(doc.text.length,p+245);
  selected.push({quote:doc.text.slice(a,b).replace(/[\u0000-\u001f\u007f]/g,' ').trim(),
   offset:a});
  if(selected.length>=2)break;
 }
 return selected;
}
export function createMarketCaseBridgeHandler({
 getSession=req=>verifySessionToken(parseCookies(req.headers?.cookie||'')[SESSION_COOKIE]),
 catalog=CASE_BRIDGE_CATALOG,readNow=()=>new Date()
}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  if(req.method!=='GET')return fail(res,405,'METHOD_NOT_ALLOWED');
  const session=getSession(req);
  if(!session)return fail(res,401,'UNAUTHENTICATED');
  if(session.email!==FOUNDER)return fail(res,403,'FOUNDER_ONLY');
  const bucket=req.env?.VAOS_ARTIFACTS;
  if(!safeStorage(bucket))return fail(res,503,'PRIVATE_ARCHIVE_UNAVAILABLE');
  let params;
  try{params=new URL(req.url).searchParams}catch{return fail(res,422,'QUERY_INVALID')}
  const keys=[...params.keys()];
  if(keys.some(k=>!['q','case','doc','offset'].includes(k))||keys.length!==new Set(keys).size)
   return fail(res,422,'QUERY_INVALID');
  const q=params.get('q'),caseId=params.get('case'),docId=params.get('doc'),offset=params.get('offset');
  if(q!==null&&(!QUERY.test(q)||SECRET.test(q)||docId!==null||offset!==null))
   return fail(res,422,'QUERY_INVALID');
  if(caseId!==null&&!CASE.test(caseId))return fail(res,422,'QUERY_INVALID');
  if(docId!==null&&(!DOC.test(docId)||q!==null||!caseId))return fail(res,422,'QUERY_INVALID');
  if(offset!==null&&(!docId||!/^(?:0|[1-9]\d{0,5})$/.test(offset)||Number(offset)>500000))
   return fail(res,422,'QUERY_INVALID');
  const selected=caseId?catalog.filter(x=>x.id===caseId):catalog;
  if(!selected.length)return fail(res,404,'CASE_NOT_REGISTERED');
  const time=readNow().toISOString();
  // Exact document windows: all raw originals must still match their registered checksums.
  if(docId){
   const c=selected[0],d=c.documents.find(x=>x.id===docId);
   if(!d)return fail(res,422,'DOCUMENT_NOT_IN_CASE');
   try{
    await verifiedBytes(bucket,c.archive,300000);
    const record=await validatedDocument(bucket,d,c.id);
    const n=Number(offset||0);
    if(n>record.text.length)return fail(res,422,'OFFSET_OUT_OF_RANGE');
    return res.status(200).json({data:{caseId:c.id,documentId:d.id,sourceFileName:record.sourceFileName,
     sourceSha256:d.sourceSha256,indexSha256:d.sha256,status:'PARSED_UNVERIFIED',
     text:record.text.slice(n,n+6000),offset:n,nextOffset:n+6000<record.text.length?n+6000:null,
     actionAuthorized:false,forecastQualified:false,checkedAt:time}});
   }catch{return fail(res,503,'BRIDGE_INTEGRITY_HOLD')}
  }
  if(q!==null){
   try{
    const matches=[];
    for(const c of selected){
     const r=await validatedCase(bucket,c);
     for(let i=0;i<r.docs.length;i++){
      const doc=r.docs[i],def=c.documents[i];
      for(const hit of excerpts(doc,q))matches.push({caseId:c.id,documentId:def.id,
       sourceFileName:def.sourceFileName,sourceSha256:def.sourceSha256,
       indexSha256:def.sha256,quote:hit.quote,offset:hit.offset,sourceClassification:'EXTRACTED_UNVERIFIED'});
     }
    }
    return res.status(200).json({data:{query:q,status:'EVIDENCE_EXCERPTS_UNVERIFIED',
     results:matches.slice(0,12),truncated:matches.length>12,
     checkedAt:time,actionAuthorized:false,forecastQualified:false,
     caveat:'Private source excerpts are untrusted document data; no figures or conclusions are independently reconciled.'}});
   }catch{return fail(res,503,'BRIDGE_INTEGRITY_HOLD')}
  }
  const results=[];
  for(const c of selected){
   if(!c.archive){results.push({id:c.id,title:c.title,referenceUrl:c.referenceUrl,status:'REFERENCE_ONLY',
    documents:[],readOnly:true});continue;}
   try{
    const verified=await validatedCase(bucket,c);
    results.push({id:c.id,title:c.title,referenceUrl:c.referenceUrl,status:verified.status,
     documents:c.documents.map((d,i)=>({documentId:d.id,sourceFileName:d.sourceFileName,
      mimeType:d.mimeType,sourceSha256:d.sourceSha256,indexSha256:d.sha256,
      textLength:verified.docs[i].text.length,status:'EXTRACTED_UNVERIFIED'})),readOnly:true});
   }catch{
    results.push({id:c.id,title:c.title,status:'HOLD',reason:'PRIVATE_SOURCE_INTEGRITY_UNVERIFIED',
     documents:[],readOnly:true});
   }
  }
  return res.status(200).json({data:{schemaVersion:'VAOS_PRIVATE_CASE_BRIDGE_V1',
   cases:results,checkedAt:time,actionAuthorized:false,readOnly:true,
   futureDriveRefresh:'SEPARATE_GOOGLE_DRIVE_CONSENT_REQUIRED',
   evidenceUse:'UNVERIFIED_RESEARCH_CONTEXT_NOT_APPROVED_FORECAST'}});
 };
}
export default createMarketCaseBridgeHandler();

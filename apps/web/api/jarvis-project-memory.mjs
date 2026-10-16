import {parseCookies,SESSION_COOKIE,verifySessionToken} from '../lib/auth.mjs';
const FOUNDER='shyamsundhar1982@gmail.com';
const KEY='jarvis/founder/project-memory/v1.json';
const PROJECTS=new Set(['VYNDI','VAOS','SAATHI','GENERAL']);
const SENSITIVE=/\b(?:password|passphrase|api[_ -]?key|secret|bearer|access[_ -]?token|private[_ -]?key)\s*[:=]|-----BEGIN|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|(?:ignore (?:all |any )?(?:previous |prior )?instructions|override (?:the )?system|send my secret)/i;
const safeText=value=>typeof value==='string'&&value.length<=180&&value.length>=5&&!/[\x00-\x1f\x7f<>]/.test(value)&&!SENSITIVE.test(value)&&value.trim()===value;
const dateValid=s=>typeof s==='string'&&/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(s)&&Number.isFinite(Date.parse(s));
const output=(res,status,payload)=>res.status(status).json(payload);
const fail=(res,status,code)=>output(res,status,{error:{code}});
function checkRecord(payload){
 if(!payload||payload.schemaVersion!==1||!Array.isArray(payload.notes)||payload.notes.length>8||typeof payload.updatedAt!=='string'||!dateValid(payload.updatedAt))throw Error('PROJECT_MEMORY_INVALID');
 return payload.notes.map(x=>{
  if(!x||!PROJECTS.has(x.project)||!safeText(x.note)||!dateValid(x.createdAt))throw Error('PROJECT_MEMORY_INVALID');
  return{project:x.project,note:x.note,createdAt:x.createdAt};
 });
}
export function createJarvisProjectMemoryHandler({getSession=req=>verifySessionToken(parseCookies(req.headers?.cookie||'')[SESSION_COOKIE]),now=()=>new Date()}={}){
 return async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');
  if(!['GET','POST'].includes(req.method))return fail(res,405,'METHOD_NOT_ALLOWED');
  const session=getSession(req);
  if(!session)return fail(res,401,'UNAUTHENTICATED');
  if(session.email!==FOUNDER)return fail(res,403,'FOUNDER_ONLY');
  const bucket=req.env?.VAOS_ARTIFACTS;
  if(!bucket||typeof bucket.get!=='function'||typeof bucket.put!=='function'||typeof bucket.delete!=='function')return fail(res,503,'MEMORY_STORAGE_UNAVAILABLE');
  let object,storedNotes=[],version=null;
  try{
   object=await bucket.get(KEY);
   if(object){storedNotes=checkRecord(await object.json());version=object.etag;
    if(typeof version!=='string'||!version)throw Error('PROJECT_MEMORY_INVALID');
   }
  }catch{return fail(res,503,'MEMORY_RECORD_UNAVAILABLE');}
  // Notes naturally expire from read context after 60 days; Clear deletes the underlying object.
  const timestamp=now().getTime();
  const notes=storedNotes.filter(x=>timestamp-Date.parse(x.createdAt)<60*86400000&&Date.parse(x.createdAt)<=timestamp+60000);
  if(req.method==='GET')return output(res,200,{data:{notes,version,scope:'AUTHENTICATED_FOUNDER_R2',actionAuthorized:false,sourceAuthority:'USER_SAVED_UNVERIFIED',retentionDays:60}});
  let origin;try{origin=new URL(req.url).origin}catch{return fail(res,403,'ORIGIN_DENIED');}
  if(req.headers?.origin!==origin)return fail(res,403,'ORIGIN_DENIED');
  if(!/^application\/json(?:\s*;|$)/i.test(req.headers?.['content-type']||''))return fail(res,415,'JSON_REQUIRED');
  const b=req.body;
  if(!b||typeof b!=='object'||Array.isArray(b)||JSON.stringify(b).length>1200)return fail(res,422,'INPUT_INVALID');
  if(b.confirm!==true)return fail(res,400,'EXPLICIT_CONSENT_REQUIRED');
  if((b.version??null)!==version)return fail(res,409,'MEMORY_VERSION_CONFLICT');
  if(b.operation==='REMEMBER'){
   if(Object.keys(b).sort().join(',')!=='confirm,note,operation,project,version'||!PROJECTS.has(b.project)||!safeText(b.note))return fail(res,422,'NOTE_REJECTED');
   const current=now().toISOString();
   const next=[...notes,{project:b.project,note:b.note,createdAt:current}].slice(-8);
   const value=JSON.stringify({schemaVersion:1,notes:next,updatedAt:current});
   try{
    const written=await bucket.put(KEY,value,{onlyIf:version?{etagMatches:version}:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}});
    if(!written)return fail(res,409,'MEMORY_VERSION_CONFLICT');
    return output(res,200,{data:{notes:next,version:written.etag,scope:'AUTHENTICATED_FOUNDER_R2',sourceAuthority:'USER_SAVED_UNVERIFIED',actionAuthorized:false}});
   }catch{return fail(res,503,'MEMORY_WRITE_UNAVAILABLE');}
  }
  if(b.operation==='CLEAR'){
   if(Object.keys(b).sort().join(',')!=='confirm,operation,version')return fail(res,422,'CLEAR_REJECTED');
   try{await bucket.delete(KEY);return output(res,200,{data:{notes:[],version:null,deleted:true,actionAuthorized:false}});}
   catch{return fail(res,503,'MEMORY_DELETE_UNAVAILABLE');}
  }
  return fail(res,422,'OPERATION_DENIED');
 };
}
export default createJarvisProjectMemoryHandler();

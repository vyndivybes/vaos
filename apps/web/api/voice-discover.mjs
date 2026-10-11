import {parseCookies,SESSION_COOKIE,verifySessionToken} from '../lib/auth.mjs';
import {getEightAgentOperatingService} from '../lib/operating-provider.mjs';
import {apiError} from '../lib/api-contracts.mjs';
const FOUNDER='shyamsundhar1982@gmail.com';
const FLAG='founder-readonly-browser-v1';
// Deliberately limited to runnable missions in the governed queue.
// No claim of full enterprise search. Never dispatch, write or ask the model.
export function createVoiceDiscoverHandler({getService=getEightAgentOperatingService}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json(apiError('METHOD_NOT_ALLOWED','GET required'));
  const session=verifySessionToken(parseCookies(req.headers?.cookie||'')[SESSION_COOKIE]);
  if(!session)return res.status(401).json(apiError('UNAUTHENTICATED','Sign in required'));
  if(session.email!==FOUNDER)return res.status(403).json(apiError('FOUNDER_ONLY','Founder required'));
  if(req.env?.VAOS_VOICE_CONTROL!==FLAG)return res.status(409).json(apiError('VOICE_DISABLED','Voice pilot disabled'));
  let question;
  try{question=new URL(req.url).searchParams.get('q');}catch{}
  if(typeof question!=='string'||question.length<5||question.length>300
    ||/[^\x20-\x7e]/.test(question)
    ||/\b(approve|execute|delete|pay|purchase|dispatch|create|post|update|modify|transfer)\b/i.test(question))
    return res.status(422).json(apiError('READONLY_QUESTION_REQUIRED','Read-only status question required'));
  try{
    const service=getService(req.env);
    const queue=await service.listRunnableMissions({limit:8});
    if(!Array.isArray(queue?.missionIds)||queue.missionIds.length>8)throw Error('queue unavailable');
    const keywords=question.toLowerCase().match(/[a-z0-9]{4,}/g)||[];
    const matches=[];
    for(const id of queue.missionIds){
      if(typeof id!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{3,95}$/.test(id))continue;
      let record;try{record=await service.snapshot(id);}catch{continue;}
      if(record?.mission?.id!==id||!Array.isArray(record.workPackages))continue;
      const searchable=[id,record.mission.objective||'',record.mission.title||''].join(' ').toLowerCase();
      const score=keywords.filter(k=>searchable.includes(k)).length;
      matches.push({id,status:String(record.mission.status||'UNVERIFIED').slice(0,48),
       completed:record.workPackages.filter(w=>w.status==='COMPLETED').length,
       blocked:record.workPackages.filter(w=>w.status==='BLOCKED').length,
       total:record.workPackages.length,score});
    }
    matches.sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
    const selected=matches.filter(x=>x.score>0).slice(0,3);
    return res.status(200).json({data:{
      scope:'RUNNABLE_MISSIONS_ONLY',readOnly:true,actionAuthorized:false,
      matches:selected,
      answer:selected.length
        ?'I found '+selected.length+' matching runnable mission'+(selected.length===1?'':'s')+'. '+
          selected.map(m=>'Mission '+m.id+' reports '+m.status+
            ', '+m.completed+' completed and '+m.blocked+' blocked work packages out of '+m.total+'.').join(' ')+
          ' This is a database snapshot, not independent verification.'
        :'I could not find a matching mission in the runnable queue. This does not mean no relevant mission exists.',
    }});
  }catch{return res.status(503).json(apiError('DISCOVERY_UNAVAILABLE','Read-only discovery unavailable'));}
 };
}
export default createVoiceDiscoverHandler();

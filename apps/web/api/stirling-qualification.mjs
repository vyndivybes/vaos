import {getStirlingLiveQualificationEvidence} from '../../../platform/execution/stirling-live-qualification.mjs';
const respond=(status,data)=>new Response(JSON.stringify(data),{status,headers:{
  'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
export function createStirlingQualificationHandler({getEvidence=getStirlingLiveQualificationEvidence}={}){
  return async function status(req){
    if(req.method!=='GET')return respond(405,{error:{code:'METHOD_NOT_ALLOWED'}});
    try{return respond(200,await getEvidence({env:req.env}))}
    catch{return respond(503,{providerId:'stirling-pdf',status:'HOLD',
      reason:'STIRLING_AUDIT_UNAVAILABLE',productionActivation:false})}
  };
}
export default createStirlingQualificationHandler();

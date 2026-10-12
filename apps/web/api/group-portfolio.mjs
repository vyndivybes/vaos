import {parseCookies,SESSION_COOKIE,verifySessionToken} from '../lib/auth.mjs';
import {apiError} from '../lib/api-contracts.mjs';
import {makeCommercialReader} from './voice-commercial.mjs';
import {getVyndiBridgeRoute} from '../../../packages/contracts/vyndi-write-bridge.mjs';
import {READ_DOMAINS,buildGroupPortfolio} from '../lib/group-portfolio.mjs';

const FOUNDER='shyamsundhar1982@gmail.com';
const HOLD=Object.freeze({status:'HOLD'});
/** Signatures and source authority are enforced by the existing VYNDI read
 * bridge; the response is projected to statuses only. No sensitive raw data.
 */
export async function observeGroupSources(reader){
 const results=[];
 for(let i=0;i<READ_DOMAINS.length;i+=3){
  const batch=READ_DOMAINS.slice(i,i+3);
  const entries=await Promise.all(batch.map(async spec=>{
   const contract=getVyndiBridgeRoute(spec.actionType);
   if(!contract||contract.effectClass!=='read'||contract.executionEnabled!==true
      ||contract.authority!==spec.authority)return {id:spec.id,...HOLD};
   try{
    const value=await reader.execute({
     actionType:spec.actionType,id:'group-observe:'+crypto.randomUUID(),
     intentId:'group-observe:'+crypto.randomUUID(),
     payload:{limit:50,missionId:'vaos-founder-group-dashboard'}
    });
    if(value?.actionType!==spec.actionType||value?.sourceAuthority!==contract.authority
       ||!value.data||typeof value.data!=='object')return {id:spec.id,...HOLD};
    return {id:spec.id,status:'OBSERVED',authority:contract.authority};
   }catch{return {id:spec.id,...HOLD};}
  }));
  results.push(...entries);
 }
 return results;
}
export function createGroupPortfolioHandler({getReader=makeCommercialReader}={}){
 return async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET')return res.status(405).json(apiError('METHOD_NOT_ALLOWED','GET required'));
  const session=verifySessionToken(parseCookies(req.headers?.cookie||'')[SESSION_COOKIE]);
  if(!session)return res.status(401).json(apiError('UNAUTHENTICATED','Sign in required'));
  if(session.email!==FOUNDER)return res.status(403).json(apiError('FOUNDER_ONLY','Group oversight requires founder role'));
  let observations=[];
  try{observations=await observeGroupSources(getReader(req.env));}catch{
   // Source credentials, provider errors and personnel data must not leak.
   observations=[];
  }
  const data=buildGroupPortfolio(observations);
  return res.status(200).json({data:{...data,readOnly:true,actionAuthorized:false}});
 };
}
export default createGroupPortfolioHandler();

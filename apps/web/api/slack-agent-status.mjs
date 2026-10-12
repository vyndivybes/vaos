import {probeSlackFounderAgent} from '../../../platform/execution/slack-founder-agent.mjs';

function reply(status,payload){
  return new Response(JSON.stringify(payload),{status,headers:{
    'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
  }});
}
export default async function slackAgentStatus(req){
  if(req.method!=='GET')return reply(405,{error:{code:'METHOD_NOT_ALLOWED'}});
  const result=await probeSlackFounderAgent({env:req.env});
  return reply(result.status==='PASS'?200:503,{
    providerId:'slack',capability:'founder.read-reason-reply',
    ...result,productionActivation:result.status==='PASS',
  });
}

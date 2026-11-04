import {probeSlackFounderAgent} from '../../../platform/execution/slack-founder-agent.mjs';
import {parseCookies,SESSION_COOKIE,verifySessionToken} from '../lib/auth.mjs';

function reply(status,payload){
  return new Response(JSON.stringify(payload),{status,headers:{
    'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
  }});
}
export default async function slackAgentStatus(req){
  if(req.method!=='GET')return reply(405,{error:{code:'METHOD_NOT_ALLOWED'}});
  // Each call makes a live Slack API request with the bot token, so it must never
  // be reachable without a valid session (prevents anonymous quota exhaustion).
  const session=verifySessionToken(parseCookies(req.headers?.cookie||'')[SESSION_COOKIE]);
  if(!session)return reply(401,{error:{code:'UNAUTHENTICATED'}});
  const result=await probeSlackFounderAgent({env:req.env});
  return reply(200,{
    providerId:'slack',capability:'founder.read-reason-reply',
    ...result,productionActivation:result.status==='PASS',
  });
}

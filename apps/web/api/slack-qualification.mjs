import {parseCookies, SESSION_COOKIE, verifySessionToken} from '../lib/auth.mjs';
import {createSlackNotificationAdapter} from '../../../integrations/slack/notification-adapter.mjs';
import {createGovernedHttpTransport} from '../../../platform/execution/governed-http-transport.mjs';

const ORIGIN='https://slack.com';
const CHANNEL='C0C90LK78KA';
function respond(status, data){
  return new Response(JSON.stringify(data),{status,headers:{
    'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
  }});
}
function maker(req){
  const token=parseCookies(req.headers?.cookie||'')[SESSION_COOKIE]||'';
  const p=verifySessionToken(token);
  return p?.email==='shyamsundhar1982@gmail.com';
}
// Qualification is NOT production routing. A deliberate maker-session action is
// required for each synthetic send and the result remains HOLD pending independent readback.
export function createSlackQualificationHandler({makeAdapter}={}){
  return async function handle(req){
    if(!['GET','POST'].includes(req.method))return respond(405,{error:{code:'METHOD_NOT_ALLOWED'}});
    if(!maker(req))return respond(403,{error:{code:'MAKER_REQUIRED'}});
    const bound=typeof req.env?.SLACK_BOT_TOKEN==='string'&&req.env.SLACK_BOT_TOKEN.startsWith('xoxb-');
    if(req.method==='GET')return respond(200,{
      providerId:'slack',status:'HOLD',
      reason:bound?'INDEPENDENT_LIVE_QUALIFICATION_REQUIRED':'SLACK_BOT_TOKEN_MISSING',
      botTokenConfigured:bound,channelId:CHANNEL,productionActivation:false,
    });
    const ownOrigin=new URL(req.url).origin;
    if(req.headers?.origin!==ownOrigin)return respond(403,{error:{code:'ORIGIN_INVALID'}});
    if(req.headers?.['content-type']?.split(';')[0].trim().toLowerCase()!=='application/json')return respond(415,{error:{code:'CONTENT_TYPE_INVALID'}});
    if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||
       Object.keys(req.body).length!==1||req.body.confirm!=='run-synthetic-slack-once'){
      return respond(422,{error:{code:'CONFIRMATION_REQUIRED'}});
    }
    if(!bound)return respond(503,{providerId:'slack',status:'HOLD',reason:'SLACK_BOT_TOKEN_MISSING',productionActivation:false});
    try{
      const adapter=(makeAdapter||((env)=>createSlackNotificationAdapter({
        token:env.SLACK_BOT_TOKEN,channelId:CHANNEL,enabled:true,
        transport:createGovernedHttpTransport({allowedOrigins:[ORIGIN],maxRequestBytes:2048,maxResponseBytes:2048}),
      })))(req.env);
      const eventId=crypto.randomUUID();
      const result=await adapter.execute({
        id:eventId,intentId:eventId,
        payload:{eventId,kind:'qualification.passed',severity:'info',
          summary:'VAOS synthetic Slack delivery. Production notification routing remains disabled.',
          evidenceRef:'slack-qualification:'+eventId},
      });
      // Append bounded acknowledgement evidence to the VAOS R2 artifact boundary.
      // It is deliberately a HOLD: Slack readback/approval are independent steps.
      let auditRecorded=false;
      try{
        if(req.env?.VAOS_ARTIFACTS?.put){
          await req.env.VAOS_ARTIFACTS.put('qualification/slack/'+eventId+'.json',JSON.stringify({
            schemaVersion:'vaos.slack.qualification.v1',providerId:'slack',
            eventId,channelId:CHANNEL,providerRunId:result.providerRunId,
            acknowledgmentVerified:result.verification?.verified===true,
            independentReadbackVerified:false,productionActivation:false,
            recordedAt:new Date().toISOString(),
          }),{httpMetadata:{contentType:'application/json'}});
          auditRecorded=true;
        }
      }catch{auditRecorded=false}
      return respond(200,{providerId:'slack',status:'HOLD',
        reason:auditRecorded?'INDEPENDENT_SLACK_READBACK_REQUIRED':'SLACK_AUDIT_UNAVAILABLE',
        channelId:CHANNEL,eventId,providerRunId:result.providerRunId,
        acknowledgmentVerified:result.verification?.verified===true,
        auditRecorded,productionActivation:false});
    }catch(e){
      const code=typeof e?.code==='string'&&/^SLACK_[A-Z_]+$/.test(e.code)?e.code:'SLACK_QUALIFICATION_FAILED';
      return respond(503,{providerId:'slack',status:'HOLD',reason:code,productionActivation:false});
    }
  };
}
export default createSlackQualificationHandler();

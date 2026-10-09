// VAOS -> Slack is deliberately outbound-only. Slack must never become a source
// of authority to execute agent actions or approve governance transitions.
const TYPES=new Set(['provider.hold','provider.failed','provider.recovered','mission.hold','mission.failed','mission.completed','qualification.passed','qualification.failed','watchdog.failed']);
const SEVERITY=new Set(['info','warning','critical']);
function fail(code,unknown=false){const e=new Error(code);e.code=code;e.retryable=false;e.outcomeUnknown=unknown;return e}
function validText(v,max){return typeof v==='string'&&v.length>0&&v.length<=max&&v.trim()===v&&!/[\r\n\x00-\x1f<>]/.test(v)}
function validate(payload){
  if(!payload||typeof payload!=='object'||Array.isArray(payload))throw fail('SLACK_EVENT_INVALID');
  if(Object.keys(payload).sort().join(',')!=='eventId,evidenceRef,kind,severity,summary')throw fail('SLACK_EVENT_INVALID');
  if(!validText(payload.eventId,100)||!validText(payload.evidenceRef,180)||!validText(payload.summary,400)||!TYPES.has(payload.kind)||!SEVERITY.has(payload.severity))throw fail('SLACK_EVENT_INVALID');
  return payload;
}
export function createSlackNotificationAdapter({token,channelId,enabled=false,transport}={}){
  if(enabled&&(!validText(token,400)||!/^xoxb-/.test(token)))throw fail('SLACK_TOKEN_REQUIRED');
  if(enabled&&(!validText(channelId,40)||!/^C[A-Z0-9]+$/.test(channelId)))throw fail('SLACK_CHANNEL_REQUIRED');
  if(!transport||typeof transport.request!=='function')throw fail('SLACK_TRANSPORT_REQUIRED');
  return Object.freeze({
    providerId:'slack',capability:'notification.send',
    async execute(job){
      if(!enabled)throw fail('SLACK_DISABLED');
      const id=job?.id,intentId=job?.intentId;
      if(!validText(id,120)||!validText(intentId,120))throw fail('SLACK_JOB_INVALID');
      const payload=validate(job.payload);
      const body={
        channel:channelId,
        text:`[VAOS] ${payload.severity.toUpperCase()} · ${payload.kind}\n${payload.summary}\nEvidence: ${payload.evidenceRef}`,
        unfurl_links:false,unfurl_media:false,link_names:false,
        metadata:{event_type:'vaos_notification',event_payload:{eventId:payload.eventId}},
      };
      let r;
      try{
        r=await transport.request({
          url:'https://slack.com/api/chat.postMessage',method:'POST',
          headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
          body,timeoutMs:8000,allowedResponseTypes:['application/json'],
        });
      }catch{throw fail('SLACK_DELIVERY_UNCERTAIN',true)}
      if(r?.status!==200||r?.body?.ok!==true)throw fail('SLACK_DELIVERY_REJECTED');
      if(r.body.channel!==channelId||!/^\d+\.\d+$/.test(r.body.ts||''))throw fail('SLACK_DELIVERY_UNVERIFIED');
      return Object.freeze({
        providerId:'slack',capability:'notification.send',providerRunId:r.body.ts,
        verification:{verified:true,evidenceRefs:[`slack:${channelId}:${r.body.ts}`]},
      });
    },
  });
}

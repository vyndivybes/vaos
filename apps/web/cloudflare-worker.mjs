import {runFounderWorkspaceDigest} from '../../platform/execution/google-founder-daily-brief.mjs';
import googleWorkspace from './api/google-workspace.mjs';
import {runHourlyIncidentAlerts} from '../../platform/execution/slack-incident-observer.mjs';
import {runHourlyCiAlerts} from '../../platform/execution/github-slack-ci.mjs';
import { dispatchInfisicalWatchdog, infisicalDispatchFailureCode } from '../../platform/execution/cloudflare-infisical-dispatch.mjs';
import { runProductionReadOnlyObservation } from '../../platform/execution/production-l5-observer.mjs';
import { getDurableControlService } from './lib/durable-control-provider.mjs';
import { getExecutionEngine } from './lib/execution-provider.mjs';
import { runCloudflareInfisicalHealth, isCloudflareInfisicalHealthEnabled } from '../../platform/execution/cloudflare-infisical-direct-health.mjs';
import login from './api/login.mjs';
import {hardenedRevocationRequired,checkHardenedRevocation} from './lib/session-revocation.mjs';
import session from './api/session.mjs';
import authCutoverReadiness from './api/auth-cutover-readiness.mjs';
import logout from './api/logout.mjs';
import controlPlane from './api/control-plane.mjs';
import intents from './api/intents.mjs';
import approvals from './api/approvals.mjs';
import executions from './api/executions.mjs';
import commissioning from './api/commissioning.mjs';
import activepiecesMcp from './api/activepieces-mcp.mjs';
import difyLiveQualification from './api/dify-live-qualification.mjs';
import difyLiveReconciliation from './api/dify-live-reconciliation.mjs';
import difyExactVerification from './api/dify-exact-verification.mjs';
import {runStirlingLiveQualification} from '../../platform/execution/stirling-live-qualification.mjs';
import stirlingQualification from './api/stirling-qualification.mjs';
import missions from './api/missions.mjs';
import projectSchedule from './api/project-schedule.mjs';
import windmillRuntimeStatus from './api/windmill-runtime-status.mjs';
import windmillScopedRun from './api/windmill-scoped-run.mjs';
import windmillLiveDoQualification from './api/windmill-live-do-qualification.mjs';
import slackQualification from './api/slack-qualification.mjs';
import slackAgentStatus from './api/slack-agent-status.mjs';
import zapierWebhook from './api/zapier-webhook.mjs';
import langgraph from './api/langgraph.mjs';
import workforceAnalytics from './api/workforce-analytics.mjs';
import enterpriseBi from './api/enterprise-bi.mjs';
import vyndiDepartmentReport from './api/vyndi-department-report.mjs';
import financeScorecard from './api/finance-scorecard.mjs';
import founderInbox from './api/founder-inbox.mjs';
import founderAgentReport from './api/founder-agent-report.mjs';
import founderChat from './api/founder-chat.mjs';
import jarvisMultimodal from './api/jarvis-multimodal.mjs';
import prelaunchWorkforce from './api/prelaunch-workforce.mjs';
import prelaunchRecovery from './api/prelaunch-recovery.mjs';
import founderConversation from './api/founder-conversation.mjs';
import voiceCapabilities from './api/voice-capabilities.mjs';
import voiceDiscover from './api/voice-discover.mjs';
import voiceCommercial from './api/voice-commercial.mjs';
import voiceInsight from './api/voice-insight.mjs';
import businessAdvisor from './api/business-advisor.mjs';
import jarvisDataAgent from './api/jarvis-data-agent.mjs';
import adaptiveIntelligence from './api/adaptive-intelligence.mjs';
import jarvisAuthorityGraph from './api/jarvis-authority-graph.mjs';
import jarvisSourceAudit from './api/jarvis-source-audit.mjs';
import jarvisG3Readiness from './api/jarvis-g3-readiness.mjs';
import jarvisCoordination from './api/jarvis-coordination.mjs';
import jarvisLearningReview from './api/jarvis-learning-review.mjs';
import engineeringKnowledge from './api/engineering-knowledge.mjs';
import groupPortfolio from './api/group-portfolio.mjs';
import voiceEvidenceAi from './api/voice-evidence-ai.mjs';
import federatedKnowledge from './api/federated-knowledge.mjs';
import voiceAiFocus from './api/voice-ai-focus.mjs';
import { getEightAgentOperatingService } from './lib/operating-provider.mjs';
import { runScheduledMissionSweep } from '../../platform/execution/mission-scheduler.mjs';
import { readMissionDepartment } from './lib/mission-department-reader.mjs';
import { invokeCloudflareHandler } from './lib/cloudflare-adapter.mjs';
import {runSlackFounderAgent} from '../../platform/execution/slack-founder-agent.mjs';
import {handleSlackEvent} from './api/slack-events.mjs';

export const DEFAULT_API_HANDLERS = Object.freeze({
  '/api/login': login,
  '/api/session': session,
  '/api/auth-cutover-readiness': authCutoverReadiness,
  '/api/logout': logout,
  '/api/control-plane': controlPlane,
  '/api/intents': intents,
  '/api/approvals': approvals,
  '/api/executions': executions,
  '/api/commissioning': commissioning,
  '/api/activepieces-mcp': activepiecesMcp,
  '/api/dify-live-qualification': difyLiveQualification,
  '/api/dify-live-reconciliation': difyLiveReconciliation,
  '/api/dify-exact-verification': difyExactVerification,
  '/api/stirling-qualification/status': stirlingQualification,
  '/api/activepieces-mcp/start': activepiecesMcp,
  '/api/activepieces-mcp/enroll/start': activepiecesMcp,
  '/api/activepieces-mcp/verify': activepiecesMcp,
  '/api/activepieces-mcp/callback': activepiecesMcp,
  '/api/activepieces-mcp/status': activepiecesMcp,
  '/api/activepieces-mcp/synthetic-evidence': activepiecesMcp,
  '/api/activepieces-mcp/synthetic-diagnostic': activepiecesMcp,
  '/api/activepieces-mcp/synthetic-reconciliation': activepiecesMcp,
  '/api/activepieces-mcp/synthetic-preflight': activepiecesMcp,
  '/api/activepieces-mcp/synthetic-repair': activepiecesMcp,
  '/api/activepieces-mcp/code-recovery': activepiecesMcp,
  '/api/activepieces-mcp/discovery-health': activepiecesMcp,
    '/api/missions': missions,
    '/api/prelaunch-workforce': prelaunchWorkforce,
    '/api/prelaunch-recovery': prelaunchRecovery,
  '/api/project-schedule': projectSchedule,
  '/api/windmill-runtime-status': windmillRuntimeStatus,
  '/api/windmill-scoped-run': windmillScopedRun,
  '/api/windmill-live-do-qualification': windmillLiveDoQualification,
  '/api/slack-qualification': slackQualification,
  '/api/slack-agent-status': slackAgentStatus,
  '/api/zapier-webhook': zapierWebhook,
  '/api/google-workspace/status': googleWorkspace,
  '/api/google-workspace/start': googleWorkspace,
  '/api/google-workspace/callback': googleWorkspace,
  '/api/google-workspace/brief': googleWorkspace,
  '/api/langgraph': langgraph,
  '/api/workforce-analytics': workforceAnalytics,
  '/api/enterprise-bi': enterpriseBi,
  '/api/vyndi-department-report': vyndiDepartmentReport,
  '/api/finance-scorecard': financeScorecard,
  '/api/founder-inbox': founderInbox,
  '/api/founder-agent-report': founderAgentReport,
  '/api/founder-chat': founderChat,
  '/api/jarvis-multimodal': jarvisMultimodal,
  '/api/founder-conversation': founderConversation,
  '/api/voice-capabilities': voiceCapabilities,
  '/api/voice-discover': voiceDiscover,
  '/api/voice-commercial': voiceCommercial,
  '/api/voice-insight': voiceInsight,
  '/api/business-advisor': businessAdvisor,
  '/api/jarvis-data-agent': jarvisDataAgent,
  '/api/adaptive-intelligence': adaptiveIntelligence,
  '/api/jarvis-authority-graph': jarvisAuthorityGraph,
  '/api/jarvis-source-audit': jarvisSourceAudit,
  '/api/jarvis-g3-readiness': jarvisG3Readiness,
  '/api/jarvis-coordination': jarvisCoordination,
  '/api/jarvis-learning-review': jarvisLearningReview,
  '/api/engineering-knowledge': engineeringKnowledge,
  '/api/group-portfolio': groupPortfolio,
  '/api/voice-evidence-ai': voiceEvidenceAi,
  '/api/federated-knowledge': federatedKnowledge,
  '/api/voice-ai-focus': voiceAiFocus,
});

function loginRedirect(request) {
  return Response.redirect(new URL('/login', request.url), 307);
}

function jsonError(status, code, message) {
  return new Response(JSON.stringify({
    error: { code, message },
  }), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function uncachedWorkspaceAsset(path, response) {
  const isWorkspaceHtml = ['/workspace', '/workspace.html', '/skills', '/skills.html', '/mission-status', '/mission-status.html', '/founder-console.html', '/workforce-analytics.html', '/prelaunch-workspace.html', '/engineering-viewer.html'].includes(path);
  const isExecutableModule = path.endsWith('.mjs') || path.endsWith('.js');
  const isWorkspaceStylesheet = path.endsWith('.css');
  if (!isWorkspaceHtml && !isExecutableModule && !isWorkspaceStylesheet) return response;

  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store, max-age=0');
  headers.set('Pragma', 'no-cache');
  headers.set('Expires', '0');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function isLegacyRoute(pathname) {
  return ['/house', '/range'].some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function createCloudflareApp({
  apiHandlers = DEFAULT_API_HANDLERS,
  assetFetcher,
  runtimeEnv,
} = {}) {
  if (typeof assetFetcher !== 'function') {
    throw new Error('CLOUDFLARE_ASSET_FETCHER_REQUIRED');
  }

  return Object.freeze({
    async fetch(request) {
      const url = new URL(request.url);
      const path = url.pathname;

      if (path === '/' || isLegacyRoute(path)) {
        return loginRedirect(request);
      }

      if (path === '/api' || path.startsWith('/api/')) {
        const handler = apiHandlers[path];
        if (!handler) return jsonError(404, 'NOT_FOUND', 'API route not found');
        if(hardenedRevocationRequired(runtimeEnv)){
          try{
            const checked=await checkHardenedRevocation(request.headers.get('cookie')||'',runtimeEnv?.VAOS_ARTIFACTS);
            if(checked.revoked)return jsonError(401,'SESSION_REVOKED','Session is no longer valid');
          }catch{
            return jsonError(503,'SESSION_REVOCATION_UNAVAILABLE','Authentication verification unavailable');
          }
        }
        return invokeCloudflareHandler(handler, request, runtimeEnv);
      }

      const assetResponse = await assetFetcher(request);
      if (assetResponse.status !== 404) return uncachedWorkspaceAsset(path, assetResponse);

      // Missing executable modules must never be redirected to HTML/login.
      // Browser module loaders reject HTML; surface a real 404 for diagnosis.
      if (/\.(?:mjs|js)$/i.test(path)) {
        return new Response('JavaScript module not found', {
          status: 404,
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
          },
        });
      }
      return loginRedirect(request);
    },
  });
}

export default {
  async scheduled(_controller, env, ctx) {
    // Keep the existing mission sweep independent from Infisical health dispatch.
    const mission = Promise.resolve().then(() => runScheduledMissionSweep({
      service: getEightAgentOperatingService(env),
      maxMissions: 4,
      maxHandoffs: 4,
      readDepartment: input => readMissionDepartment({ ...input, env }),
    })).then((summary) => {
      console.log('VAOS_SAFE_MISSION_SWEEP', JSON.stringify(summary));
    });
    // Native canary is explicitly opt-in; preserve the existing route until
    // the scoped Cloudflare bootstrap keys and Supabase RPC migration qualify.
    const directWatchdog = isCloudflareInfisicalHealthEnabled(env);
    const watchdog = (directWatchdog
      ? runCloudflareInfisicalHealth({env,scheduledTime:_controller?.scheduledTime})
      : dispatchInfisicalWatchdog({
          token:env.VAOS_GITHUB_WATCHDOG_DISPATCH_TOKEN,
          scheduledTime:_controller?.scheduledTime,
        })
    ).then(result=>{
      if(directWatchdog){
        if(result.status!=='healthy')throw new Error('INFISICAL_DIRECT_HEALTH_NOT_VERIFIED');
        console.log('VAOS_INFISICAL_DIRECT_HEALTH',JSON.stringify({
          status:'healthy',scheduledTime:result.scheduledTime,
          productionActivation:false,
        }));
      }else{
        console.log('VAOS_INFISICAL_CRON_DISPATCH',JSON.stringify({
          status:result.status,scheduledTime:_controller?.scheduledTime||null,
        }));
        if(result.status!=='accepted')throw new Error('VAOS_INFISICAL_CRON_DISPATCH_UNCONFIGURED');
      }
    }).catch(error=>{
      if(directWatchdog){
        const code=typeof error?.code==='string'&&/^INFISICAL_DIRECT_[A-Z_]+$/.test(error.code)
          ?error.code:'INFISICAL_DIRECT_FAILED';
        console.error('VAOS_INFISICAL_DIRECT_HEALTH_FAILED',code);
      }else{
        console.error('VAOS_INFISICAL_CRON_DISPATCH_FAILED',infisicalDispatchFailureCode(error));
      }
      throw new Error('VAOS_INFISICAL_WATCHDOG_FAILED');
    });
    const productionObservation=Promise.resolve().then(async()=>{
      // Existing kill switch: absent/OFF skips the observer entirely.
      // Shadow assesses only stored workforce readiness; no jobs or VYNDI.
      if(!['read-only-v1','shadow-v1'].includes(env.VAOS_PRODUCTION_OBSERVER_CONTROL))return;
      const result=await runProductionReadOnlyObservation({
        controlService:getDurableControlService(env),
        executionEngine:env.VAOS_PRODUCTION_OBSERVER_CONTROL==='read-only-v1'
          ?getExecutionEngine(env):undefined,
        mode:()=>env.VAOS_PRODUCTION_OBSERVER_CONTROL,
      });
      console.log('VAOS_PRODUCTION_L5_OBSERVATION',JSON.stringify(result));
      if(result.status==='HOLD')throw new Error('PRODUCTION_OBSERVATION_HOLD');
    }).catch(()=>console.warn('VAOS_PRODUCTION_L5_OBSERVATION_HOLD'));
    const synthetic = Promise.resolve().then(async()=>{
      if(env.ACTIVEPIECES_SYNTHETIC_QUALIFY!=='approved-20261009')return;
      const ns=env.ACTIVEPIECES_HANDSHAKE;
      if(!ns)throw new Error('AP_SYNTHETIC_BINDING_UNAVAILABLE');
      const stub=ns.get(ns.idFromName('vaos-activepieces-v1'));
      const result=await stub.qualifyScheduledOnce();
      // Status is safe for audit; never log OAuth secrets or provider responses.
      console.log('VAOS_ACTIVEPIECES_SYNTHETIC_QUALIFICATION',JSON.stringify({
        status:result.status,phase:result.phase||null,reason:result.reason||null,
        checksumVerified:result.checksumVerified===true,
        markerVerified:result.markerVerified===true,auditOk:result.audit?.ok===true
      }));
    }).catch(()=>{
      console.warn('VAOS_ACTIVEPIECES_SYNTHETIC_QUALIFICATION_UNAVAILABLE');
    });
    const stirling = Promise.resolve().then(async()=>{
      if(env.STIRLING_SYNTHETIC_QUALIFY!=='approved-20261010')return;
      const report=await runStirlingLiveQualification({env});
      // Only bounded machine-readable outcome fields; no API keys, tokens or PDF bytes.
      console.log('VAOS_STIRLING_CLOUD_QUALIFICATION',JSON.stringify({
        status:report.status,reason:report.reason||null,
        auditVerified:report.auditVerified===true,productionActivation:false,
      }));
    }).catch(error=>{
      const code=typeof error?.code==='string'&&/^STIRLING_[A-Z0-9_]+$/.test(error.code)
        ?error.code:'STIRLING_LIVE_UNAVAILABLE';
      console.warn('VAOS_STIRLING_CLOUD_QUALIFICATION_HOLD',code);
    });
    const githubCiAlert = Promise.resolve().then(async()=>{
      if(env.VAOS_GITHUB_SLACK_CONTROL!=='failure-alerts-v1')return;
      const result=await runHourlyCiAlerts(env);
      console.log('VAOS_GITHUB_CI_HOURLY',JSON.stringify(result));
    }).catch(()=>console.warn('VAOS_GITHUB_CI_HOURLY_HOLD'));
    const incidentAlert = Promise.resolve().then(async()=>{
      if(env.VAOS_INCIDENT_SLACK_CONTROL!=='read-only-v1')return;
      const result=await runHourlyIncidentAlerts(env);
      console.log('VAOS_INCIDENT_HOURLY',JSON.stringify(result));
    }).catch(()=>console.warn('VAOS_INCIDENT_HOURLY_HOLD'));
    const googleDigest=Promise.resolve().then(async()=>{
      if(env.VAOS_GOOGLE_BRIEF_CONTROL!=='founder-daily-readonly-v1')return;
      const result=await runFounderWorkspaceDigest(env);
      console.log('VAOS_GOOGLE_DAILY_BRIEF',JSON.stringify(result));
    }).catch(()=>console.warn('VAOS_GOOGLE_DAILY_BRIEF_HOLD'));
    const slackAgent = Promise.resolve().then(async()=>{
      if(env.VAOS_SLACK_AGENT_CONTROL!=='founder-readonly-v1')return;
      const result=await runSlackFounderAgent({env});
      const status={status:result.status,processed:result.processed||0,route:result.route||null,
        reason:null,actionAuthorized:false,checkedAt:new Date().toISOString()};
      try{await env.VAOS_ARTIFACTS?.put('runtime/slack-agent/status.json',JSON.stringify(status),
        {httpMetadata:{contentType:'application/json'}});}catch{}
      console.log('VAOS_SLACK_FOUNDER_AGENT',JSON.stringify(status));
    }).catch(async error=>{
      const reason=typeof error?.message==='string'&&/^SLACK_[A-Z_]+$/.test(error.message)?error.message:'SLACK_AGENT_UNAVAILABLE';
      try{await env.VAOS_ARTIFACTS?.put('runtime/slack-agent/status.json',JSON.stringify({
        status:'HOLD',processed:0,route:null,reason,actionAuthorized:false,checkedAt:new Date().toISOString()
      }),{httpMetadata:{contentType:'application/json'}});}catch{}
      console.warn('VAOS_SLACK_FOUNDER_AGENT_HOLD',reason);
    });
    // Settle both tasks before surfacing a failure; a failed watchdog cannot
    // terminate an otherwise pending mission sweep.
    // Preserve the independently qualified four-provider scheduling contract.
    const scheduledCore = Promise.allSettled([mission,watchdog,synthetic,stirling]).then(results=>{
      if(results.slice(0,2).some(result=>result.status==='rejected'))throw new Error('VAOS_SCHEDULED_TASK_FAILED');
    });
    // Keep the optional, fail-closed observer within waitUntil without changing
    // any existing mission/watchdog/synthetic/Stirling result semantics.
    const task = Promise.allSettled([scheduledCore,productionObservation,slackAgent,githubCiAlert,incidentAlert,googleDigest]).then(results=>{
      if(results[0].status==='rejected')throw new Error('VAOS_SCHEDULED_TASK_FAILED');
    });

    if (ctx?.waitUntil) ctx.waitUntil(task);
    else await task;
  },

  async fetch(request, env, ctx) {
    if (new URL(request.url).pathname === '/api/slack/events') {
      return handleSlackEvent(request, env, ctx);
    }
    if (!env?.ASSETS || typeof env.ASSETS.fetch !== 'function') {
      return jsonError(503, 'ASSET_BINDING_UNAVAILABLE', 'Static asset binding is unavailable');
    }

    return createCloudflareApp({
      apiHandlers: DEFAULT_API_HANDLERS,
      assetFetcher: (assetRequest) => env.ASSETS.fetch(assetRequest),
      runtimeEnv: env,
    }).fetch(request);
  },
};

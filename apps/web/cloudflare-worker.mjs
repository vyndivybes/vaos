import login from './api/login.mjs';
import session from './api/session.mjs';
import logout from './api/logout.mjs';
import controlPlane from './api/control-plane.mjs';
import intents from './api/intents.mjs';
import approvals from './api/approvals.mjs';
import executions from './api/executions.mjs';
import commissioning from './api/commissioning.mjs';
import missions from './api/missions.mjs';
import projectSchedule from './api/project-schedule.mjs';
import windmillRuntimeStatus from './api/windmill-runtime-status.mjs';
import windmillLiveDoQualification from './api/windmill-live-do-qualification.mjs';
import { getEightAgentOperatingService } from './lib/operating-provider.mjs';
import { runScheduledMissionSweep } from '../../platform/execution/mission-scheduler.mjs';
import { invokeCloudflareHandler } from './lib/cloudflare-adapter.mjs';

export const DEFAULT_API_HANDLERS = Object.freeze({
  '/api/login': login,
  '/api/session': session,
  '/api/logout': logout,
  '/api/control-plane': controlPlane,
  '/api/intents': intents,
  '/api/approvals': approvals,
  '/api/executions': executions,
  '/api/commissioning': commissioning,
  '/api/missions': missions,
  '/api/project-schedule': projectSchedule,
  '/api/windmill-runtime-status': windmillRuntimeStatus,
  '/api/windmill-live-do-qualification': windmillLiveDoQualification,
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
  const isWorkspaceHtml = ['/workspace', '/workspace.html', '/mission-status', '/mission-status.html'].includes(path);
  const isExecutableModule = path.endsWith('.mjs') || path.endsWith('.js');
  if (!isWorkspaceHtml && !isExecutableModule) return response;

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
        return invokeCloudflareHandler(handler, request, runtimeEnv);
      }

      const assetResponse = await assetFetcher(request);
      if (assetResponse.status !== 404) return uncachedWorkspaceAsset(path, assetResponse);

      return loginRedirect(request);
    },
  });
}

export default {
  async scheduled(_controller, env, ctx) {
    const task = runScheduledMissionSweep({
      service: getEightAgentOperatingService(env),
      maxMissions: 4,
      maxHandoffs: 4,
    }).then((summary) => {
      console.log('VAOS_SAFE_MISSION_SWEEP', JSON.stringify(summary));
    });
    if (ctx?.waitUntil) {
      ctx.waitUntil(task);
    } else {
      await task;
    }
  },

  async fetch(request, env) {
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

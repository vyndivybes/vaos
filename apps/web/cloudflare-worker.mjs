import login from './api/login.mjs';
import session from './api/session.mjs';
import logout from './api/logout.mjs';
import controlPlane from './api/control-plane.mjs';
import intents from './api/intents.mjs';
import approvals from './api/approvals.mjs';
import executions from './api/executions.mjs';
import { invokeVercelHandler } from './lib/cloudflare-adapter.mjs';

export const DEFAULT_API_HANDLERS = Object.freeze({
  '/api/login': login,
  '/api/session': session,
  '/api/logout': logout,
  '/api/control-plane': controlPlane,
  '/api/intents': intents,
  '/api/approvals': approvals,
  '/api/executions': executions,
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

function isLegacyRoute(pathname) {
  return ['/house', '/range'].some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function createCloudflareApp({
  apiHandlers = DEFAULT_API_HANDLERS,
  assetFetcher,
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
        return invokeVercelHandler(handler, request);
      }

      const assetResponse = await assetFetcher(request);
      if (assetResponse.status !== 404) return assetResponse;

      return loginRedirect(request);
    },
  });
}

export default {
  async fetch(request, env) {
    if (!env?.ASSETS || typeof env.ASSETS.fetch !== 'function') {
      return jsonError(503, 'ASSET_BINDING_UNAVAILABLE', 'Static asset binding is unavailable');
    }

    return createCloudflareApp({
      apiHandlers: DEFAULT_API_HANDLERS,
      assetFetcher: (assetRequest) => env.ASSETS.fetch(assetRequest),
    }).fetch(request);
  },
};

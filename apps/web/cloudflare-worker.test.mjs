import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import cloudflareWorker, { createCloudflareApp } from './cloudflare-worker.mjs';

function assetFetcher(request) {
  const path = new URL(request.url).pathname;
  if (path === '/login' || path === '/workspace' || path === '/mission-status.html') {
    return new Response(`asset:${path}`, {
      status: 200,
      headers: { 'Content-Type': 'text/html', 'Cache-Control': 'public, max-age=3600' },
    });
  }
  if (path === '/workspace.mjs' || path === '/command-router.mjs') {
    return new Response(`asset:${path}`, {
      status: 200,
      headers: { 'Content-Type': 'text/javascript', 'Cache-Control': 'public, max-age=3600' },
    });
  }
  return new Response('not found', { status: 404 });
}

test('Cloudflare app redirects root and retired legacy routes to login', async () => {
  const app = createCloudflareApp({ apiHandlers: {}, assetFetcher });

  for (const path of ['/', '/house', '/house/old', '/range', '/range/old']) {
    const response = await app.fetch(new Request(`https://vaos.example${path}`));
    assert.equal(response.status, 307);
    assert.equal(new URL(response.headers.get('location')).pathname, '/login');
  }
});

test('Cloudflare app dispatches API requests through the compatibility adapter', async () => {
  const app = createCloudflareApp({
    apiHandlers: {
      '/api/ping': (req, res) => res.status(200).json({ ok: true, method: req.method }),
    },
    assetFetcher,
  });

  const response = await app.fetch(new Request('https://vaos.example/api/ping'));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, method: 'GET' });
});

test('Cloudflare app returns structured 404 for unknown API routes', async () => {
  const app = createCloudflareApp({ apiHandlers: {}, assetFetcher });
  const response = await app.fetch(new Request('https://vaos.example/api/missing'));

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    error: {
      code: 'NOT_FOUND',
      message: 'API route not found',
    },
  });
});

test('Cloudflare app serves known assets and fails closed to login for unknown routes', async () => {
  const app = createCloudflareApp({ apiHandlers: {}, assetFetcher });

  const workspace = await app.fetch(new Request('https://vaos.example/workspace'));
  assert.equal(workspace.status, 200);
  assert.equal(await workspace.text(), 'asset:/workspace');

  const unknown = await app.fetch(new Request('https://vaos.example/not-a-route'));
  assert.equal(unknown.status, 307);
  assert.equal(new URL(unknown.headers.get('location')).pathname, '/login');
});


test('Cloudflare app forwards explicit runtime bindings to API handlers', async () => {
  const runtimeEnv = {
    SUPABASE_URL: 'https://project.supabase.co',
    VAOS_DB_RPC_SECRET: 'server-secret',
  };
  const app = createCloudflareApp({
    apiHandlers: {
      '/api/runtime-env': (req, res) => res.status(200).json({
        url: req.env?.SUPABASE_URL || null,
        hasSecret: Boolean(req.env?.VAOS_DB_RPC_SECRET),
      }),
    },
    assetFetcher,
    runtimeEnv,
  });

  const response = await app.fetch(new Request('https://vaos.example/api/runtime-env'));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    url: 'https://project.supabase.co',
    hasSecret: true,
  });
});


test('Cloudflare app disables browser caching for workspace HTML and executable modules', async () => {
  const app = createCloudflareApp({ apiHandlers: {}, assetFetcher });

  for (const path of ['/workspace', '/workspace.mjs', '/command-router.mjs', '/mission-status.html']) {
    const response = await app.fetch(new Request(`https://vaos.example${path}`));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'no-store, max-age=0');
  }
});


test('workspace entrypoints use the current cache-busted module version', async () => {
  const [html, workspace] = await Promise.all([
    readFile(new URL('./workspace.html', import.meta.url), 'utf8'),
    readFile(new URL('./workspace.mjs', import.meta.url), 'utf8'),
  ]);

  assert.match(html, /\/workspace\.mjs\?v=20261012-erp-group/);
  assert.match(workspace, /\.\/command-router\.mjs\?v=20261008-q2-workforce/);
});

test('Wrangler Worker Previews require an isolated, unreachable database URL', async () => {
  const config = JSON.parse(await readFile(new URL('../../wrangler.jsonc', import.meta.url), 'utf8'));
  assert.equal(new URL(config.vars.SUPABASE_URL).hostname.endsWith('.supabase.co'), true);
  assert.ok(config.previews?.vars, 'previews.vars must be declared for wrangler preview');
  const previewUrl = new URL(config.previews.vars.SUPABASE_URL);
  assert.equal(previewUrl.protocol, 'https:');
  assert.equal(previewUrl.hostname, 'vaos-preview.invalid');
  assert.notEqual(config.previews.vars.SUPABASE_URL, config.vars.SUPABASE_URL);
  assert.equal(config.previews.triggers, undefined, 'previews must not schedule production cron triggers');
});


test('missing JS modules return 404 rather than redirecting to the Command Centre',async()=>{
 const app=createCloudflareApp({apiHandlers:{},assetFetcher});
 for(const path of ['/lib/voice-pilot.mjs','/lib/voice-pilot-controller.mjs','/unknown.js']){
  const response=await app.fetch(new Request('https://vaos.example'+path));
  assert.equal(response.status,404,path);
  assert.equal(response.headers.get('location'),null,path);
  assert.match(response.headers.get('content-type')||'',/text\/plain|application\/json/);
 }
});

test('asset ignore publishes browser-only voice dependencies without exposing server lib',async()=>{
 const ignore=await readFile(new URL('./.assetsignore',import.meta.url),'utf8');
 const rules=ignore.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
 const isIgnored=path=>rules.reduce((ignored,rule)=>{
  if(rule==='lib/*'&&path.startsWith('lib/'))return true;
  if(rule.startsWith('!')&&rule.slice(1)===path)return false;
  if(rule===path||rule===path.split('/')[0]+'/')return true;
  return ignored;
 },false);
 for(const p of ['lib/voice-pilot.mjs','lib/voice-pilot-controller.mjs','lib/group-portfolio.mjs','lib/voice-intelligence.mjs','lib/voice-readback.mjs'])assert.equal(isIgnored(p),false,p);
 for(const p of ['lib/auth.mjs','lib/auth-hardening.test.mjs','lib/durable-control-provider.mjs'])assert.equal(isIgnored(p),true,p);
});


test('Slack event ingress fails closed before the public asset router', async () => {
  const response = await cloudflareWorker.fetch(new Request('https://vaos.example/api/slack/events', {
    method: 'POST'
  }), {}, {waitUntil(){}});
  assert.equal(response.status, 503);
  assert.equal((await response.json()).reason, 'SLACK_EVENTS_NOT_COMMISSIONED');
});

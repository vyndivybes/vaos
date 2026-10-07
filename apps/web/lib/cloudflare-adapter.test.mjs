import test from 'node:test';
import assert from 'node:assert/strict';

import { invokeVercelHandler } from './cloudflare-adapter.mjs';

test('Cloudflare adapter maps Request into the existing handler contract', async () => {
  const response = await invokeVercelHandler(
    async (req, res) => {
      return res.status(201).json({
        method: req.method,
        body: req.body,
        idempotencyKey: req.headers['idempotency-key'],
      });
    },
    new Request('https://vaos.example/api/test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'intent-123',
      },
      body: JSON.stringify({ action: 'TEST' }),
    }),
  );

  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), {
    method: 'POST',
    body: { action: 'TEST' },
    idempotencyKey: 'intent-123',
  });
});

test('Cloudflare adapter preserves response headers and status semantics', async () => {
  const response = await invokeVercelHandler(
    (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Set-Cookie', 'vaos_session=abc; Path=/; HttpOnly');
      return res.status(401).json({ authenticated: false });
    },
    new Request('https://vaos.example/api/session'),
  );

  assert.equal(response.status, 401);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(response.headers.get('set-cookie') || '', /vaos_session=abc/);
  assert.deepEqual(await response.json(), { authenticated: false });
});

test('Cloudflare adapter treats malformed JSON as an empty request body', async () => {
  const response = await invokeVercelHandler(
    (req, res) => res.status(200).json({ body: req.body }),
    new Request('https://vaos.example/api/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{invalid-json',
    }),
  );

  assert.deepEqual(await response.json(), { body: {} });
});

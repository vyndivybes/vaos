// Structural guard: authentication in this Worker is performed per handler, not by
// the dispatcher. This test makes "a handler forgot to authenticate" a CI failure
// instead of something a reviewer has to remember.
//
// Every routed /api handler must either
//   (a) verify the founder session (verifySessionToken / SESSION_COOKIE), or
//   (b) appear in EXEMPT below WITH a reason and its alternative authentication.
// Adding a new unauthenticated route therefore requires an explicit, reviewable
// edit to this file.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_API_HANDLERS } from "./cloudflare-worker.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

// route -> how it is protected instead of the founder session cookie
const EXEMPT = {
  "/api/login": { why: "issues sessions; throttled before any hashing", marker: /loginThrottle/ },
  "/api/logout": { why: "clears/revokes the caller's own cookie", marker: /clearSessionCookie/ },
  "/api/control-plane": { why: "authenticates inside getControlPlanePayload and returns 401", marker: /getControlPlanePayload[\s\S]*401/ },
  "/api/windmill-live-do-qualification": { why: "GitHub workflow OIDC bearer", marker: /verifyWindmill\w*Oidc/ },
  "/api/spark-bridge": { why: "device bearer token (digest compare) and browser origins denied", marker: /VAOS_SPARK_BRIDGE_TOKEN/ },
};

const workerSource = fs.readFileSync(path.join(here, "cloudflare-worker.mjs"), "utf8");
const importFiles = new Map(
  [...workerSource.matchAll(/import\s+([A-Za-z0-9_]+)\s+from\s+'(\.\/api\/[^']+)'/g)].map((m) => [m[1], m[2]]),
);
const routeToFile = new Map(
  [...workerSource.matchAll(/^\s+'(\/api\/[^']+)':\s*([A-Za-z0-9_]+),/gm)]
    .map((m) => [m[1], importFiles.get(m[2])]),
);

test("every routed /api handler can be mapped to a source file (guard cannot silently skip)", () => {
  const apiRoutes = Object.keys(DEFAULT_API_HANDLERS).filter((r) => r.startsWith("/api/"));
  assert.ok(apiRoutes.length >= 50, "route table unexpectedly small");
  for (const route of apiRoutes) {
    assert.ok(routeToFile.get(route), `cannot map ${route} to a handler file`);
  }
});

test("every /api handler verifies the session or is explicitly exempt with a stated alternative", () => {
  const offenders = [];
  for (const [route, file] of routeToFile) {
    const source = fs.readFileSync(path.join(here, file), "utf8");
    const usesSession = /verifySessionToken|SESSION_COOKIE/.test(source);
    const exempt = EXEMPT[route];
    if (exempt) {
      assert.ok(exempt.why.length > 10, `${route}: exemption needs a reason`);
      if (!exempt.marker.test(source)) offenders.push(`${route}: exempt but its alternative control (${exempt.why}) is missing`);
    } else if (!usesSession) {
      offenders.push(`${route} (${file}): no session verification and no exemption`);
    }
  }
  assert.deepEqual(offenders, []);
});

test("handlers that verify the session also deny with 401/403 when it fails", () => {
  const offenders = [];
  for (const [route, file] of routeToFile) {
    if (EXEMPT[route]) continue;
    const source = fs.readFileSync(path.join(here, file), "utf8");
    if (!/401|UNAUTHENTICATED|UNAUTHORIZED|403|FORBIDDEN/.test(source)) offenders.push(`${route} (${file})`);
  }
  assert.deepEqual(offenders, []);
});

test("the exemption list contains no stale routes", () => {
  for (const route of Object.keys(EXEMPT)) {
    assert.ok(routeToFile.has(route), `${route} is exempted but no longer routed; remove it`);
  }
});

test("changes to authentication and protected status APIs trigger the controlled-release pipeline", () => {
  const release = fs.readFileSync(path.join(here, "..", "..", ".github", "workflows", "jarvis-controlled-release.yml"), "utf8");
  const criticalPaths = [
    "apps/web/lib/auth.mjs",
    "apps/web/lib/login-throttle.mjs",
    "apps/web/api/login.mjs",
    "apps/web/api/slack-agent-status.mjs",
    "apps/web/api/stirling-qualification.mjs",
    "apps/web/api-auth-coverage.test.mjs",
  ];
  for (const file of criticalPaths) {
    assert.ok(release.includes(`      - '${file}'`), `${file} must trigger a full release-gate run`);
  }
});

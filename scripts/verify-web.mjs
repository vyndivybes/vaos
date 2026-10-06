import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const web = resolve(root, "apps", "web");

const html = readFileSync(resolve(web, "index.html"), "utf8");
const login = readFileSync(resolve(web, "login.html"), "utf8");
const css = readFileSync(resolve(web, "styles.css"), "utf8");
const app = readFileSync(resolve(web, "app.mjs"), "utf8");
const workspace = readFileSync(resolve(web, "workspace.html"), "utf8");
const workspaceCss = readFileSync(resolve(web, "workspace.css"), "utf8");
const workspaceApp = readFileSync(resolve(web, "workspace.mjs"), "utf8");
const rlsMigration = readFileSync(resolve(root, "supabase", "migrations", "20261006223142_enable_legacy_control_plane_rls.sql"), "utf8");

assert.match(html, /vayu-shastr-original\.webp/);
assert.match(html, /id="login-form"/);
assert.match(app, /\/api\/login/);
assert.match(app, /\/api\/session/);
assert.match(css, /prefers-reduced-motion/);

assert.match(workspace, /Agent Control Centre/);
assert.match(workspace, /id="domain-workspace"/);
assert.match(workspace, /id="domain-record-list"/);
assert.match(workspace, /id="domain-thread-dialog"/);
assert.match(workspace, /id="domain-thread-timeline"/);
assert.match(workspace, /workspace\.css/);
assert.match(workspaceApp, /\/api\/control-plane/);
assert.match(workspaceApp, /\/api\/approvals/);
assert.match(workspaceApp, /renderDomainWorkspace/);
assert.match(workspaceApp, /openDomainThread/);
assert.match(workspaceApp, /data-domain-record-id/);
const executionsApi = readFileSync(resolve(web, "api", "executions.mjs"), "utf8");
assert.match(executionsApi, /getExecutionEngine/);
assert.match(workspaceCss, /max-width: 900px/);

assert.match(workspace, /class="control-header"/);
assert.match(workspace, /class="workspace-license"/);
assert.match(workspace, /© 2026 Vāyū Shastr Pvt\. Ltd\. All Rights Reserved\./);
assert.match(workspace, /Official licensed interface of Vāyū Shastr Pvt\. Ltd\./);
assert.match(workspace, /Designed & Developed by S\. Shyam Sundhar/);
assert.match(login, /© 2026 Vāyū Shastr Pvt\. Ltd\. All Rights Reserved\./);
assert.match(css, /--vayu-gold-metallic/);
assert.match(css, /--vayu-graphite-0/);
assert.match(workspaceCss, /landscape-workspace/);
assert.match(workspaceCss, /metallic-gold-rim/);
assert.match(workspaceCss, /domain-record-table/);
assert.match(workspaceCss, /digital-thread-dialog/);
assert.match(workspaceCss, /digital-thread-timeline/);

for (const table of ["server_credentials","intents","approvals","events"]) {
  assert.match(rlsMigration, new RegExp(`alter table vaos_private\\.${table} enable row level security;`, "i"));
}
assert.doesNotMatch(rlsMigration, /create\s+policy/i);

assert.equal(existsSync(resolve(web, "house")), false);
assert.equal(existsSync(resolve(web, "range")), false);

console.log("VAOS web verification passed.");

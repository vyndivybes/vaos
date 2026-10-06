import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const web = resolve(root, "apps", "web");

const html = readFileSync(resolve(web, "index.html"), "utf8");
const css = readFileSync(resolve(web, "styles.css"), "utf8");
const app = readFileSync(resolve(web, "app.mjs"), "utf8");
const workspace = readFileSync(resolve(web, "workspace.html"), "utf8");
const workspaceCss = readFileSync(resolve(web, "workspace.css"), "utf8");
const workspaceApp = readFileSync(resolve(web, "workspace.mjs"), "utf8");

assert.match(html, /vayu-shastr-original\.webp/);
assert.match(html, /id="login-form"/);
assert.match(app, /\/api\/login/);
assert.match(app, /\/api\/session/);
assert.match(css, /prefers-reduced-motion/);
assert.match(workspace, /Agent Control Centre/);
assert.match(workspace, /workspace\.css/);
assert.match(workspaceApp, /\/api\/control-plane/);
assert.match(workspaceApp, /\/api\/approvals/);
assert.match(workspaceCss, /max-width: 900px/);
assert.equal(existsSync(resolve(web, "house")), false);
assert.equal(existsSync(resolve(web, "range")), false);

console.log("VAOS web verification passed.");

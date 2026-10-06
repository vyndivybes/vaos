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

assert.match(html, /vayu-shastr-original\.webp/);
assert.match(html, /id="login-form"/);
assert.match(app, /\/api\/login/);
assert.match(app, /\/api\/session/);
assert.match(css, /prefers-reduced-motion/);
assert.equal(existsSync(resolve(web, "house")), false);
assert.equal(existsSync(resolve(web, "range")), false);

console.log("VAOS web verification passed.");

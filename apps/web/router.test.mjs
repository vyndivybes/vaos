import test from "node:test";
import assert from "node:assert/strict";

import { resolveRoute } from "./router.mjs";

test("root resolves to the login entry point", () => {
  assert.deepEqual(resolveRoute("/"), {
    name: "login",
    redirect: "/login",
    reason: "root-entry",
  });
});

test("login remains the canonical public route", () => {
  assert.deepEqual(resolveRoute("/login"), {
    name: "login",
    redirect: null,
    reason: null,
  });
});

test("legacy House routes are retired", () => {
  assert.equal(resolveRoute("/house").redirect, "/login");
  assert.equal(resolveRoute("/house/legacy").reason, "legacy-route-retired");
});

test("legacy Range routes are retired", () => {
  assert.equal(resolveRoute("/range").redirect, "/login");
  assert.equal(resolveRoute("/range/archive").reason, "legacy-route-retired");
});

test("unknown routes fail closed to login", () => {
  assert.deepEqual(resolveRoute("/anything-else"), {
    name: "login",
    redirect: "/login",
    reason: "unknown-route",
  });
});

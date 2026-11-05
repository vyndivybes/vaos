#!/usr/bin/env node
// Create a salted PBKDF2-SHA256 password hash for VAOS_DEV_LOGIN_PASSWORD_SHA256 /
// VAOS_DEV_CHECKER_PASSWORD_SHA256.
//
//   node scripts/auth/hash-password.mjs            (interactive, hidden input)
//   printf '%s' "$PW" | node scripts/auth/hash-password.mjs   (non-interactive)
//
// The password is never accepted as a command-line argument (shell history).
// Store the printed value as a Cloudflare secret, e.g.:
//   npx wrangler secret put VAOS_DEV_LOGIN_PASSWORD_SHA256
// Use a DIFFERENT password for the checker identity.
import { hashPassword } from "../../apps/web/lib/auth.mjs";

const MIN_LENGTH = 14;

function readHidden(prompt) {
  return new Promise((resolve) => {
    process.stderr.write(prompt);
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n" || ch === "\u0004") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stderr.write("\n");
          return resolve(value);
        }
        if (ch === "\u0003") { process.stderr.write("\n"); process.exit(130); }
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

async function readAll() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
}

let password;
if (process.stdin.isTTY) {
  password = await readHidden("Password (hidden): ");
  const again = await readHidden("Repeat password: ");
  if (password !== again) { console.error("Passwords do not match."); process.exit(1); }
} else {
  password = await readAll();
}
if (password.length < MIN_LENGTH) {
  console.error(`Refusing: password must be at least ${MIN_LENGTH} characters.`);
  process.exit(1);
}
process.stdout.write(hashPassword(password) + "\n");

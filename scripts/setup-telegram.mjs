#!/usr/bin/env node
// Point Telegram at the deployed Worker and register the command menu.
// Run once after the first deploy, and again if the URL or commands change.
//
//   node scripts/setup-telegram.mjs --url https://gatishva-bot.<subdomain>.workers.dev/tg
//   node scripts/setup-telegram.mjs --info
//   node scripts/setup-telegram.mjs --delete
//
// TELEGRAM_BOT_TOKEN is taken from the environment, or from .dev.vars.
// TG_WEBHOOK_SECRET is taken from the environment ONLY — see below.
//
// Adding an update type no longer needs this script: the Worker re-subscribes
// itself on the first update after a deploy (src/webhook-config.ts).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { BOT_COMMANDS } from "../src/commands.ts";
import { ALLOWED_UPDATES } from "../src/telegram.ts";

const here = dirname(fileURLToPath(import.meta.url));

function loadDevVars() {
  try {
    const text = readFileSync(join(here, "..", ".dev.vars"), "utf8");
    const out = {};
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i > 0) out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
    }
    return out;
  } catch {
    return {};
  }
}

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? null : (process.argv[i + 1] ?? true);
}

const devVars = loadDevVars();
const token = process.env.TELEGRAM_BOT_TOKEN || devVars.TELEGRAM_BOT_TOKEN;
// Never from .dev.vars: that file holds the dev secret, and registering it on the
// production webhook makes the Worker reject every update Telegram sends. The
// secret passed here must be the one set with `wrangler secret put`.
const secret = process.env.TG_WEBHOOK_SECRET;

if (!token) {
  console.error("No bot token: set TELEGRAM_BOT_TOKEN or put it in .dev.vars");
  process.exit(1);
}

async function api(method, payload) {
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload ?? {}),
  });
  const data = await r.json();
  if (!data.ok) throw new Error(`${method}: ${data.description}`);
  return data.result;
}

const show = async () => console.log("webhook:", await api("getWebhookInfo"));

if (arg("info")) {
  await show();
  process.exit(0);
}

if (arg("delete")) {
  await api("deleteWebhook");
  console.log("webhook removed");
  await show();
  process.exit(0);
}

if (arg("commands")) {
  await api("setMyCommands", { commands: BOT_COMMANDS });
  console.log(`commands registered: ${BOT_COMMANDS.map((c) => "/" + c.command).join(" ")}`);
  process.exit(0);
}

const url = arg("url");
if (!url || url === true) {
  console.error("Usage: node scripts/setup-telegram.mjs --url https://<worker>/tg");
  process.exit(1);
}
if (!secret) {
  console.error(
    "No TG_WEBHOOK_SECRET in the environment. Pass the same value the Worker has " +
      "(wrangler secret put TG_WEBHOOK_SECRET) — a mismatch makes it reject every update.",
  );
  process.exit(1);
}

await api("setWebhook", {
  url,
  secret_token: secret,
  // Everything else (edits, polls, my_chat_member...) would just be dropped.
  allowed_updates: ALLOWED_UPDATES,
  // Whatever queued up while there was no webhook is stale by now; replaying it
  // would answer button presses from hours ago.
  drop_pending_updates: true,
});
console.log(`webhook set to ${url}`);

await api("setMyCommands", { commands: BOT_COMMANDS });
console.log(`commands registered: ${BOT_COMMANDS.map((c) => "/" + c.command).join(" ")}`);

await show();

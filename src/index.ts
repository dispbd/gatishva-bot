// Gatishva — outages of water, power and gas in Georgia, sent to Telegram by
// street. A Cloudflare Worker with two doors into the Hub Durable Object:
//   fetch()     — the Telegram webhook (and /health).
//   scheduled() — a watchdog that re-arms the Hub's alarm, which is the real
//                 poll loop (see src/hub-do.ts).
import { handleUpdate } from "./bot.ts";
import { hub } from "./hub-do.ts";
import { syncWebhook } from "./webhook-config.ts";
import type { TgUpdate } from "./telegram.ts";

export { Hub } from "./hub-do.ts";
export { GwpRelay } from "./gwp-relay-do.ts";

export default {
  async scheduled(_controller, env, _ctx) {
    await hub(env).ensureAlarm();
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      // Touching the Hub here arms the loop on the very first deploy, before
      // the first cron tick.
      await hub(env).ensureAlarm();
      return new Response("ok\n", { headers: { "content-type": "text/plain" } });
    }
    if (url.pathname === "/tg" && request.method === "POST") {
      return await webhook(request, env, ctx);
    }
    return new Response("not found\n", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

/** Telegram webhook. The URL is public, so the shared secret is the gate. */
async function webhook(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const secret = request.headers.get("x-telegram-bot-api-secret-token");
  if (!env.TG_WEBHOOK_SECRET || secret !== env.TG_WEBHOOK_SECRET) {
    return new Response("forbidden\n", { status: 403 });
  }
  ctx.waitUntil(syncWebhook(env, request));

  let update: TgUpdate;
  try {
    update = (await request.json()) as TgUpdate;
  } catch {
    return new Response("bad request\n", { status: 400 });
  }
  try {
    await handleUpdate(env, update);
  } catch (e) {
    // Swallow: a non-2xx makes Telegram redeliver the same update for hours.
    console.error(`update handling failed: ${e instanceof Error ? (e.stack ?? e.message) : e}`);
  }
  return new Response("ok\n");
}

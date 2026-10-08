// Keeping Telegram's webhook subscription in step with the code.
//
// Which update types Telegram sends is set by setWebhook, not by anything that
// ships with a deploy. So adding a handler — channel posts, say — does nothing
// until someone re-registers the webhook, and the obvious way to do that is a
// trap: scripts/setup-telegram.mjs takes the secret from .dev.vars, which holds the
// *dev* secret. The production secret lives only in Cloudflare. Re-registering from
// a laptop would install the wrong secret, and the Worker would then turn away every
// update Telegram sends.
//
// The Worker is the one place that holds both halves for certain: the secret it
// just checked, and the URL Telegram just called. So it corrects the subscription
// itself, from inside a request Telegram is known to have made.
import { tg, describe, ALLOWED_UPDATES } from "./telegram.ts";

interface WebhookInfo {
  url?: string;
  allowed_updates?: string[];
}

/**
 * Whether to re-register, given what Telegram reports.
 *
 * Only ever for the URL Telegram is already calling. A request that reached this
 * Worker by some other address — a local `wrangler dev`, above all — must never
 * repoint the live webhook at itself, and its secret is not the live one either.
 */
export function needsResubscribe(info: WebhookInfo, requestUrl: string, wanted: string[]): boolean {
  if (!info.url || info.url !== requestUrl) return false;
  // Telegram omits the field when it was never set, which means "the default".
  const have = info.allowed_updates;
  if (!have) return true;
  return have.length !== wanted.length || wanted.some((u) => !have.includes(u));
}

/** Once per isolate is plenty: the answer only changes with a deploy. */
let checked = false;

export async function syncWebhook(env: Env, request: Request): Promise<void> {
  if (checked) return;
  try {
    const url = new URL(request.url);
    const requestUrl = `${url.origin}${url.pathname}`;
    const info = await tg<WebhookInfo>(env, "getWebhookInfo", {});

    if (needsResubscribe(info, requestUrl, ALLOWED_UPDATES)) {
      await tg(env, "setWebhook", {
        url: requestUrl,
        // The secret this very request was admitted with, so nothing changes for
        // updates already on their way.
        secret_token: env.TG_WEBHOOK_SECRET,
        allowed_updates: ALLOWED_UPDATES,
      });
      console.log(
        `webhook now subscribed to ${ALLOWED_UPDATES.join(", ")} ` +
          `(was ${info.allowed_updates?.join(", ") ?? "the default"})`,
      );
    }
    checked = true;
  } catch (e) {
    // Left unchecked, so the next update tries again.
    console.warn(`webhook subscription check failed: ${describe(e)}`);
  }
}

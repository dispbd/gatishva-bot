// A Messenger bot on the Facebook Page — prepared, switched off until the Page
// and its Meta app exist.
//
// Meta lets a bot message a person only within 24 hours of that person's last
// message, so Messenger cannot carry subscriptions: an outage tomorrow could
// not be pushed. What it can do is answer. Someone writes a street — "Жвания",
// "Batumi, Rustaveli" — and gets what is off there right now, in the language
// they wrote in, with a pointer to the Telegram bot for alerts. A reply within
// the window is free.
//
// Off while FB_PAGE_TOKEN, FB_APP_SECRET or FB_VERIFY_TOKEN is missing; the
// webhook then answers 404. See docs/messenger.md.
import type { Lang } from "./i18n.ts";

export interface MessengerConfig {
  token: string;
  appSecret: string;
  verifyToken: string;
  graph: string;
}

export function messengerConfig(env: {
  FB_PAGE_TOKEN?: string;
  FB_APP_SECRET?: string;
  FB_VERIFY_TOKEN?: string;
  FB_GRAPH_VERSION?: string;
}): MessengerConfig | undefined {
  if (!env.FB_PAGE_TOKEN || !env.FB_APP_SECRET || !env.FB_VERIFY_TOKEN) return undefined;
  return {
    token: env.FB_PAGE_TOKEN,
    appSecret: env.FB_APP_SECRET,
    verifyToken: env.FB_VERIFY_TOKEN,
    graph: `https://graph.facebook.com/${env.FB_GRAPH_VERSION || "v23.0"}`,
  };
}

/**
 * Meta's subscription handshake: it calls the webhook with hub.mode=subscribe,
 * the verify token the app was given, and a challenge to echo back.
 */
export function verifyHandshake(url: URL, cfg: MessengerConfig): string | undefined {
  const ok =
    url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === cfg.verifyToken;
  return ok ? (url.searchParams.get("hub.challenge") ?? undefined) : undefined;
}

/**
 * Whether a webhook body really comes from Meta: its X-Hub-Signature-256 is
 * the body's HMAC-SHA256 under the app secret. Compared in constant time.
 */
export async function signatureValid(body: string, header: string | null, appSecret: string): Promise<boolean> {
  if (!header?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  const expected = [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
  const given = header.slice("sha256=".length).toLowerCase();
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export interface Incoming {
  /** The person's page-scoped id: who to answer. */
  psid: string;
  text: string;
}

interface WebhookBody {
  object?: string;
  entry?: { messaging?: { sender?: { id?: string }; message?: { text?: string; is_echo?: boolean }; postback?: { payload?: string; title?: string } }[] }[];
}

/** The text messages in a webhook call; the Page's own echoes are left out. */
export function incoming(body: WebhookBody): Incoming[] {
  if (body.object !== "page") return [];
  const out: Incoming[] = [];
  for (const entry of body.entry ?? []) {
    for (const m of entry.messaging ?? []) {
      const psid = m.sender?.id;
      if (!psid || m.message?.is_echo) continue;
      // "Get started" arrives as a postback; it reads as a request for help.
      const text = m.message?.text ?? (m.postback ? "/start" : undefined);
      if (text) out.push({ psid, text: text.trim() });
    }
  }
  return out;
}

/** The language to answer in, from the script the person wrote in. */
export function langOfText(text: string): Lang {
  if (/[ა-ჿ]/.test(text)) return "ka";
  if (/[а-яё]/i.test(text)) return "ru";
  return "en";
}

/** Messenger takes at most 2,000 characters per message. */
export const MESSENGER_LIMIT = 2000;

export function clip(text: string): string {
  return text.length <= MESSENGER_LIMIT ? text : `${text.slice(0, MESSENGER_LIMIT - 1)}…`;
}

/** An answer within the 24-hour window: messaging_type RESPONSE, free. */
export async function reply(cfg: MessengerConfig, psid: string, text: string): Promise<void> {
  const r = await fetch(`${cfg.graph}/me/messages?access_token=${encodeURIComponent(cfg.token)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ recipient: { id: psid }, messaging_type: "RESPONSE", message: { text: clip(text) } }),
  });
  if (!r.ok) {
    const data = (await r.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(`Messenger send failed: ${data.error?.message ?? r.status}`);
  }
}

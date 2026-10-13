// A Facebook Page that posts outages — prepared, switched off until the Page
// exists.
//
// Most people in Georgia are on Facebook, not Telegram, and Meta allows a bot
// to message a person first only within 24 hours of that person's last
// message: a Messenger bot cannot push outage alerts. A Page can post, free,
// to everyone who follows it. So the Page is the way in, and it is treated as
// one more chat — a pseudo-chat (FACEBOOK_CHAT) subscribed to whole cities —
// so it gets exactly what a Telegram chat would: new outages, edits when they
// change, a comment when they are over. Residents' unconfirmed signals stay
// off it: a public page is no place for rumours.
//
// It stays off while FB_PAGE_ID or FB_PAGE_TOKEN is missing. See
// docs/facebook.md for setting it up.
import { isLang } from "./i18n.ts";
import type { Lang } from "./i18n.ts";
import { decodeEntities } from "./sources/common.ts";

/**
 * The Page's chat id. Telegram's ids are positive for people and negative for
 * groups and channels; 0 is nobody's.
 */
export const FACEBOOK_CHAT = 0;

export interface FacebookConfig {
  pageId: string;
  token: string;
  /** Georgian city names the Page follows whole. */
  cities: string[];
  lang: Lang;
  graph: string;
}

/** The Page's settings, or undefined while it is not set up. */
export function facebookConfig(env: {
  FB_PAGE_ID?: string;
  FB_PAGE_TOKEN?: string;
  FB_PAGE_CITIES?: string;
  FB_PAGE_LANG?: string;
  FB_GRAPH_VERSION?: string;
}): FacebookConfig | undefined {
  if (!env.FB_PAGE_ID || !env.FB_PAGE_TOKEN) return undefined;
  const cities = (env.FB_PAGE_CITIES || "თბილისი").split(",").map((c) => c.trim()).filter(Boolean);
  return {
    pageId: env.FB_PAGE_ID,
    token: env.FB_PAGE_TOKEN,
    cities,
    // Georgian: the Page's readers are the people of Georgia at large.
    lang: isLang(env.FB_PAGE_LANG) ? env.FB_PAGE_LANG : "ka",
    graph: `https://graph.facebook.com/${env.FB_GRAPH_VERSION || "v23.0"}`,
  };
}

/**
 * A Telegram message as Facebook text: Facebook posts take no markup, so tags
 * go, entities are decoded, and each collapsed quote becomes a paragraph.
 */
export function toPlain(html: string): string {
  return decodeEntities(
    html
      .replace(/<blockquote[^>]*>/g, "\n")
      .replace(/<\/blockquote>/g, "\n")
      .replace(/<a href="([^"]*)">([^<]*)<\/a>/g, "$2: $1")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

interface GraphError {
  error?: { message?: string; code?: number };
}

async function graph<T>(cfg: FacebookConfig, path: string, params: Record<string, string>): Promise<T> {
  const r = await fetch(`${cfg.graph}/${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...params, access_token: cfg.token }),
  });
  const data = (await r.json()) as T & GraphError;
  if (!r.ok || data.error) throw new Error(`Facebook ${path} failed: ${data.error?.message ?? r.status}`);
  return data;
}

/** A new post; returns its id, which edits and the closing comment need. */
export async function publishPost(cfg: FacebookConfig, text: string): Promise<string> {
  return (await graph<{ id: string }>(cfg, `${cfg.pageId}/feed`, { message: text })).id;
}

export async function editPost(cfg: FacebookConfig, postId: string, text: string): Promise<void> {
  await graph(cfg, postId, { message: text });
}

/** "It's over", as a comment under the post, like the reply in Telegram. */
export async function commentOnPost(cfg: FacebookConfig, postId: string, text: string): Promise<void> {
  await graph(cfg, `${postId}/comments`, { message: text });
}

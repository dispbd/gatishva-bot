// Tbilisi Energy — gas in Tbilisi.
//
// The only provider here without a data API: notices are blog posts on te.ge,
// a handful a month. Each page carries links to the latest posts, whose ids
// only grow, so one listing page plus the few newest articles is a full poll.
// The CDN in front answers 403 without a browser User-Agent.
import { fetchText, htmlToText, squash, decodeEntities, districtOf, looksEmergency, preamble, TBILISI } from "./common.ts";
import { kaDateTimes, kaMonth, tbilisiEpoch } from "../time.ts";
import type { Outage, SourceDef } from "../types.ts";

const LIST = "https://te.ge/ka/117/blog/emergency-shutdown.html";
/** How many of the newest posts to read each time. */
const NEWEST = 3;

/** Post ids linked from a te.ge page, newest first. */
export function teLinks(html: string): { id: number; url: string }[] {
  const seen = new Map<number, string>();
  for (const m of html.matchAll(/href="(https:\/\/te\.ge\/ka\/(\d+)\/blog\/[^"]+)"/g)) {
    const id = +m[2]!;
    if (id !== 117) seen.set(id, decodeEntities(m[1]!));
  }
  return [...seen].map(([id, url]) => ({ id, url })).sort((a, b) => b.id - a.id);
}

export function parseTeArticle(id: number, url: string, html: string): Outage | undefined {
  const body = /id="agwera"[^>]*>([\s\S]*?)<div class="col-lg-4"/.exec(html)?.[1];
  if (!body) return undefined;
  const title = squash(htmlToText(/<h3[^>]*>([\s\S]*?)<\/h3>/.exec(body)?.[1] ?? ""));
  // "28 სექტემბერი 2026" under the title.
  const date = /icofont-calendar[^>]*><\/i>\s*(\d{1,2})\s+([ა-ჿ]+)\s+(\d{4})/.exec(body);
  const month = date ? kaMonth(date[2]!) : undefined;
  const publishedAt = date && month ? tbilisiEpoch(+date[3]!, month, +date[1]!) : undefined;
  const text = squash(htmlToText(body.replace(/<h3[\s\S]*?<\/ul>/, "")));
  const times = publishedAt ? kaDateTimes(text, publishedAt) : [];
  return {
    key: `te:${id}`,
    source: "te",
    provider: "Tbilisi Energy",
    utility: "gas",
    city: TBILISI,
    district: districtOf(`${title} ${text}`),
    emergency: looksEmergency(`${title} ${preamble(text)}`) && !/სარეკონსტრუქციო|სარეაბილიტაციო|დაგეგმ/.test(title),
    start: times[0],
    end: times[1],
    publishedAt,
    title,
    text: `${title}. ${text}`,
    addresses: [],
    url,
  };
}

/** The raw payload is the newest articles, bundled: [{id, url, html}]. */
export function parseTe(raw: string): Outage[] {
  const posts = JSON.parse(raw) as { id: number; url: string; html: string }[];
  return posts.flatMap((p) => parseTeArticle(p.id, p.url, p.html) ?? []);
}

export const te: SourceDef = {
  name: "te",
  everySec: 600,
  live: () => false,
  fetchRaw: async () => {
    const list = await fetchText(LIST);
    const newest = teLinks(list).slice(0, NEWEST);
    if (newest.length === 0) throw new Error("te.ge: no post links on the listing page");
    const posts = await Promise.all(
      // Each page carries a view counter, which would make every answer look new.
      newest.map(async (p) => ({ ...p, html: (await fetchText(p.url)).replace(/icofont-eye"><\/i>\s*\d+/g, "") })),
    );
    return JSON.stringify(posts);
  },
  parse: parseTe,
};

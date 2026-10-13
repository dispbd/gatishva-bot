// GWP — water in Tbilisi.
//
// gwp.ge is an Angular app over a plain JSON API, the same one its outage pages
// read: GET /api/Disconnect lists what is happening *now* (an item disappears
// once water is back), /api/Disconnect/ListPlanAsync the planned works. No key,
// no paging, ~4 KB, answers in under 100 ms.
//
// The structured fields are thin — dateFrom/dateTo/createdOn come back as
// 0001-01-01 — so times are read out of `emailText`, which carries them as
// "10/7/2026 23:15 დან 10/8/2026 11:00 საათამდე". Usually month first — but not
// always: the notices are typed by people, and "8/10/2026 20:00" written on
// 8 October means the 8th of October. See gwpDate().
import { fetchText, squash, TBILISI } from "./common.ts";
import { splitAddresses } from "../georgian.ts";
import { tbilisiEpoch } from "../time.ts";
import type { Outage, SourceDef, SourceEnv, GwpPath } from "../types.ts";

interface GwpItem {
  district?: string;
  status?: string;
  type?: string;
  code?: string;
  address?: string;
  emailText?: string;
  smsText?: string | null;
}

const PAGE = "https://www.gwp.ge/ka/gadaudebeli";

export function parseGwp(raw: string, prefix: string, now: number): Outage[] {
  const items = JSON.parse(raw) as GwpItem[];
  if (!Array.isArray(items)) throw new Error("GWP: not a list");
  return items
    .filter((i) => i.code && (i.emailText || i.smsText))
    .map((i) => {
      const text = squash(i.emailText || i.smsText || "");
      const { start, end } = gwpTimes(text, now);
      return {
        key: `${prefix}:${i.code}`,
        source: prefix,
        provider: "GWP",
        utility: "water",
        city: TBILISI,
        district: i.district || undefined,
        emergency: /არაგეგმ/.test(i.type ?? ""),
        start,
        end,
        title: i.address ? squash(i.address) : undefined,
        text,
        addresses: gwpAddresses(text),
        url: PAGE,
      } satisfies Outage;
    });
}

/** Both ends of the window. A date followed by "დან" is "from", one followed by "მდე" is "until". */
export function gwpTimes(text: string, now: number): { start?: number; end?: number } {
  let start: number | undefined;
  let end: number | undefined;
  const re = /(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(\S*)/g;
  for (const m of text.matchAll(re)) {
    const t = gwpDate(+m[1]!, +m[2]!, +m[3]!, +m[4]!, +m[5]!, now);
    if (/მდე/.test(m[6] ?? "")) end = t;
    else if (start === undefined) start = t;
    else end ??= t;
  }
  return { start, end };
}

/**
 * "a/b/yyyy hh:mm", read whichever way lands nearer to now. GWP mostly writes
 * month first, but a notice of 8 October said "8/10/2026" and the bot showed
 * "10.08". An outage notice is about today, give or take a day or two, while
 * the wrong reading of an ambiguous date is weeks or months away — so the
 * nearer reading is the right one. When only one reading is a real date
 * ("13/10"), that one wins.
 */
export function gwpDate(a: number, b: number, y: number, h: number, mi: number, now: number): number {
  const readings = [
    a <= 12 ? tbilisiEpoch(y, a, b, h, mi) : undefined, // month first
    b <= 12 ? tbilisiEpoch(y, b, a, h, mi) : undefined, // day first
  ].filter((t): t is number => t !== undefined);
  if (readings.length === 0) return tbilisiEpoch(y, a, b, h, mi);
  return readings.reduce((best, t) => (Math.abs(t - now) < Math.abs(best - now) ? t : best));
}

/** The list after the last colon: "...წყალმომარაგება შეუწყდება: A, B და C". */
export function gwpAddresses(text: string): string[] {
  // Times have colons too; the list follows the last one that is not a time.
  const m = /:(?!\d{2})([^:]*)$/.exec(text);
  if (!m) return [];
  return splitAddresses(m[1]!.replace(/\s*(ქუჩებს|ქუჩას)\s*$/, ""));
}

/**
 * GWP answers only from Georgia and from Madrid (see src/gwp-relay-do.ts), so on
 * Cloudflare it is read through a relay the Hub provides. Without one — `npm run
 * probe` on a laptop in Georgia — the request goes direct.
 */
export function fetchGwp(path: GwpPath, env: SourceEnv): Promise<string> {
  return env.gwp ? env.gwp(path) : fetchText(`https://www.gwp.ge/api/${path}`);
}

export const gwp: SourceDef = {
  name: "gwp",
  everySec: 60,
  live: () => true,
  fetchRaw: (env) => fetchGwp("Disconnect", env),
  parse: (raw, now) => parseGwp(raw, "gwp", now),
};

export const gwpPlanned: SourceDef = {
  name: "gwp-plan",
  everySec: 300,
  live: () => false,
  fetchRaw: (env) => fetchGwp("Disconnect/ListPlanAsync", env),
  parse: (raw, now) => parseGwp(raw, "gwp-plan", now),
};

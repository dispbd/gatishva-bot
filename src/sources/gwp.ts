// GWP — water in Tbilisi.
//
// gwp.ge is an Angular app over a plain JSON API, the same one its outage pages
// read: GET /api/Disconnect lists what is happening *now* (an item disappears
// once water is back), /api/Disconnect/ListPlanAsync the planned works. No key,
// no paging, ~4 KB, answers in under 100 ms.
//
// The structured fields are thin — dateFrom/dateTo/createdOn come back as
// 0001-01-01 — so times are read out of `emailText`, which carries them as
// "10/7/2026 23:15 დან 10/8/2026 11:00 საათამდე": month first.
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

export function parseGwp(raw: string, prefix: string): Outage[] {
  const items = JSON.parse(raw) as GwpItem[];
  if (!Array.isArray(items)) throw new Error("GWP: not a list");
  return items
    .filter((i) => i.code && (i.emailText || i.smsText))
    .map((i) => {
      const text = squash(i.emailText || i.smsText || "");
      const { start, end } = gwpTimes(text);
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
export function gwpTimes(text: string): { start?: number; end?: number } {
  let start: number | undefined;
  let end: number | undefined;
  const re = /(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(\S*)/g;
  for (const m of text.matchAll(re)) {
    const t = tbilisiEpoch(+m[3]!, +m[1]!, +m[2]!, +m[4]!, +m[5]!);
    if (/მდე/.test(m[6] ?? "")) end = t;
    else if (start === undefined) start = t;
    else end ??= t;
  }
  return { start, end };
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
  parse: (raw) => parseGwp(raw, "gwp"),
};

export const gwpPlanned: SourceDef = {
  name: "gwp-plan",
  everySec: 300,
  live: () => false,
  fetchRaw: (env) => fetchGwp("Disconnect/ListPlanAsync", env),
  parse: (raw) => parseGwp(raw, "gwp-plan"),
};

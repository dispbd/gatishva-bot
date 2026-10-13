// The Roads Department — restrictions on Georgia's roads.
//
// georoad.gov.ge/ka/restriction is a Next.js page whose data arrives inside
// the page itself, as the React Server Components stream: `self.__next_f.push`
// chunks that together hold a `parsedData` array. Each item is one notice, in
// Georgian only: a closure or restriction (`restriction_status` "1") or traffic
// restored (`"2"`). A restoration is a notice of its own, not an edit of the
// closure it ends, so each one is announced as it comes.
//
// The fetch keeps only the items, so that a new deploy of their site — new
// script names, a new build id — does not look like new restrictions.
import { fetchText, htmlToText, squash } from "./common.ts";
import { parseLocal } from "../time.ts";
import { toNominative } from "../georgian.ts";
import type { Outage, SourceDef } from "../types.ts";

const PAGE = "https://georoad.gov.ge/ka/restriction";

/** The pseudo-city every road notice belongs to; road subscriptions use it too. */
export const ROADS_CITY = "საქართველო";

interface RoadItem {
  id: number;
  publish_date?: string;
  restriction_status?: string;
  translates?: { language: string; title?: string; content?: string }[];
}

/** The `parsedData` array out of a Next.js page's server-components stream. */
export function roadItemsFromPage(html: string): RoadItem[] {
  const payload = [...html.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g)]
    .map((m) => JSON.parse(`"${m[1]}"`) as string)
    .join("");
  const at = payload.indexOf('"parsedData":[');
  if (at === -1) throw new Error("georoad: no parsedData on the page");
  const start = payload.indexOf("[", at);
  // Walk to the matching bracket, stepping over strings: the notices' HTML is
  // full of brackets of its own.
  let depth = 0;
  let inString = false;
  for (let i = start; i < payload.length; i++) {
    const c = payload[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "[") depth++;
    else if (c === "]" && --depth === 0) return JSON.parse(payload.slice(start, i + 1)) as RoadItem[];
  }
  throw new Error("georoad: parsedData never closes");
}

/**
 * The road and the section a title names, e.g. "ვაზიანი-გომბორი-თელავის გზის
 * 26-ე კმ-ზე ..." → "ვაზიანი-გომბორი-თელავი, 26 კმ". The road is named in the
 * genitive, so its last part is put back into the nominative.
 */
export function roadPlace(title: string): string | undefined {
  const road = /^(.+?)\s+(?:საავტომობილო\s+)?(?:გზის|მონაკვეთზე|მონაკვეთის)/.exec(title)?.[1];
  if (!road) return undefined;
  const parts = road.split("-");
  parts[parts.length - 1] = toNominative(parts[parts.length - 1]!);
  // "კმ22-კმ72" and "მე-11 კმ" both become plain numbers and "კმ", which then
  // translates like any other word: "22–72 км", "11 km".
  const range = /კმ\s?(\d+)\s?[-–]\s?კმ\s?(\d+)/.exec(title);
  const single = /(?:მე-)?(\d+)(?:-ე)?\s?კმ/.exec(title);
  const section = range ? `${range[1]}–${range[2]} კმ` : single ? `${single[1]} კმ` : undefined;
  return section ? `${parts.join("-")}, ${section}` : parts.join("-");
}

export function parseGeoroad(raw: string): Outage[] {
  const items = JSON.parse(raw) as RoadItem[];
  if (!Array.isArray(items)) throw new Error("georoad: not a list");
  return items.flatMap((it) => {
    const ka = it.translates?.find((t) => t.language === "ka") ?? it.translates?.[0];
    if (!ka?.title) return [];
    const title = squash(ka.title);
    const restored = it.restriction_status === "2";
    const publishedAt = parseLocal(it.publish_date);
    return [
      {
        key: `road:${it.id}`,
        source: "georoad",
        provider: "georoad.gov.ge",
        utility: "road",
        city: ROADS_CITY,
        place: roadPlace(title),
        emergency: !restored,
        over: restored,

        publishedAt,
        title,
        text: squash(htmlToText(ka.content ?? "")),
        addresses: [],
        url: PAGE,
      } satisfies Outage,
    ];
  });
}

export const georoad: SourceDef = {
  name: "georoad",
  // Closures come in by the dozen a day in winter, a few a week in summer.
  everySec: 300,
  live: () => false,
  fetchRaw: async () => JSON.stringify(roadItemsFromPage(await fetchText(PAGE))),
  parse: (raw) => parseGeoroad(raw),
};

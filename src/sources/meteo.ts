// The National Environmental Agency — weather warnings, by municipality.
//
// meteo.gov.ge/Ge/Warnings draws a map from /Ge/Warnings/GetMap: one entry
// per municipality (74 of them, Tbilisi included) with its colour, and a title
// and text when a warning is in force. Green (#86c55e) is "nothing". Warnings
// cover storms, heavy rain, floods, mudflows, landslides, avalanches, heat —
// issued ahead of time, which is what makes them worth sending.
//
// The answer is 11 MB, nearly all of it the outline of each municipality,
// uncompressed and uncached; the agency's own page downloads it for every
// visitor. So the source polls hourly, and the outlines are cut out the moment
// the text arrives — what is kept, hashed and parsed is about 7 KB.
//
// When this was written no warning was in force anywhere, so the fields a live
// warning fills (Title, Info) and its colours are read defensively.
import { fetchWithin, BROWSER_UA, htmlToText, squash } from "./common.ts";
import type { Outage, SourceDef } from "../types.ts";

const MAP = "https://meteo.gov.ge/Ge/Warnings/GetMap";
const PAGE = "https://meteo.gov.ge/Ge/Warnings";

interface Zone {
  ID?: number;
  Village?: string;
  Color?: string | null;
  Title?: string | null;
  Info?: string | null;
}

/** The answer without the municipalities' outlines: 11 MB in, 7 KB out. */
export function slimWarnings(raw: string): string {
  return raw.replace(/"Pins":\[[^\]]*\]/g, '"Pins":[]');
}

/**
 * The danger level a map colour stands for: 0 for the agency's green, then
 * yellow, orange and red by how much green is left in the colour. The exact
 * shades are not documented, so the hue decides rather than a list.
 */
export function warningLevel(color: string | null | undefined): 0 | 1 | 2 | 3 {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color ?? "");
  if (!m) return 0;
  const [r, g, b] = [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)];
  // Green clearly ahead of red: the agency's green, no warning. Yellow has as
  // much red as green, so it is not mistaken for it.
  if (g - r > 30 && g >= b) return 0;
  if (g > 200) return 1; // yellow
  if (g > 100) return 2; // orange
  return 3; // red
}

/** A short, stable fingerprint of a warning's wording, for its key. */
function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function parseWarnings(raw: string): Outage[] {
  const zones = JSON.parse(raw) as Zone[];
  if (!Array.isArray(zones)) throw new Error("meteo: not a list");
  return zones.flatMap((z) => {
    const level = warningLevel(z.Color);
    const title = squash(htmlToText(z.Title ?? ""));
    const text = squash(htmlToText(z.Info ?? ""));
    if (!z.Village || (level === 0 && !text)) return [];
    // A new wording is a new warning; the old one then drops off the map and
    // is called over, which is how "the warning is lifted" gets sent.
    return [
      {
        key: `weather:${z.ID ?? z.Village}:${hash(`${z.Color}|${title}|${text}`)}`,
        source: "meteo",
        provider: "NEA",
        utility: "weather",
        city: squash(z.Village),
        level: level || 1,
        emergency: level >= 2,
        title: title || undefined,
        text: text || title,
        addresses: [],
        url: PAGE,
      } satisfies Outage,
    ];
  });
}

export const meteo: SourceDef = {
  name: "meteo",
  // Hourly: warnings are issued hours or days ahead, and every poll is 11 MB.
  everySec: 3600,
  // The map shows what is in force; a warning gone from it has been lifted.
  live: () => true,
  fetchRaw: () =>
    // A minute, not the usual 15 s: 11 MB took up to 15 s when measured.
    fetchWithin(MAP, { headers: { "User-Agent": BROWSER_UA, Accept: "application/json" } }, 60_000, async (r) => {
      if (!r.ok) throw new Error(`${MAP} answered ${r.status}`);
      return slimWarnings(await r.text());
    }),
  parse: (raw) => parseWarnings(raw),
};

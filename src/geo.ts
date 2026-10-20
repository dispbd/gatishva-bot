// An address from a point: a Telegram location, or a link from a maps app.
// The point is turned into a street by OpenStreetMap's Nominatim, which knows
// Georgian street names, Tbilisi's districts and every municipality; the bot
// keeps the street, never the point. Nominatim asks for at most one request a
// second and an identifying User-Agent — a subscription now and then is far
// below that.
import { fetchWithin } from "./sources/common.ts";
import { KNOWN_CITIES, TBILISI_DISTRICTS, cityOfGenitive } from "./cities.ts";
import type { PlaceQuery } from "./places.ts";

export interface Point {
  lat: number;
  lon: number;
}

const NOMINATIM = "https://nominatim.openstreetmap.org/reverse";
const USER_AGENT = "gatishva-bot/1.0 (+https://t.me/gatishva_bot)";

/** The slice of Nominatim's `address` the bot reads. */
export interface OsmAddress {
  road?: string;
  house_number?: string;
  neighbourhood?: string;
  quarter?: string;
  suburb?: string;
  city?: string;
  town?: string;
  village?: string;
  hamlet?: string;
  county?: string;
  state?: string;
  country_code?: string;
}

/** Nominatim's address of a point, in Georgian. */
export async function reverseGeocode(p: Point): Promise<OsmAddress | undefined> {
  const url = `${NOMINATIM}?format=jsonv2&lat=${p.lat}&lon=${p.lon}&zoom=18&addressdetails=1&accept-language=ka`;
  return await fetchWithin(url, { headers: { "User-Agent": USER_AGENT } }, 8000, async (r) => {
    if (!r.ok) throw new Error(`Nominatim answered ${r.status}`);
    const body = (await r.json()) as { address?: OsmAddress };
    return body.address;
  });
}

/** "ვაკის რაიონი" → "ვაკე", "საბურთალოს რაიონი" → "საბურთალო". */
function districtOfSuburb(suburb: string | undefined): string | undefined {
  const word = suburb?.replace(/\s+რაიონი$/, "");
  if (!word) return undefined;
  if (word === "ისნის") return "ისანი"; // the vowel drops before the ending
  return TBILISI_DISTRICTS.find((d) => word === d || word === `${d.replace(/[იაე]$/, "")}ის` || word === `${d}ს`);
}

/**
 * What Nominatim's address means for a subscription: municipality,
 * settlement, street, Tbilisi district. "outside" for a point beyond Georgia.
 *
 * In Tbilisi the suburb is a district, and a quarter like Tskneti is left out:
 * Telasi abbreviates it ("(წყნ)"), so requiring the name would miss notices.
 * Elsewhere the county "ბორჯომის მუნიციპალიტეტი" is the municipality and a
 * town or village in it, "ბაკურიანი", the settlement.
 */
export function placeOfAddress(a: OsmAddress): PlaceQuery | "outside" | undefined {
  if (a.country_code && a.country_code !== "ge") return "outside";
  const street = a.road;
  const settlement = a.town ?? a.village ?? a.hamlet;
  if (a.city === "თბილისი") return street ? { city: a.city, street, district: districtOfSuburb(a.suburb) } : undefined;
  const county = /^(\S+)\s+მუნიციპალიტეტი$/.exec(a.county ?? "")?.[1];
  const city =
    (a.city && KNOWN_CITIES.includes(a.city) ? a.city : undefined) ??
    (county ? cityOfGenitive(county) : undefined) ??
    (settlement && KNOWN_CITIES.includes(settlement) ? settlement : undefined) ??
    a.city;
  if (!city) return undefined;
  const place = settlement && settlement !== city ? settlement : undefined;
  if (!street && !place) return undefined;
  return { city, ...(place ? { place } : {}), ...(street ? { street } : {}) };
}

/** The first link in a message that may lead to a point on a map. */
export function findMapLink(text: string): string | undefined {
  const m = /\b(?:https?:\/\/\S+|geo:[-\d.]+,[-\d.]+\S*)/i.exec(text);
  if (!m) return undefined;
  const url = m[0].replace(/[).,;]+$/, "");
  return /^geo:|google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps|maps\.apple\.com|yandex\.[a-z]+\/maps|openstreetmap\.org|osm\.org/i.test(url)
    ? url
    : undefined;
}

const num = (s: string | undefined) => (s === undefined ? NaN : Number(s));

function point(lat: number, lon: number): Point | undefined {
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : undefined;
}

/**
 * The point a maps link names, from its own text — after any redirect has been
 * followed. Google: "!3dLAT!4dLON" (the place itself) or "@LAT,LON" (the view)
 * or "?q=LAT,LON"; Apple: "ll=" or "q=LAT,LON"; Yandex: "pt=" or "ll=" in
 * LON,LAT order; OpenStreetMap: "mlat="/"mlon=" or "#map=Z/LAT/LON"; "geo:LAT,LON".
 */
export function pointOfUrl(url: string): Point | undefined {
  const u = decodeURIComponent(url);
  let m: RegExpExecArray | null;
  if ((m = /^geo:(-?[\d.]+),(-?[\d.]+)/i.exec(u))) return point(num(m[1]), num(m[2]));
  if (/yandex\./i.test(u)) {
    m = /[?&](?:pt|ll|whatshere\[point\])=(-?[\d.]+),(-?[\d.]+)/.exec(u);
    return m ? point(num(m[2]), num(m[1])) : undefined;
  }
  if ((m = /!3d(-?[\d.]+)!4d(-?[\d.]+)/.exec(u))) return point(num(m[1]), num(m[2]));
  if ((m = /[?&](?:mlat)=(-?[\d.]+)&(?:mlon)=(-?[\d.]+)/.exec(u))) return point(num(m[1]), num(m[2]));
  if ((m = /#map=\d+\/(-?[\d.]+)\/(-?[\d.]+)/.exec(u))) return point(num(m[1]), num(m[2]));
  if ((m = /[?&](?:q|query|ll|sll|daddr|destination)=(-?[\d.]+),\s*(-?[\d.]+)/.exec(u))) return point(num(m[1]), num(m[2]));
  if ((m = /\/place\/(-?[\d.]+),(-?[\d.]+)/.exec(u))) return point(num(m[1]), num(m[2]));
  if ((m = /@(-?[\d.]+),(-?[\d.]+)/.exec(u))) return point(num(m[1]), num(m[2]));
  return undefined;
}

/**
 * The point of a maps link, following short links ("maps.app.goo.gl/…",
 * "yandex.ru/maps/-/…") through their redirects, a few hops at most.
 */
export async function pointOfLink(url: string): Promise<Point | undefined> {
  let at = url;
  for (let hop = 0; hop < 4; hop++) {
    const found = pointOfUrl(at);
    if (found) return found;
    if (/^geo:/i.test(at)) return undefined;
    const next = await fetchWithin(at, { redirect: "manual", headers: { "User-Agent": USER_AGENT } }, 6000, async (r) =>
      r.headers.get("location") ?? undefined,
    );
    if (!next) return undefined;
    at = new URL(next, at).toString();
  }
  return pointOfUrl(at);
}

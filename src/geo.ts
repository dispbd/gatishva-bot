// An address from a point: a Telegram location, or a link from a maps app.
// The point is turned into a street by OpenStreetMap's Nominatim, which knows
// Georgian street names, Tbilisi's districts and every municipality; the bot
// keeps the street, never the point. Nominatim asks for at most one request a
// second and an identifying User-Agent — a subscription now and then is far
// below that — but it throttles the shared addresses Cloudflare's Workers
// leave from (measured 2026-10-21: 503 from the Worker, 200 from elsewhere).
// Photon, komoot's geocoder over the same OpenStreetMap data, answers then.
import { fetchWithin, BROWSER_UA } from "./sources/common.ts";
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

const PHOTON = "https://photon.komoot.io/reverse";

/** The address of a point, in Georgian: Nominatim's, or Photon's when it will not answer. */
export async function reverseGeocode(p: Point): Promise<OsmAddress | undefined> {
  try {
    return await nominatim(p);
  } catch (e) {
    console.warn(`Nominatim: ${e instanceof Error ? e.message : String(e)}; asking Photon`);
    return await photon(p);
  }
}

async function nominatim(p: Point): Promise<OsmAddress | undefined> {
  const url = `${NOMINATIM}?format=jsonv2&lat=${p.lat}&lon=${p.lon}&zoom=18&addressdetails=1&accept-language=ka`;
  return await fetchWithin(url, { headers: { "User-Agent": USER_AGENT } }, 5000, async (r) => {
    if (!r.ok) throw new Error(`Nominatim answered ${r.status}`);
    const body = (await r.json()) as { address?: OsmAddress };
    return body.address;
  });
}

/** Photon's properties of the nearest feature (OpenStreetMap's own, Georgian, names). */
export interface PhotonProperties {
  street?: string;
  housenumber?: string;
  locality?: string;
  district?: string;
  city?: string;
  county?: string;
  state?: string;
  countrycode?: string;
}

async function photon(p: Point): Promise<OsmAddress | undefined> {
  const url = `${PHOTON}?lat=${p.lat}&lon=${p.lon}&limit=1`;
  return await fetchWithin(url, { headers: { "User-Agent": USER_AGENT } }, 6000, async (r) => {
    if (!r.ok) throw new Error(`Photon answered ${r.status}`);
    const body = (await r.json()) as { features?: { properties?: PhotonProperties }[] };
    const props = body.features?.[0]?.properties;
    return props && fromPhoton(props);
  });
}

/**
 * Photon's names in Nominatim's shape. Photon calls a small town like
 * Bakuriani a "city"; a city the bot does not know as a municipality is a
 * settlement in the county's.
 */
export function fromPhoton(p: PhotonProperties): OsmAddress {
  const known = p.city && (p.city === "თბილისი" || KNOWN_CITIES.includes(p.city));
  return {
    road: p.street,
    house_number: p.housenumber,
    quarter: p.locality,
    suburb: p.district,
    ...(known ? { city: p.city } : { town: p.city }),
    county: p.county,
    state: p.state,
    country_code: p.countrycode?.toLowerCase(),
  };
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
  // A consent page carries the map's own address in "continue=", encoded.
  const u = decodeTwice(url).replace(/\+/g, " ");
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
  if ((m = /\/(?:place|search)\/(-?\d+\.\d+),\s*(-?\d+\.\d+)/.exec(u))) return point(num(m[1]), num(m[2]));
  if ((m = /@(-?[\d.]+),(-?[\d.]+)/.exec(u))) return point(num(m[1]), num(m[2]));
  return undefined;
}

function decodeTwice(s: string): string {
  const once = (x: string) => {
    try {
      return decodeURIComponent(x);
    } catch {
      return x;
    }
  };
  return once(once(s));
}

/**
 * The point in a maps page's own HTML, for a link that answers with a page
 * rather than a redirect: Google's static map "center=LAT%2CLON", its
 * "!3d…!4d…" and "@LAT,LON,Zz" in embedded URLs, and "[null,null,LAT,LON]" in
 * the state it boots from.
 */
export function pointOfHtml(html: string): Point | undefined {
  const tries = [
    /center=(-?\d+\.\d+)(?:%2C|,)(-?\d+\.\d+)/,
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,
    /@(-?\d+\.\d+),(-?\d+\.\d+),\d+(?:\.\d+)?z/,
    /\[null,null,(-?\d+\.\d+),(-?\d+\.\d+)\]/,
  ];
  for (const re of tries) {
    const m = re.exec(html);
    const p = m && point(num(m[1]), num(m[2]));
    if (p) return p;
  }
  return undefined;
}

/**
 * "/maps/place/Ilia+Chavchavadze+Ave+37,+Tbilisi/data=…": a link to an
 * address names it, even when it carries only Google's id for the place.
 */
export function addressOfUrl(url: string): string | undefined {
  const m = /\/maps\/place\/([^/@?]+)/.exec(decodeTwice(url));
  const name = m?.[1]?.replace(/\+/g, " ").trim();
  return name && /\p{L}/u.test(name) && /,/.test(name) ? name : undefined;
}

/** What a maps link gave: its point, or the address it names, or where it stopped. */
export interface LinkRead {
  point?: Point;
  address?: string;
  /** Host and status where nothing more could be read — for the log, not the reader. */
  stoppedAt?: string;
}

/**
 * Read a maps link, following short links ("maps.app.goo.gl/…",
 * "yandex.ru/maps/-/…") through their redirects, a few hops at most, as a
 * browser would: some answer a client that does not look like one with a page
 * instead of a redirect, and then the page itself is read.
 */
export async function readLink(url: string): Promise<LinkRead> {
  let at = url;
  let address: string | undefined;
  for (let hop = 0; hop < 5; hop++) {
    const found = pointOfUrl(at);
    if (found) return { point: found };
    address ??= addressOfUrl(at);
    if (/^geo:/i.test(at)) break;
    const step = await fetchWithin(
      at,
      { redirect: "manual", headers: { "User-Agent": BROWSER_UA, "Accept-Language": "en" } },
      6000,
      async (r) => ({
        status: r.status,
        location: r.headers.get("location") ?? undefined,
        html: r.status === 200 ? (await r.text()).slice(0, 500_000) : "",
      }),
    );
    if (step.location) {
      at = new URL(step.location, at).toString();
      continue;
    }
    const inPage = pointOfHtml(step.html);
    if (inPage) return { point: inPage };
    // A page that only says where to go next.
    const refresh = /http-equiv=["']?refresh["']?[^>]*url=([^"'>\s]+)/i.exec(step.html)?.[1] ??
      /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i.exec(step.html)?.[1];
    if (refresh && refresh !== at) {
      at = new URL(refresh.replace(/&amp;/g, "&"), at).toString();
      continue;
    }
    return address ? { address } : { stoppedAt: `${new URL(at).host} ${step.status}` };
  }
  return address ? { address } : { stoppedAt: `${/^geo:/i.test(at) ? "geo" : new URL(at).host} (hops)` };
}

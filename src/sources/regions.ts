// The three providers outside Tbilisi. All three expose clean JSON, and all
// three name the place first — which becomes the "city" a subscriber picks.
//
//   Energo-Pro (electricity) — POST my.energo-pro.ge/owback/searchAlerts.
//     ~100 alerts, explicit from/to times, taskType "1" = planned.
//   SOCAR Georgia Gas (gas)  — the API behind mygas.ge. Explicit ISO times,
//     a creation time, and an official English translation of every notice.
//   UWSC, water.gov.ge (water) — /api/v1/site/planned-works, filterable by date.
//
// These three, plus GWP, are what water.andreev-e.ru (@WaterGeorgia_bot)
// polls every five minutes; its source code is public (andreev-e/water_ge).
import { fetchText, postJson, retrying, htmlToText, squash, looksEmergency } from "./common.ts";
import { splitAddresses } from "../georgian.ts";
import { KNOWN_CITIES, cityOfGenitive } from "../cities.ts";
import { parseLocal, tbilisiDate } from "../time.ts";
import type { Outage, SourceDef } from "../types.ts";

// --- Energo-Pro --------------------------------------------------------------

/** Tries per poll; see `energo.fetchRaw`. Each costs ~0.1 s and one subrequest. */
export const ENERGO_ATTEMPTS = 6;

interface EnergoAlert {
  taskId: number;
  taskName?: string;
  taskNote?: string;
  scEffectedCustomers?: string;
  disconnectionArea?: string;
  regionName?: string;
  scName?: string;
  disconnectionDate?: string;
  reconnectionDate?: string;
  taskType?: string;
}

export function parseEnergo(raw: string): Outage[] {
  const data = JSON.parse(raw) as { status?: number; data?: EnergoAlert[] };
  if (!Array.isArray(data.data)) throw new Error(`Energo-Pro: status ${data.status}`);
  return data.data.map((a) => {
    const area = squash(a.disconnectionArea ?? "");
    const city = squash(a.scName ?? a.regionName ?? "");
    return {
      key: `energo:${a.taskId}`,
      source: "energo",
      provider: "Energo-Pro",
      utility: "power",
      city,
      emergency: String(a.taskType) !== "1",
      start: parseLocal(a.disconnectionDate),
      end: parseLocal(a.reconnectionDate),
      title: squash(a.taskNote ?? ""),
      text: squash(`${city}: ${area}. ${a.taskNote ?? ""}`),
      addresses: splitAddresses(area).map(energoPlace).filter(Boolean),
      url: "https://my.energo-pro.ge/ow/#/",
    } satisfies Outage;
  });
}

/**
 * Energo-Pro writes places as a path, "გურჯაანის რ-ნი/ახაშენი/უცნობი": the
 * district, the village, then the street — "უცნობი" (unknown) or "0" when it
 * has none. The district is already the outage's city, so only the rest is kept.
 */
export function energoPlace(path: string): string {
  return path
    .split("/")
    .map((p) => p.trim())
    .filter((p, i, all) => !(i === 0 && all.length > 1 && /რ-ნი|რაიონი/.test(p)))
    .filter((p) => p && p !== "0" && p !== "უცნობი")
    .join(", ");
}

export const energo: SourceDef = {
  name: "energo",
  everySec: 120,
  live: () => false,
  // Energo-Pro's nginx rotates requests over three Tomcat backends and two of
  // them answer 404 (measured 2026-10-11: 200, 404, 404, repeating, 40 requests
  // in a row). One request every two minutes then fails ten times running a few
  // times a day — not a block, just bad luck — so a poll retries on the spot.
  // Six tries all fail one time in eleven; ten polls in a row, practically never.
  fetchRaw: () =>
    retrying(() => postJson("https://my.energo-pro.ge/owback/searchAlerts", { search: "" }), ENERGO_ATTEMPTS, [404, 502, 503]),
  parse: parseEnergo,
};

// --- SOCAR Georgia Gas -------------------------------------------------------

interface GasItem {
  id: string;
  title?: string;
  description?: string;
  affectedCustomers?: number;
  start?: string;
  end?: string;
  type?: string;
  created?: string;
  isDeactivated?: boolean;
  detail?: { notificationTitle?: string; notificationDescription?: string };
}

export function parseSocar(raw: string): Outage[] {
  const data = JSON.parse(raw) as { items?: GasItem[] };
  if (!Array.isArray(data.items)) throw new Error("SOCAR: no items");
  return data.items
    .filter((g) => !g.isDeactivated)
    .map((g) => {
      const title = squash(g.title ?? "");
      const description = g.detail?.notificationDescription ?? g.description ?? "";
      const { city, places, whole } = socarPlace(title, description);
      const iso = (s?: string) => (s ? Math.floor(Date.parse(s) / 1000) || undefined : undefined);
      return {
        key: `socar:${g.id}`,
        source: "socar",
        provider: "SOCAR Gas",
        utility: "gas",
        city,
        emergency: g.type !== "Planned",
        start: iso(g.start),
        end: iso(g.end),
        publishedAt: iso(g.created),
        title,
        text: squash(`${title}. ${description}`),
        ...(whole ? { wholeCity: true } : {}),
        addresses: splitAddresses(places),
        url: "https://www.mygas.ge/",
      } satisfies Outage;
    });
}

/**
 * The municipality and the places of a SOCAR title. Most read "სიღნაღი: სოფ.
 * ნუკრიანი", but a third (October 2026) do without the colon or the
 * municipality: "ჭიათურა ბათუმის ქუჩა", "ქუთაისი- თამარ მეფის 10-12",
 * "გურჯაანი; სოფ. კაჭრეთი", "დაბა ჩაქვი. ხუსეინ ბეჟანიძის ქუჩა". The notice's
 * own text always says "…ის მუნიციპალიტეტში", which settles the last kind.
 */
export function socarPlace(title: string, description: string): { city: string; places: string; whole: boolean } {
  // "ჭიათურა", or "ადიგენის მუნიციპალიტეტი", then a separator, then places.
  const head = /^([ა-ჿ]+)(\s+მუნიციპალიტეტი)?(?:\s*[:;.,\-–]\s*|\s+|$)/.exec(title);
  const named = head && (head[2] ? cityOfGenitive(head[1]!) : KNOWN_CITIES.find((c) => c === head[1]));
  const inText = /([ა-ჿ]+)\s+მუნიციპალიტეტ/.exec(description);
  const fromText = inText ? cityOfGenitive(inText[1]!) : undefined;
  let city: string;
  let rest: string;
  if (named) {
    city = named;
    rest = title.slice(head![0].length);
  } else if (fromText) {
    city = fromText;
    rest = title;
  } else {
    // Neither: as before, whatever stands before the colon.
    const colon = title.indexOf(":");
    city = colon > 0 ? title.slice(0, colon).trim() : title;
    rest = colon > 0 ? title.slice(colon + 1) : "";
  }
  rest = rest.trim();
  const whole = /^(?:სრულად|მთლიანად)\.?$/.test(rest);
  const places = whole
    ? ""
    : rest
        .replace(/^სოფლები\s*[-–:]\s*/, "") // "სოფლები - სარო, ხიზაბავრა": villages: …
        .replace(/\s*;\s*/g, ", ")
        .replace(/\s+:\s+/g, ", ") // "დაბა კოჯორი : ექვთიმე თაყაიშვილის ქუჩა"
        .replace(/[.\s]+$/, "");
  return { city, places, whole };
}

export const socar: SourceDef = {
  name: "socar",
  everySec: 300,
  live: () => false,
  fetchRaw: () =>
    fetchText("https://utilixwebapi.azurewebsites.net/api/Outage/GetOutagesWithPaging?pageIndex=1&PageSize=50", {
      headers: { Referer: "https://www.mygas.ge/" },
    }),
  parse: parseSocar,
};

// --- UWSC, water.gov.ge ------------------------------------------------------

interface UwscItem {
  id: number;
  title?: string;
  excerpt?: string;
  content?: string;
  created_at?: string;
  end_date?: string;
  address_list?: string[];
}

export function parseUwsc(raw: string): Outage[] {
  const data = JSON.parse(raw) as { items?: UwscItem[] };
  if (!Array.isArray(data.items)) throw new Error("UWSC: no items");
  return data.items.map((w) => {
    // "დუშეთი - წყალმომარაგების შეწყვეტა გეგმური სამუშაოების გამო"
    const title = squash(w.title ?? "");
    const city = title.split(" - ")[0]!.trim();
    const excerpt = w.excerpt ?? htmlToText(w.content ?? "");
    const field = (name: string) => new RegExp(`${name}:\\s*([^;]+)`).exec(excerpt)?.[1];
    return {
      key: `uwsc:${w.id}`,
      source: "uwsc",
      provider: "UWSC",
      utility: "water",
      city,
      emergency: looksEmergency(title),
      start: parseLocal(field("შეწყვეტა")),
      end: parseLocal(field("აღდგენა")) ?? parseLocal(w.end_date),
      publishedAt: parseLocal(w.created_at),
      title,
      text: squash(`${title}. ${excerpt}`),
      // Each address repeats the town: "ბორჯომი აკ.შანიძის ქ.".
      addresses: (w.address_list ?? []).map((a) => squash(a).replace(city, "").trim()).filter(Boolean),
      url: "https://water.gov.ge/planned-works",
    } satisfies Outage;
  });
}

export const uwsc: SourceDef = {
  name: "uwsc",
  everySec: 300,
  live: () => false,
  fetchRaw: () => {
    // Yesterday onwards: the unfiltered list is a megabyte of archive.
    const [y, m, d] = tbilisiDate(Math.floor(Date.now() / 1000) - 86400);
    const from = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    return fetchText(`https://water.gov.ge/api/v1/site/planned-works?date_from=${from}&page=1&page_size=100`);
  },
  parse: parseUwsc,
};

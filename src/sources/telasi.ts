// Telasi — electricity in Tbilisi.
//
// telasi.ge is a Nuxt app; its outage page POSTs to
// app.telasi.ge/api/view/telasi/getPoweroutages and gets two lists back:
//
//   content — the notices Telasi's staff publish by hand, newest first. Only
//             the Georgian (`lang: ka`) list is complete: the Russian one carries
//             planned works only and the English one is all but empty. This is
//             where emergencies appear, and it is an *archive*: notices stay.
//   api     — a structured list of outages in progress (code, outage_time,
//             poweron_time). Empty whenever it was looked at while writing this,
//             so its shape is taken from the site's own JavaScript and parsed
//             defensively.
//
// Emergency notices arrive late, and nothing downstream can fix that: on
// 2026-10-07 notice 5918 was published at 17:54 saying power would be back
// "by about 17:47". See docs/research.md.
import { postJson, htmlToText, squash, districtOf, districtFields, TBILISI } from "./common.ts";
import { splitAddresses } from "../georgian.ts";
import { parseLocal, kaMonth, yearFor, tbilisiDate, tbilisiEpoch } from "../time.ts";
import type { Outage, SourceDef } from "../types.ts";

interface ContentItem {
  id: number;
  created_at?: string;
  title?: string;
  editor?: string;
  slug?: string;
}

interface ApiItem {
  id?: number | string;
  code?: string;
  title?: string;
  full_title?: string;
  editor?: string;
  date?: string;
  outage_time?: string;
  poweron_time?: string;
}

interface Payload {
  api?: { list?: ApiItem[] };
  content?: { list?: ContentItem[] };
}

const PAGE = "https://www.telasi.ge/ka/power";

export function parseTelasi(raw: string, _now: number): Outage[] {
  const data = JSON.parse(raw) as Payload;
  if (!data.content && !data.api) throw new Error("Telasi: unexpected payload");
  return [
    ...(data.api?.list ?? []).flatMap(liveItem),
    ...(data.content?.list ?? []).flatMap(contentItem),
  ];
}

function liveItem(i: ApiItem): Outage[] {
  const id = i.code ?? i.id;
  if (id === undefined) return [];
  const text = squash(htmlToText(i.editor ?? i.full_title ?? i.title ?? ""));
  return [
    wholeIfNoStreets({
      key: `telasi-live:${id}`,
      source: "telasi",
      provider: "Telasi",
      utility: "power",
      city: TBILISI,
      ...districtFields(text),
      emergency: true,
      start: parseLocal(i.outage_time) ?? parseLocal(i.date),
      end: parseLocal(i.poweron_time),
      title: squash(i.full_title ?? i.title ?? ""),
      text,
      addresses: liveAddresses(text),
      url: `${PAGE}?outage=${encodeURIComponent(String(id))}`,
    }),
  ];
}

/**
 * A live outage's text is usually the bare street list, "აბაკელიას ქ.,ცხემის
 * შეს.,...,რუსთაველის გამზ." (October 2026), with no "ქუჩებს:" to find it by.
 * A sentence naming districts only is not a list: its parts are long, or it
 * has the colon the notices' own wording uses.
 */
function liveAddresses(text: string): string[] {
  const listed = telasiAddresses(text);
  if (listed.length || text.includes(":")) return listed;
  const parts = splitAddresses(text);
  return parts.every((p) => p.length <= 60) ? parts : [];
}

/**
 * An emergency notice that names districts but no streets cuts those districts
 * whole: notice 5919 of 8 October, a high-voltage fault, said only "to the
 * Sololaki-Mtatsminda-Krtsanisi and Isani districts".
 */
function wholeIfNoStreets(o: Outage): Outage {
  return o.addresses.length === 0 && o.district ? { ...o, wholeDistricts: true } : o;
}

function contentItem(i: ContentItem): Outage[] {
  const title = squash(i.title ?? "");
  const publishedAt = parseLocal(i.created_at);
  const base = {
    source: "telasi",
    provider: "Telasi",
    utility: "power" as const,
    city: TBILISI,
    publishedAt,
    title,
    url: `${PAGE}?content=${i.id}`,
  };
  const html = i.editor ?? "";

  // "...ელექტრომომარაგების არაგეგმური წყვეტა (ავარია)" — an unplanned cut.
  if (/არაგეგმ/.test(title)) {
    // Some notices repeat their own headline as the first paragraph.
    let text = squash(htmlToText(html));
    if (title && text.startsWith(title)) text = text.slice(title.length).replace(/^[\s.]+/, "");
    return [
      wholeIfNoStreets({
        ...base,
        key: `telasi:${i.id}`,
        ...districtFields(text),
        emergency: true,
        // No start time: the notice goes out once the lights are already off,
        // and its publication time is shown as exactly that.
        end: telasiEta(text),
        text,
        addresses: telasiAddresses(text),
      }),
    ];
  }

  // A planned-works notice covers several districts, each with its own hours,
  // as a bold district heading followed by its paragraphs. Each district
  // becomes an outage of its own, so a subscriber is told *their* hours.
  const day = plannedDay(title, publishedAt);
  return plannedSections(html).flatMap((sec, n) => {
    const addresses = telasiAddresses(sec.text);
    // The closing apology is a paragraph too.
    if (addresses.length === 0) return [];
    const hours = /(\d{1,2}):(\d{2})\s*საათიდან\s*(\d{1,2}):(\d{2})\s*საათამდე/.exec(sec.text);
    let start: number | undefined;
    let end: number | undefined;
    if (day && hours) {
      start = tbilisiEpoch(day[0], day[1], day[2], +hours[1]!, +hours[2]!);
      end = tbilisiEpoch(day[0], day[1], day[2], +hours[3]!, +hours[4]!);
      if (end <= start) end += 86400; // 22:00 to 04:00
    }
    return [
      {
        ...base,
        key: `telasi:${i.id}:${n}`,
        district: sec.district,
        // "Urgent works" announced two days ahead are planned as far as the
        // reader is concerned: there is time to prepare.
        emergency: false,
        start,
        end,
        text: sec.heading ? `${sec.heading}. ${sec.text}` : sec.text,
        addresses,
      },
    ];
  });
}

/** "ელექტრომომარაგების აღდგენის სავარაუდო დრო: 07.10.2026 06 :20 სთ" — stray spaces and all. */
export function telasiEta(text: string): number | undefined {
  const m = /აღდგენის[^:]*:\s*(\d{1,2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{4})\s*(\d{1,2})\s*:\s*(\d{2})/.exec(text);
  return m ? tbilisiEpoch(+m[3]!, +m[2]!, +m[1]!, +m[4]!, +m[5]!) : undefined;
}

/**
 * The street list of a notice: after "ქუჩებს:" (emergencies) or "შეეხება:"
 * (planned), up to the sentence about restoration or "...ქუჩების მოსახლეობას".
 */
export function telasiAddresses(text: string): string[] {
  const m = /(?:ქუჩებს|შეეხება|ტერიტორიას)\s*:\s*([\s\S]*?)(?:\.\s*(?:ელექტრომომარაგების|კომპანია|სამუშაოების)|\s+ქუჩების\s+მოსახლეობას|$)/.exec(text);
  if (!m) return [];
  return splitAddresses(m[1]!);
}

/** "სხვადასხვა სამუშაოების ჩატარების გამო 9 ოქტომბერს ..." → the day it is about. */
function plannedDay(title: string, publishedAt: number | undefined): [number, number, number] | undefined {
  const m = /(\d{1,2})\s+([ა-ჿ]+)/.exec(title);
  const month = m ? kaMonth(m[2]!) : undefined;
  if (!m || !month) return publishedAt ? tbilisiDate(publishedAt) : undefined;
  const year = publishedAt ? yearFor(month, publishedAt) : new Date().getUTCFullYear();
  return [year, month, +m[1]!];
}

interface Section {
  district?: string;
  heading?: string;
  text: string;
}

/** Paragraphs grouped under the district headings that precede them. */
export function plannedSections(html: string): Section[] {
  const paragraphs = html
    .split(/<\/p>/i)
    .map((p) => squash(htmlToText(p)))
    .filter(Boolean);
  const out: Section[] = [];
  let heading: string | undefined;
  for (const p of paragraphs) {
    if (p.length < 60 && /რაიონი$/.test(p)) {
      heading = p;
      continue;
    }
    out.push({ heading, district: heading ? districtOf(`${heading.replace(/რაიონი$/, "")}რაიონის`) : districtOf(p), text: p });
  }
  return out;
}

export const telasi: SourceDef = {
  name: "telasi",
  everySec: 60,
  live: (key) => key.startsWith("telasi-live:"),
  fetchRaw: () =>
    postJson(
      "https://app.telasi.ge/api/view/telasi/getPoweroutages",
      // The default page is 30 notices, ~250 KB, and parsing it takes ~7 ms —
      // most of the free plan's 10 ms of CPU. Telasi rarely posts more than a
      // few an hour, so the newest eight polled every minute miss nothing.
      { contentType: "poweroutage", searchText: "", perPage: 8 },
      { lang: "ka" },
    ),
  parse: parseTelasi,
};

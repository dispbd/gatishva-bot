// An outage as a Telegram message (parse_mode HTML), in the chat's language.
//
// The reader's question is "is it my street, and when?", so that is what the
// top three lines answer, in the reader's language, from the parsed fields.
// Everything else — the full address list and the provider's own Georgian
// text — sits in collapsed quotes underneath, with the reader's streets in bold
// in both. A Georgian reader gets the original alone: the address list would
// only repeat it.
import { addressLocal, translit, findKeys } from "./georgian.ts";
import { t } from "./i18n.ts";
import type { Lang, Reason } from "./i18n.ts";
import type { Span } from "./georgian.ts";
import { highlightSpans } from "./match.ts";
import { preamble } from "./sources/common.ts";
import type { Sub } from "./match.ts";
import { escapeHtml } from "./telegram.ts";
import { fmtDateTime, fmtRange, TBILISI_OFFSET_SEC } from "./time.ts";
import type { Outage, Utility } from "./types.ts";

export const UTILITY_ICON: Record<Utility, string> = { water: "💧", power: "💡", gas: "🔥", road: "🚧" };

/** Telegram's limit is 4096 characters of visible text; this leaves headroom. */
const LIMIT = 4000;

/** The cause, from the Georgian wording. First match wins, most specific first. */
const REASONS: [RegExp, Reason][] = [
  [/ხანძ/, "fire"],
  // Hazards come before the generic words: a road "damaged by a landslide"
  // should say landslide.
  [/ზვავ/, "avalanche"],
  [/მეწყერ/, "landslide"],
  [/ქვაცვენ|კლდეზვავ/, "rockfall"],
  [/ღვარცოფ/, "mudflow"],
  [/წყალდიდ|წყალმოვარდ/, "flood"],
  [/თოვ/, "snow"],
  [/ლიპყინულ|მოყინვ|ყინულ/, "ice"],
  [/გადართვ/, "switching"],
  [/კოროზი/, "corrosion"],
  [/დაზიან/, "damage"],
  [/ავარი/, "accident"],
  [/სარეკონსტრუქციო|რეკონსტრუქც|სარეაბილიტაციო|რეაბილიტაც/, "reconstruction"],
  [/პროფილაქტ/, "maintenance"],
  [/გადაუდებ/, "urgent"],
  [/სამუშაო/, "works"],
];

export function reasonOf(o: Outage, lang: Lang = "ru"): string | undefined {
  const text = `${o.title ?? ""} ${preamble(o.text)}`;
  const reason = REASONS.find(([re]) => re.test(text))?.[1];
  return reason && t(lang).reason[reason];
}

/** Text with the spans in bold, everything escaped. */
export function boldSpans(text: string, spans: Span[]): string {
  let out = "";
  let at = 0;
  for (const [a, b] of spans) {
    out += escapeHtml(text.slice(at, a)) + "<b>" + escapeHtml(text.slice(a, b)) + "</b>";
    at = b;
  }
  return out + escapeHtml(text.slice(at));
}

/** How long a piece of HTML is once Telegram has parsed it. */
export function visibleLength(html: string): number {
  return html.replace(/<[^>]+>/g, "").replace(/&(amp|lt|gt|quot);/g, "_").length;
}

export interface RenderState {
  /** The provider has taken the outage off its list of current ones. */
  finished?: boolean;
  /** The chat's language; Russian when not given. */
  lang?: Lang;
}

export function renderOutage(o: Outage, subs: Sub[], state: RenderState = {}): string {
  const lang = state.lang ?? "ru";
  const S = t(lang);
  // Road subscriptions read like street ones: the reader's place, in bold.
  const streetSubs = subs.filter((s) => s.kind !== "city");
  const districts = o.districts ?? (o.district ? [o.district] : []);
  const place = o.place
    ? addressLocal(o.place, lang)
    : [translit(o.city, lang), districts.map((d) => translit(d, lang)).join(S.and)].filter(Boolean).join(", ");

  const head: string[] = [];
  if (state.finished) head.push(S.finished(escapeHtml(o.provider)));
  head.push(`${UTILITY_ICON[o.utility]} <b>${S.utility[o.utility]} · ${escapeHtml(place)}</b>`);

  const reason = reasonOf(o, lang);
  const kind =
    o.utility === "road" ? (o.over ? S.roadRestored : S.roadClosed) : o.emergency ? S.emergency : S.planned;
  head.push(reason ? `${kind} · ${reason}` : kind);

  const when = timeLine(o, lang);
  if (when) head.push(when);

  // The reader's own streets, in their language, bold — the line read first.
  const mine = o.addresses.filter((a) => findKeys(a, streetSubs.flatMap((s) => s.keys)).length > 0);
  if (streetSubs.length) {
    if (mine.length) {
      head.push(`📍 ${mine.map((a) => `<b>${escapeHtml(addressLocal(a, lang))}</b>`).join(", ")}`);
    } else if (o.wholeDistricts) {
      // Matched by district, not by name: say so, or the reader looks for
      // their street in a notice that has none.
      const labels = streetSubs.map((s) => `<b>${escapeHtml(s.label)}</b>`).join(", ");
      head.push(S.wholeDistrict(labels));
    } else {
      head.push(`📍 ${streetSubs.map((s) => `<b>${escapeHtml(s.label)}</b>`).join(", ")}`);
    }
  }

  const foot = footer(o, lang);

  // The two collapsed quotes share whatever room is left, addresses first.
  let room = LIMIT - visibleLength(head.join("\n")) - visibleLength(foot) - 40;
  const blocks: string[] = [];

  // In Georgian the list would be the original's own words, so it is skipped:
  // the original is the translation.
  const original = lang === "ka";
  if (!original && (o.addresses.length > 1 || (o.addresses.length === 1 && !mine.length))) {
    const items = o.addresses.map((a) => {
      const local = escapeHtml(addressLocal(a, lang));
      return mine.includes(a) ? `<b>${local}</b>` : local;
    });
    const list = fitList(items, room - 30, lang);
    blocks.push(`<blockquote expandable>${S.addresses(o.addresses.length)}\n${list}</blockquote>`);
    room -= visibleLength(list) + 30;
  }

  if (room > 200) {
    const spans = highlightSpans(o.text, streetSubs);
    const text = o.text.length > room ? truncateAround(o.text, spans, room) : { text: o.text, spans };
    blocks.push(`<blockquote expandable>${original ? "" : "🇬🇪 "}${boldSpans(text.text, text.spans)}</blockquote>`);
  }

  return [head.join("\n"), ...blocks, foot].join("\n");
}

function timeLine(o: Outage, lang: Lang): string {
  const S = t(lang);
  if (o.start && o.end && o.end > o.start) return `🕒 ${fmtRange(o.start, o.end, lang)}`;
  if (o.start && !o.end) return `🕒 ${fmtRange(o.start, undefined, lang)}`;
  if (o.end) {
    // Telasi often publishes after its own estimate has passed. Say so plainly
    // rather than promising a time that is already behind us.
    if (o.publishedAt && o.end < o.publishedAt) return S.restoreStale(fmtDateTime(o.end));
    return o.emergency ? S.restoreAbout(fmtDateTime(o.end)) : `🕒 ${fmtRange(undefined, o.end, lang)}`;
  }
  return "";
}

function footer(o: Outage, lang: Lang): string {
  const link = `<a href="${escapeHtml(o.url)}">${escapeHtml(o.provider)}</a>`;
  // A date-only publication time (te.ge gives no hour) would read as midnight.
  const precise = o.publishedAt && (o.publishedAt + TBILISI_OFFSET_SEC) % 86400 !== 0;
  return precise ? `${link} · ${t(lang).published(fmtDateTime(o.publishedAt!))}` : link;
}

/** As many items as fit, then "and N more". Bold (the reader's) items are kept first. */
function fitList(items: string[], room: number, lang: Lang): string {
  const all = items.join(", ");
  if (visibleLength(all) <= room) return all;
  const mine = items.filter((i) => i.startsWith("<b>"));
  const rest = items.filter((i) => !i.startsWith("<b>"));
  const out: string[] = [...mine];
  let len = visibleLength(out.join(", "));
  for (const it of rest) {
    const add = visibleLength(it) + 2;
    if (len + add > room - 20) break;
    out.push(it);
    len += add;
  }
  return `${out.join(", ")} ${t(lang).andMore(items.length - out.length)}`;
}

/**
 * Cut `text` to `room` characters, keeping the first highlighted span in view —
 * a reader who expands the quote is looking for their street.
 */
export function truncateAround(text: string, spans: Span[], room: number): { text: string; spans: Span[] } {
  const first = spans[0];
  let from = 0;
  if (first && first[1] > room - 20) from = Math.max(0, first[0] - Math.floor(room / 3));
  const to = Math.min(text.length, from + room - 2);
  const cut = (from > 0 ? "…" : "") + text.slice(from, to) + (to < text.length ? "…" : "");
  const shift = from > 0 ? 1 - from : 0;
  const kept = spans
    .filter(([a, b]) => a >= from && b <= to)
    .map(([a, b]) => [a + shift, b + shift] as Span);
  return { text: cut, spans: kept };
}

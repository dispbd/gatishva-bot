// An outage as a Telegram message (parse_mode HTML).
//
// The reader's question is "is it my street, and when?", so that is what the
// top three lines answer, in Russian, from the parsed fields. Everything else —
// the full address list and the provider's own Georgian text — sits in
// collapsed quotes underneath, with the reader's streets in bold in both.
import { addressRu, translitRu, findKeys } from "./georgian.ts";
import type { Span } from "./georgian.ts";
import { highlightSpans } from "./match.ts";
import { preamble } from "./sources/common.ts";
import type { Sub } from "./match.ts";
import { escapeHtml } from "./telegram.ts";
import { fmtDateTime, fmtRange, TBILISI_OFFSET_SEC } from "./time.ts";
import type { Outage, Utility } from "./types.ts";

export const UTILITY_ICON: Record<Utility, string> = { water: "💧", power: "💡", gas: "🔥" };
export const UTILITY_NAME: Record<Utility, string> = { water: "Вода", power: "Свет", gas: "Газ" };

/** Telegram's limit is 4096 characters of visible text; this leaves headroom. */
const LIMIT = 4000;

/** The cause, from the Georgian wording. First match wins, most specific first. */
const REASONS: [RegExp, string][] = [
  [/ხანძ/, "пожар"],
  [/გადართვ/, "переключение в сети"],
  [/კოროზი/, "коррозия трубы"],
  [/დაზიან/, "повреждение сети"],
  [/ავარი/, "авария"],
  [/სარეკონსტრუქციო|რეკონსტრუქც|სარეაბილიტაციო|რეაბილიტაც/, "реконструкция"],
  [/პროფილაქტ/, "профилактика"],
  [/გადაუდებ/, "срочные работы"],
  [/სამუშაო/, "работы"],
];

export function reasonOf(o: Outage): string | undefined {
  const text = `${o.title ?? ""} ${preamble(o.text)}`;
  return REASONS.find(([re]) => re.test(text))?.[1];
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
}

export function renderOutage(o: Outage, subs: Sub[], state: RenderState = {}): string {
  const streetSubs = subs.filter((s) => s.kind === "street");
  const districts = o.districts ?? (o.district ? [o.district] : []);
  const place = [translitRu(o.city), districts.map(translitRu).join(" и ")].filter(Boolean).join(", ");

  const head: string[] = [];
  if (state.finished) head.push(`✅ <b>Завершено</b> — ${escapeHtml(o.provider)} убрал отключение из списка текущих`);
  head.push(`${UTILITY_ICON[o.utility]} <b>${UTILITY_NAME[o.utility]} · ${escapeHtml(place)}</b>`);

  const reason = reasonOf(o);
  const kind = o.emergency ? "⚠️ Аварийное" : "🛠 Плановое";
  head.push(reason ? `${kind} · ${reason}` : kind);

  const when = timeLine(o);
  if (when) head.push(when);

  // The reader's own streets, in Russian, bold — the line they read first.
  const mine = o.addresses.filter((a) => findKeys(a, streetSubs.flatMap((s) => s.keys)).length > 0);
  if (streetSubs.length) {
    const shown = mine.length
      ? mine.map((a) => `<b>${escapeHtml(addressRu(a))}</b>`)
      : streetSubs.map((s) => `<b>${escapeHtml(s.label)}</b>`);
    head.push(`📍 ${shown.join(", ")}`);
  }

  const foot = footer(o);

  // The two collapsed quotes share whatever room is left, addresses first.
  let room = LIMIT - visibleLength(head.join("\n")) - visibleLength(foot) - 40;
  const blocks: string[] = [];

  if (o.addresses.length > 1 || (o.addresses.length === 1 && !mine.length)) {
    const items = o.addresses.map((a) => {
      const ru = escapeHtml(addressRu(a));
      return mine.includes(a) ? `<b>${ru}</b>` : ru;
    });
    const list = fitList(items, room - 30);
    blocks.push(`<blockquote expandable>📋 Адреса (${o.addresses.length}):\n${list}</blockquote>`);
    room -= visibleLength(list) + 30;
  }

  if (room > 200) {
    const spans = highlightSpans(o.text, streetSubs);
    const text = o.text.length > room ? truncateAround(o.text, spans, room) : { text: o.text, spans };
    blocks.push(`<blockquote expandable>🇬🇪 ${boldSpans(text.text, text.spans)}</blockquote>`);
  }

  return [head.join("\n"), ...blocks, foot].join("\n");
}

function timeLine(o: Outage): string {
  if (o.start && o.end && o.end > o.start) return `🕒 ${fmtRange(o.start, o.end)}`;
  if (o.start && !o.end) return `🕒 ${fmtRange(o.start, undefined)}`;
  if (o.end) {
    // Telasi often publishes after its own estimate has passed. Say so plainly
    // rather than promising a time that is already behind us.
    if (o.publishedAt && o.end < o.publishedAt) {
      return `⏱ Восстановление ожидалось к ${fmtDateTime(o.end)} — раньше, чем вышло сообщение`;
    }
    return o.emergency ? `⏱ Восстановление ≈ ${fmtDateTime(o.end)}` : `🕒 ${fmtRange(undefined, o.end)}`;
  }
  return "";
}

function footer(o: Outage): string {
  const link = `<a href="${escapeHtml(o.url)}">${escapeHtml(o.provider)}</a>`;
  // A date-only publication time (te.ge gives no hour) would read as midnight.
  const precise = o.publishedAt && (o.publishedAt + TBILISI_OFFSET_SEC) % 86400 !== 0;
  return precise ? `${link} · опубликовано ${fmtDateTime(o.publishedAt!)}` : link;
}

/** As many items as fit, then "и ещё N". Bold (the reader's) items are kept first. */
function fitList(items: string[], room: number): string {
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
  return `${out.join(", ")} … и ещё ${items.length - out.length}`;
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

// Every provider publishes in Tbilisi time and so do we. Georgia has had no DST
// since 2005, so +04:00 is a constant — which is what lets the parsers build
// dates without a timezone library.
import { t } from "./i18n.ts";
import type { Lang } from "./i18n.ts";

const TZ = "Asia/Tbilisi";
export const TBILISI_OFFSET_SEC = 4 * 3600;

export function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

/** Epoch seconds for a wall-clock time in Tbilisi. Month is 1-based. */
export function tbilisiEpoch(y: number, mo: number, d: number, h = 0, mi = 0, s = 0): number {
  return Math.floor(Date.UTC(y, mo - 1, d, h, mi, s) / 1000) - TBILISI_OFFSET_SEC;
}

/** "2026-10-07 17:54:19" or "2026-10-12 13:00", Tbilisi wall clock. */
export function parseLocal(text: string | null | undefined): number | undefined {
  const m = /(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(text ?? "");
  if (!m) return undefined;
  return tbilisiEpoch(+m[1]!, +m[2]!, +m[3]!, +m[4]!, +m[5]!, +(m[6] ?? 0));
}

/** The Tbilisi calendar date of an instant, as [year, month, day]. */
export function tbilisiDate(epochSec: number): [number, number, number] {
  const d = new Date((epochSec + TBILISI_OFFSET_SEC) * 1000);
  return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
}

const fmt = new Intl.DateTimeFormat("ru-RU", {
  timeZone: TZ,
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function parts(epochSec: number) {
  const p = fmt.formatToParts(new Date(epochSec * 1000));
  const get = (type: Intl.DateTimeFormatPartTypes): string => p.find((x) => x.type === type)?.value ?? "";
  return { day: get("day"), month: get("month"), hour: get("hour"), minute: get("minute") };
}

/** "07.10 23:15". */
export function fmtDateTime(epochSec: number): string {
  const p = parts(epochSec);
  return `${p.day}.${p.month} ${p.hour}:${p.minute}`;
}

/** "23:15". */
export function fmtTime(epochSec: number): string {
  const p = parts(epochSec);
  return `${p.hour}:${p.minute}`;
}

/**
 * A time window as briefly as it reads unambiguously: the date is said once
 * when both ends fall on the same day.
 */
export function fmtRange(start: number | undefined, end: number | undefined, lang: Lang = "ru"): string {
  if (start && end) {
    const sameDay = fmtDateTime(start).slice(0, 5) === fmtDateTime(end).slice(0, 5);
    return `${fmtDateTime(start)} – ${sameDay ? fmtTime(end) : fmtDateTime(end)}`;
  }
  if (start) return t(lang).from(fmtDateTime(start));
  if (end) return t(lang).until(fmtDateTime(end));
  return "";
}

/** "1 ч 20 мин" — for lags and durations in /status. */
export function fmtDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h && m) return `${h} ч ${m} мин`;
  if (h) return `${h} ч`;
  if (m) return `${m} мин`;
  return `${s} с`;
}

/**
 * Georgian month names by stem. Dates come in several cases — "9 ოქტომბერს",
 * "29 სექტემბრის", "28 სექტემბერი" — and the stem is what they share.
 */
const KA_MONTHS = ["იანვ", "თებ", "მარტ", "აპრ", "მაის", "ივნ", "ივლ", "აგვ", "სექტ", "ოქტ", "ნოემ", "დეკ"];

export function kaMonth(word: string): number | undefined {
  const i = KA_MONTHS.findIndex((stem) => word.startsWith(stem));
  return i === -1 ? undefined : i + 1;
}

/**
 * The year for a day-and-month with no year, given when it was published:
 * a notice from late December about "5 January" means next year.
 */
export function yearFor(month: number, publishedAt: number): number {
  const [y, m] = tbilisiDate(publishedAt);
  return month + 6 < m ? y + 1 : y;
}

/**
 * Every "<day> <month> [HH:MM]" in a Georgian text, in order. TE writes
 * "29 სექტემბრის 11:30 სთ-დან 30 სექტემბრის 14:00 სთ-მდე". A date with no time
 * after it is skipped: "26 მაისის" is also the name of a street.
 */
export function kaDateTimes(text: string, publishedAt: number): number[] {
  const out: number[] = [];
  const re = /(\d{1,2})\s+([ა-ჿ]+)\s+(\d{1,2})\s*:\s*(\d{2})/g;
  for (const m of text.matchAll(re)) {
    const month = kaMonth(m[2]!);
    if (!month) continue;
    const day = +m[1]!;
    out.push(tbilisiEpoch(yearFor(month, publishedAt), month, day, +m[3]!, +m[4]!));
  }
  return out;
}

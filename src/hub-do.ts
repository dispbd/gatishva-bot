// The Hub: the one Durable Object that holds all state and runs the poll loop.
//
// Why one object and an alarm rather than a cron calling a stateless Worker:
//   - a cron fires at most once a minute, and on the free plan a Worker run may
//     make only 50 outgoing requests. The alarm re-arms itself for whenever the
//     next source is due or the outbox has work, and every alarm run gets its
//     own request budget — so a big fan-out is sent in slices a second apart
//     instead of being cut off.
//   - polling and subscribing touch the same tables. Inside a Durable Object
//     SQLite calls are synchronous, so a whole diff runs without an `await` in
//     the middle and nothing can interleave with it.
//
// The flow on every alarm:  poll due sources → diff → outbox → drain → re-arm.
import { DurableObject } from "cloudflare:workers";
import { SOURCES, sourceByName } from "./sources/index.ts";
import { matchOutage, streetSub, citySub, citySkel, learnedDistrict, DEFAULT_CITY } from "./match.ts";
import type { Sub } from "./match.ts";
import { renderOutage, UTILITY_ICON } from "./render.ts";
import { fingerprint, isCurrent, currentUntil, sha256, median, MISSES_TO_FINISH } from "./diff.ts";
import { findKeys, translit } from "./georgian.ts";
import { tg, describe, isChatGone, isNotModified, TelegramError, escapeHtml } from "./telegram.ts";
import { nowSec, fmtDuration, fmtDateTime, TBILISI_OFFSET_SEC } from "./time.ts";
import { UTILITIES } from "./types.ts";
import type { Outage, Utility, SourceDef, GwpPath } from "./types.ts";
import type { RelayResult } from "./gwp-relay-do.ts";
import { t, isLang } from "./i18n.ts";
import type { Lang } from "./i18n.ts";

/** Telegram calls per alarm run: the free plan allows 50 subrequests, polls take the rest. */
const SENDS_PER_RUN = 30;
/** A source failing this many times in a row is worth a message to the operator. */
const ALERT_AFTER_FAILURES = 10;
/** Forget outages nobody has seen for this long. */
const KEEP_EVENTS_SEC = 30 * 86400;
/** Runaway guard, not a quota: "as many streets as you like" is the promise. */
export const MAX_SUBS_PER_CHAT = 200;
/** A relay that failed this many times in a row is replaced. */
const RELAY_FAILURES_TO_MOVE = 3;
/** Candidates created at once when looking for a relay that reaches GWP. */
const RELAY_CANDIDATES = 4;

type Op = "new" | "edit" | "finished" | "repeat";

interface EventRow {
  key: string;
  source: string;
  fp: string;
  data: string;
  first_seen: number;
  published_at: number | null;
  missing: number;
  finished_at: number | null;
}

interface SourceRow {
  name: string;
  hash: string | null;
  next_at: number;
  last_ok: number | null;
  last_err: string | null;
  err_count: number;
  baseline: number;
  alerted: number;
  items: number | null;
}

export interface ChatInfo {
  id: number;
  type: string;
  title?: string;
}

export interface AddResult {
  ok: boolean;
  /** Why not, when !ok; the bot words it in the chat's language. */
  error?: "too_short" | "too_many";
  /** The subscription count, for "too_many". */
  count?: number;
  sub?: Sub;
  /** Current outages matching it, queued to be sent right away. */
  current: number;
  /** A few recent addresses it matched, as published (Georgian), as proof it will work. */
  examples: string[];
  /** The districts this street is known to be in, Georgian; empty when unknown. */
  districts: string[];
}

export class Hub extends DurableObject<Env> {
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS chats (
        id INTEGER PRIMARY KEY, type TEXT, title TEXT,
        utilities TEXT NOT NULL DEFAULT 'water,power,gas', created INTEGER);
      CREATE TABLE IF NOT EXISTS subs (
        id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id INTEGER NOT NULL, kind TEXT NOT NULL,
        city TEXT NOT NULL, label TEXT NOT NULL, keys TEXT NOT NULL, created INTEGER,
        UNIQUE (chat_id, kind, city, keys));
      CREATE INDEX IF NOT EXISTS subs_by_chat ON subs (chat_id);
      CREATE TABLE IF NOT EXISTS sources (
        name TEXT PRIMARY KEY, hash TEXT, next_at INTEGER NOT NULL DEFAULT 0, last_ok INTEGER,
        last_err TEXT, err_count INTEGER NOT NULL DEFAULT 0, baseline INTEGER NOT NULL DEFAULT 0,
        alerted INTEGER NOT NULL DEFAULT 0, items INTEGER);
      CREATE TABLE IF NOT EXISTS events (
        key TEXT PRIMARY KEY, source TEXT NOT NULL, city TEXT, fp TEXT NOT NULL, data TEXT NOT NULL,
        first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL, published_at INTEGER,
        missing INTEGER NOT NULL DEFAULT 0, finished_at INTEGER);
      CREATE TABLE IF NOT EXISTS sent (
        key TEXT NOT NULL, chat_id INTEGER NOT NULL, message_id INTEGER NOT NULL,
        PRIMARY KEY (key, chat_id));
      CREATE TABLE IF NOT EXISTS outbox (
        id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id INTEGER NOT NULL, key TEXT NOT NULL,
        op TEXT NOT NULL, tries INTEGER NOT NULL DEFAULT 0, UNIQUE (chat_id, key, op));
      CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
      CREATE TABLE IF NOT EXISTS sub_districts (
        sub_id INTEGER NOT NULL, district TEXT NOT NULL, manual INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (sub_id, district));
    `);
    // Added after launch. `first_read` marks what a source already held when the
    // bot first read it: an archive, "seen" only because the bot was switched on,
    // which has no place in a statistic of how late news arrives.
    // Added later still: the chat's language. NULL for chats from before it,
    // which were all Russian-speaking, and the readers treat NULL as Russian.
    const chatColumns = this.rows<{ name: string }>(`PRAGMA table_info(chats)`).map((c) => c.name);
    if (!chatColumns.includes("lang")) this.sql.exec(`ALTER TABLE chats ADD COLUMN lang TEXT`);
    const columns = this.rows<{ name: string }>(`PRAGMA table_info(events)`).map((c) => c.name);
    if (!columns.includes("current_until")) {
      // When each outage stops being current (see currentUntil), so that /now
      // reads what is going on instead of parsing every notice the archives
      // ever held — the CMS sources never mark anything finished. Filled in
      // once for the rows from before the column.
      this.sql.exec(`ALTER TABLE events ADD COLUMN current_until INTEGER NOT NULL DEFAULT 0`);
      for (const ev of this.rows<{ key: string; source: string; data: string }>(`SELECT key, source, data FROM events`)) {
        const live = sourceByName(ev.source)?.live(ev.key) ?? false;
        this.sql.exec(
          `UPDATE events SET current_until = ? WHERE key = ?`,
          currentUntil(JSON.parse(ev.data) as Outage, live), ev.key,
        );
      }
    }
    this.sql.exec(`CREATE INDEX IF NOT EXISTS events_current ON events (current_until)`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS events_city_current ON events (city, current_until)`);
    if (!columns.includes("first_read")) {
      this.sql.exec(`ALTER TABLE events ADD COLUMN first_read INTEGER NOT NULL DEFAULT 0`);
      // Rows from before the column existed: a first read stamps a whole batch
      // with the same instant, the earliest the source has.
      this.sql.exec(
        `UPDATE events SET first_read = 1
         WHERE first_seen = (SELECT MIN(e.first_seen) FROM events e WHERE e.source = events.source)`,
      );
    }
  }

  private rows<T>(query: string, ...binds: (string | number | null)[]): T[] {
    return this.sql.exec(query, ...binds).toArray() as T[];
  }

  // --- the loop --------------------------------------------------------------

  async alarm(): Promise<void> {
    const now = nowSec();
    this.backfillDistricts();
    try {
      await this.pollDue(now);
    } catch (e) {
      console.error(`poll failed: ${describe(e)}`);
    }
    let retryAt: number | undefined;
    try {
      retryAt = await this.drain();
    } catch (e) {
      console.error(`drain failed: ${describe(e)}`);
    }
    this.housekeeping(now);
    await this.schedule(retryAt);
  }

  /** Called by the cron: re-arm the alarm if it was ever lost. */
  async ensureAlarm(): Promise<void> {
    const at = await this.ctx.storage.getAlarm();
    if (at === null || at < Date.now() - 60_000) await this.schedule();
  }

  private async schedule(retryAt?: number): Promise<void> {
    const now = nowSec();
    const due = SOURCES.map((s) => this.sourceRow(s.name).next_at);
    let next = Math.min(...due);
    const pending = this.rows<{ n: number }>(`SELECT COUNT(*) AS n FROM outbox`)[0]?.n ?? 0;
    if (pending) next = Math.min(next, retryAt ?? now + 1);
    await this.ctx.storage.setAlarm(Math.max(next, now + 1) * 1000);
  }

  // --- GWP through a relay in Madrid (see src/gwp-relay-do.ts) ---------------

  /** One hunt at a time: gwp and gwp-plan are polled in the same run. */
  private hunting: Promise<RelayResult & { name?: string }> | undefined;

  private meta(k: string): string | undefined {
    return this.rows<{ v: string }>(`SELECT v FROM meta WHERE k = ?`, k)[0]?.v;
  }

  private setMeta(k: string, v: string): void {
    this.sql.exec(`INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)`, k, v);
  }

  private relay(name: string, hint?: DurableObjectLocationHint) {
    const id = this.env.GWP_RELAY.idFromName(name);
    return hint ? this.env.GWP_RELAY.get(id, { locationHint: hint }) : this.env.GWP_RELAY.get(id);
  }

  private async gwpFetch(path: GwpPath): Promise<string> {
    const name = this.meta("gwp_relay");
    let error = "no relay yet";
    if (name) {
      const r = await this.relay(name).fetchGwp(path).catch((e): RelayResult => ({ ok: false, colo: "?", error: describe(e) }));
      if (r.ok) {
        this.setMeta("gwp_relay_failures", "0");
        return r.body!;
      }
      const failures = Number(this.meta("gwp_relay_failures") ?? 0) + 1;
      this.setMeta("gwp_relay_failures", String(failures));
      error = `relay ${name} in ${r.colo}: ${r.error}`;
      // A single timeout may be GWP's own; only a pattern means the relay moved.
      if (failures < RELAY_FAILURES_TO_MOVE) throw new Error(error);
    }
    this.hunting ??= this.huntRelay(path).finally(() => (this.hunting = undefined));
    const found = await this.hunting;
    if (!found.ok || !found.name) throw new Error(`${error}; no new relay reached GWP (${found.error})`);
    // The hunt fetched whatever path its starter asked for; a concurrent caller
    // wanting the other path asks the new relay directly.
    if (found.body !== undefined && this.meta("gwp_relay_hunt_path") === path) return found.body;
    const r = await this.relay(found.name).fetchGwp(path);
    if (!r.ok) throw new Error(`new relay ${found.name} in ${r.colo}: ${r.error}`);
    return r.body!;
  }

  /**
   * Create relays in western Europe until one reaches GWP. Unused candidates
   * hold no storage, so abandoning them costs nothing.
   */
  private async huntRelay(path: GwpPath): Promise<RelayResult & { name?: string }> {
    this.setMeta("gwp_relay_hunt_path", path);
    const stamp = Date.now().toString(36);
    const names = [...Array(RELAY_CANDIDATES)].map((_, i) => `gwp-${stamp}-${i}`);
    const results = await Promise.all(
      names.map((n) =>
        this.relay(n, "weur").fetchGwp(path).catch((e): RelayResult => ({ ok: false, colo: "?", error: describe(e) })),
      ),
    );
    const seen = results.map((r) => r.colo).join(", ");
    const i = results.findIndex((r) => r.ok);
    if (i === -1) {
      console.warn(`[gwp] no relay reached GWP; candidates landed in ${seen}`);
      return { ok: false, colo: "", error: `candidates landed in ${seen}` };
    }
    const name = names[i]!;
    this.setMeta("gwp_relay", name);
    this.setMeta("gwp_relay_colo", results[i]!.colo);
    this.setMeta("gwp_relay_failures", "0");
    console.log(`[gwp] relay is now ${name} in ${results[i]!.colo} (candidates: ${seen})`);
    return { ...results[i]!, name };
  }

  private sourceRow(name: string): SourceRow {
    const row = this.rows<SourceRow>(`SELECT * FROM sources WHERE name = ?`, name)[0];
    if (row) return row;
    this.sql.exec(`INSERT INTO sources (name) VALUES (?)`, name);
    return this.rows<SourceRow>(`SELECT * FROM sources WHERE name = ?`, name)[0]!;
  }

  private async pollDue(now: number): Promise<void> {
    const due = SOURCES.filter((s) => this.sourceRow(s.name).next_at <= now);
    // Claim the slot before fetching, so a failing source waits its turn too.
    for (const s of due) this.sql.exec(`UPDATE sources SET next_at = ? WHERE name = ?`, now + s.everySec, s.name);
    const results = await Promise.allSettled(due.map((s) => s.fetchRaw({ gwp: (path) => this.gwpFetch(path) })));
    for (let i = 0; i < due.length; i++) {
      const s = due[i]!;
      const r = results[i]!;
      if (r.status === "fulfilled") await this.ingest(s, r.value, now);
      else await this.failed(s, describe(r.reason));
    }
  }

  private async ingest(source: SourceDef, raw: string, now: number): Promise<void> {
    const hash = await sha256(raw);
    const row = this.sourceRow(source.name);
    if (row.hash === hash) {
      this.sql.exec(`UPDATE sources SET last_ok = ?, err_count = 0, last_err = NULL WHERE name = ?`, now, source.name);
      if (row.alerted) await this.recovered(source.name);
      return;
    }
    let outages: Outage[];
    try {
      outages = source.parse(raw, now);
    } catch (e) {
      // The provider changed its format. Keep the old hash so the next poll
      // tries again, and let the failure counter raise the alarm.
      return await this.failed(source, `parse: ${describe(e)}`);
    }
    // Everything from here to the end is synchronous: one atomic diff.
    const queued = this.diff(source, outages, now, row.baseline === 0);
    console.log(`[${source.name}] changed: ${outages.length} items, ${queued} messages queued${row.baseline ? "" : " (first read, nothing sent)"}`);
    this.sql.exec(
      `UPDATE sources SET hash = ?, last_ok = ?, err_count = 0, last_err = NULL, baseline = 1, items = ? WHERE name = ?`,
      hash, now, outages.length, source.name,
    );
    if (row.alerted) await this.recovered(source.name);
  }

  /**
   * Compare a fresh list with what is stored. On the very first read of a
   * source nothing is sent — its whole archive would otherwise arrive at once.
   */
  private diff(source: SourceDef, outages: Outage[], now: number, firstRead: boolean): number {
    let queued = 0;
    const subs = this.allSubs();
    const utilitiesOf = this.utilitiesLookup();
    const seen = new Set<string>();
    for (const o of outages) {
      seen.add(o.key);
      const fp = fingerprint(o);
      const prev = this.rows<EventRow>(`SELECT * FROM events WHERE key = ?`, o.key)[0];
      if (!prev) {
        this.sql.exec(
          `INSERT INTO events (key, source, city, fp, data, first_seen, last_seen, published_at, first_read, current_until)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          o.key, source.name, o.city, fp, JSON.stringify(o), now, now, o.publishedAt ?? null, firstRead ? 1 : 0,
          currentUntil(o, source.live(o.key)),
        );
        // Even an archive teaches where streets are, so this runs on a first read too.
        this.learnDistricts(o, subs);
        if (!firstRead && isCurrent(o, now, source.live(o.key))) queued += this.queueMatches(o, subs, utilitiesOf, "new");
        continue;
      }
      // Back on a live list after being called over: it is not over after all.
      this.sql.exec(`UPDATE events SET last_seen = ?, missing = 0, finished_at = NULL WHERE key = ?`, now, o.key);
      if (prev.fp === fp && prev.finished_at === null) continue;
      this.sql.exec(
        `UPDATE events SET fp = ?, data = ?, current_until = ? WHERE key = ?`,
        fp, JSON.stringify(o), currentUntil(o, source.live(o.key)), o.key,
      );
      this.learnDistricts(o, subs);
      for (const s of this.rows<{ chat_id: number }>(`SELECT chat_id FROM sent WHERE key = ?`, o.key)) {
        this.enqueue(s.chat_id, o.key, "edit");
      }
      // A notice that grew a street may now concern someone it did not before.
      if (isCurrent(o, now, source.live(o.key))) queued += this.queueMatches(o, subs, utilitiesOf, "new");
    }

    // Live items that vanished: the provider says it is over.
    const open = this.rows<EventRow>(
      `SELECT key, missing FROM events WHERE source = ? AND finished_at IS NULL`, source.name,
    );
    for (const ev of open) {
      if (seen.has(ev.key) || !source.live(ev.key)) continue;
      if (ev.missing + 1 < MISSES_TO_FINISH) {
        this.sql.exec(`UPDATE events SET missing = missing + 1 WHERE key = ?`, ev.key);
        continue;
      }
      this.sql.exec(`UPDATE events SET finished_at = ?, missing = missing + 1 WHERE key = ?`, now, ev.key);
      for (const s of this.rows<{ chat_id: number }>(`SELECT chat_id FROM sent WHERE key = ?`, ev.key)) {
        this.enqueue(s.chat_id, ev.key, "finished");
      }
    }
    return queued;
  }

  /**
   * Remember which district each subscribed street was listed under. A fault
   * that cuts a whole district names no streets, and this is how its notice
   * still reaches them. `subs` is updated in place, so a notice later in the
   * same poll already benefits.
   */
  private learnDistricts(o: Outage, subs: Sub[]): void {
    for (const sub of subs) {
      const district = learnedDistrict(o, sub);
      if (!district || sub.districts?.includes(district)) continue;
      this.sql.exec(`INSERT OR IGNORE INTO sub_districts (sub_id, district) VALUES (?, ?)`, sub.id, district);
      (sub.districts ??= []).push(district);
    }
  }

  /**
   * Once: teach the subscriptions that existed before districts were learned
   * everything the stored notices know.
   */
  private backfillDistricts(): void {
    if (this.meta("districts_learned")) return;
    const subs = this.allSubs();
    for (const ev of this.rows<{ data: string }>(`SELECT data FROM events`)) {
      this.learnDistricts(JSON.parse(ev.data) as Outage, subs);
    }
    this.setMeta("districts_learned", String(nowSec()));
  }

  private queueMatches(o: Outage, subs: Sub[], utilitiesOf: (id: number) => Utility[], op: Op): number {
    let n = 0;
    for (const chatId of matchOutage(o, subs, utilitiesOf).keys()) {
      const already = this.rows(`SELECT 1 FROM sent WHERE key = ? AND chat_id = ?`, o.key, chatId).length > 0;
      if (already && op === "new") continue;
      this.enqueue(chatId, o.key, op);
      n++;
    }
    return n;
  }

  private enqueue(chatId: number, key: string, op: Op): void {
    this.sql.exec(`INSERT OR IGNORE INTO outbox (chat_id, key, op) VALUES (?, ?, ?)`, chatId, key, op);
  }

  // --- sending ---------------------------------------------------------------

  /** Send what the outbox holds, up to the run's budget. Returns when to resume if Telegram said to wait. */
  private async drain(): Promise<number | undefined> {
    const batch = this.rows<{ id: number; chat_id: number; key: string; op: Op; tries: number }>(
      `SELECT * FROM outbox ORDER BY id LIMIT ?`, SENDS_PER_RUN,
    );
    let stumbled = false;
    for (const job of batch) {
      try {
        await this.deliver(job.chat_id, job.key, job.op);
        this.sql.exec(`DELETE FROM outbox WHERE id = ?`, job.id);
      } catch (e) {
        if (e instanceof TelegramError && e.retryAfter) {
          return nowSec() + e.retryAfter;
        }
        if (isChatGone(e)) {
          console.log(`chat ${job.chat_id} is gone (${describe(e)}); dropping it`);
          this.forgetChat(job.chat_id);
          continue;
        }
        console.warn(`delivery ${job.op} ${job.key} → ${job.chat_id} failed: ${describe(e)}`);
        stumbled = true;
        if (job.tries + 1 >= 5) this.sql.exec(`DELETE FROM outbox WHERE id = ?`, job.id);
        else this.sql.exec(`UPDATE outbox SET tries = tries + 1 WHERE id = ?`, job.id);
      }
    }
    // Something went wrong that Telegram did not put a number on: give it half
    // a minute rather than spending all five tries in five seconds.
    return stumbled ? nowSec() + 30 : undefined;
  }

  private async deliver(chatId: number, key: string, op: Op): Promise<void> {
    const ev = this.rows<EventRow>(`SELECT * FROM events WHERE key = ?`, key)[0];
    if (!ev) return;
    const o = JSON.parse(ev.data) as Outage;
    const subs = this.subsOf(chatId);
    const mine = matchOutage(o, subs, () => UTILITIES).get(chatId) ?? [];
    // Unsubscribed since it was queued: a new message would be a surprise.
    if (mine.length === 0 && (op === "new" || op === "repeat")) return;
    const lang = this.langOf(chatId);
    const text = renderOutage(o, mine, { finished: ev.finished_at !== null, lang });
    const sent = this.rows<{ message_id: number }>(
      `SELECT message_id FROM sent WHERE key = ? AND chat_id = ?`, key, chatId,
    )[0];

    if (op === "new" || op === "repeat") {
      const msg = await tg<{ message_id: number }>(this.env, "sendMessage", {
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
        // Planned works a day ahead do not need to buzz anyone's phone at night.
        disable_notification: !o.emergency && !!o.start && o.start - nowSec() > 12 * 3600,
      });
      this.sql.exec(
        `INSERT OR REPLACE INTO sent (key, chat_id, message_id) VALUES (?, ?, ?)`, key, chatId, msg.message_id,
      );
      return;
    }

    if (!sent) return; // an edit or an ending of something this chat was never told about
    try {
      await tg(this.env, "editMessageText", {
        chat_id: chatId,
        message_id: sent.message_id,
        text,
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      });
    } catch (e) {
      if (!isNotModified(e) && !/message to edit not found|can't be edited/i.test(describe(e))) throw e;
    }
    if (op === "finished") {
      await tg(this.env, "sendMessage", {
        chat_id: chatId,
        text: t(lang).finishedReply(UTILITY_ICON[o.utility], escapeHtml(o.provider)),
        parse_mode: "HTML",
        disable_notification: true,
        reply_parameters: { message_id: sent.message_id, allow_sending_without_reply: true },
      });
    }
  }

  private forgetChat(chatId: number): void {
    this.sql.exec(`DELETE FROM sub_districts WHERE sub_id IN (SELECT id FROM subs WHERE chat_id = ?)`, chatId);
    this.sql.exec(`DELETE FROM subs WHERE chat_id = ?`, chatId);
    this.sql.exec(`DELETE FROM outbox WHERE chat_id = ?`, chatId);
    this.sql.exec(`DELETE FROM sent WHERE chat_id = ?`, chatId);
    this.sql.exec(`DELETE FROM chats WHERE id = ?`, chatId);
  }

  // --- operator alerts -------------------------------------------------------

  private async failed(source: SourceDef, error: string): Promise<void> {
    console.warn(`[${source.name}] ${error}`);
    this.sql.exec(
      `UPDATE sources SET err_count = err_count + 1, last_err = ? WHERE name = ?`, error.slice(0, 300), source.name,
    );
    const row = this.sourceRow(source.name);
    if (row.err_count >= ALERT_AFTER_FAILURES && !row.alerted) {
      this.sql.exec(`UPDATE sources SET alerted = 1 WHERE name = ?`, source.name);
      await this.alert(`⚠️ Источник <b>${escapeHtml(source.name)}</b> не отвечает ${row.err_count} раз подряд:\n<code>${escapeHtml(error.slice(0, 300))}</code>`);
    }
  }

  private async recovered(name: string): Promise<void> {
    this.sql.exec(`UPDATE sources SET alerted = 0 WHERE name = ?`, name);
    await this.alert(`✅ Источник <b>${escapeHtml(name)}</b> снова в порядке.`);
  }

  private async alert(html: string): Promise<void> {
    if (!this.env.TELEGRAM_ALERT_CHAT_ID) return;
    try {
      await tg(this.env, "sendMessage", { chat_id: this.env.TELEGRAM_ALERT_CHAT_ID, text: html, parse_mode: "HTML" });
    } catch (e) {
      console.warn(`alert failed: ${describe(e)}`);
    }
  }

  /** Hourly: forget outages long gone, and what was sent about them. */
  private housekeeping(now: number): void {
    const last = Number(this.rows<{ v: string }>(`SELECT v FROM meta WHERE k = 'gc'`)[0]?.v ?? 0);
    if (now - last < 3600) return;
    const cutoff = now - KEEP_EVENTS_SEC;
    this.sql.exec(`DELETE FROM sent WHERE key IN (SELECT key FROM events WHERE last_seen < ?)`, cutoff);
    this.sql.exec(`DELETE FROM events WHERE last_seen < ?`, cutoff);
    this.sql.exec(`INSERT OR REPLACE INTO meta (k, v) VALUES ('gc', ?)`, String(now));
  }

  // --- subscriptions (called from the webhook) --------------------------------

  private allSubs(): Sub[] {
    type Row = { id: number; chat_id: number; kind: "street" | "city"; city: string; label: string; keys: string; districts: string | null };
    return this.rows<Row>(
      `SELECT s.*, (SELECT group_concat(district, '|') FROM sub_districts d WHERE d.sub_id = s.id) AS districts FROM subs s`,
    ).map((r) => ({
      id: r.id,
      chatId: r.chat_id,
      kind: r.kind,
      city: r.city,
      label: r.label,
      keys: JSON.parse(r.keys),
      districts: r.districts ? r.districts.split("|") : [],
    }));
  }

  subsOf(chatId: number): Sub[] {
    return this.allSubs().filter((s) => s.chatId === chatId);
  }

  private utilitiesLookup(): (chatId: number) => Utility[] {
    const map = new Map<number, Utility[]>();
    for (const r of this.rows<{ id: number; utilities: string }>(`SELECT id, utilities FROM chats`)) {
      map.set(r.id, r.utilities.split(",").filter(Boolean) as Utility[]);
    }
    return (id) => map.get(id) ?? UTILITIES;
  }

  touchChat(chat: ChatInfo): void {
    this.sql.exec(
      `INSERT INTO chats (id, type, title, created) VALUES (?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET type = excluded.type, title = excluded.title`,
      chat.id, chat.type, chat.title ?? null, nowSec(),
    );
  }

  /**
   * The chat's language. A chat seen for the first time takes `hint` — its
   * first user's Telegram language — and keeps it until /lang says otherwise.
   */
  chatLang(chat: ChatInfo, hint: Lang): Lang {
    this.sql.exec(
      `INSERT INTO chats (id, type, title, created, lang) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET type = excluded.type, title = excluded.title`,
      chat.id, chat.type, chat.title ?? null, nowSec(), hint,
    );
    return this.langOf(chat.id);
  }

  setLang(chatId: number, lang: Lang): void {
    this.sql.exec(
      `INSERT INTO chats (id, created, lang) VALUES (?, ?, ?) ON CONFLICT (id) DO UPDATE SET lang = excluded.lang`,
      chatId, nowSec(), lang,
    );
  }

  private langOf(chatId: number): Lang {
    const lang = this.rows<{ lang: string | null }>(`SELECT lang FROM chats WHERE id = ?`, chatId)[0]?.lang;
    return isLang(lang) ? lang : "ru";
  }

  utilities(chatId: number): Utility[] {
    return this.utilitiesLookup()(chatId);
  }

  toggleUtility(chatId: number, u: Utility): Utility[] {
    const have = new Set(this.utilities(chatId));
    if (have.has(u)) have.delete(u);
    else have.add(u);
    const list = UTILITIES.filter((x) => have.has(x));
    this.sql.exec(
      `INSERT INTO chats (id, utilities, created) VALUES (?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET utilities = excluded.utilities`,
      chatId, list.join(","), nowSec(),
    );
    return list;
  }

  /** Cities seen in the data so far, Georgian. */
  knownCities(): string[] {
    return this.rows<{ city: string }>(`SELECT DISTINCT city FROM events WHERE city IS NOT NULL`).map((r) => r.city);
  }

  /** `district`, when given, is the subscriber's own word on where the street is. */
  async addStreet(chat: ChatInfo, label: string, city = DEFAULT_CITY, district?: string): Promise<AddResult> {
    const sub = streetSub(label, city);
    if (sub.keys.length === 0) {
      return { ok: false, error: "too_short", current: 0, examples: [], districts: [] };
    }
    // Outside Tbilisi the city is part of what the subscriber reads back in /list.
    if (city !== DEFAULT_CITY) sub.label = `${translit(city, this.langOf(chat.id))}, ${sub.label}`;
    return this.add(chat, sub, district);
  }

  async addCity(chat: ChatInfo, city: string): Promise<AddResult> {
    return this.add(chat, citySub(city));
  }

  private async add(chat: ChatInfo, fresh: Omit<Sub, "id" | "chatId">, district?: string): Promise<AddResult> {
    this.touchChat(chat);
    const count = this.rows<{ n: number }>(`SELECT COUNT(*) AS n FROM subs WHERE chat_id = ?`, chat.id)[0]?.n ?? 0;
    if (count >= MAX_SUBS_PER_CHAT) {
      return { ok: false, error: "too_many", count, current: 0, examples: [], districts: [] };
    }
    this.sql.exec(
      `INSERT OR IGNORE INTO subs (chat_id, kind, city, label, keys, created) VALUES (?, ?, ?, ?, ?, ?)`,
      chat.id, fresh.kind, fresh.city, fresh.label, JSON.stringify(fresh.keys), nowSec(),
    );
    const sub = this.subsOf(chat.id).find(
      (s) => s.kind === fresh.kind && s.city === fresh.city && JSON.stringify(s.keys) === JSON.stringify(fresh.keys),
    )!;
    if (district) {
      this.sql.exec(
        `INSERT OR REPLACE INTO sub_districts (sub_id, district, manual) VALUES (?, ?, 1)`, sub.id, district,
      );
      if (!sub.districts?.includes(district)) (sub.districts ??= []).push(district);
    }

    // Learn where the street is from everything stored first, so that a
    // district-wide outage happening right now is found below as well.
    const events = this.rows<EventRow>(`SELECT * FROM events ORDER BY first_seen DESC`).map((ev) => ({
      ev,
      o: JSON.parse(ev.data) as Outage,
    }));
    for (const { o } of events) this.learnDistricts(o, [sub]);

    // Prove it works: recent addresses it would have matched, and anything
    // happening right now goes out at once instead of at the next change.
    const now = nowSec();
    const examples = new Set<string>();
    let current = 0;
    const utilitiesOf = this.utilitiesLookup();
    for (const { ev, o } of events) {
      if (!matchOutage(o, [sub], () => UTILITIES).size) continue;
      if (sub.kind === "street" && examples.size < 3) {
        const hit = o.addresses.find((a) => findKeys(a, sub.keys).length);
        if (hit) examples.add(hit);
      }
      const source = sourceByName(ev.source);
      if (
        ev.finished_at === null && source && isCurrent(o, now, source.live(o.key)) &&
        utilitiesOf(chat.id).includes(o.utility) && current < 10
      ) {
        if (this.rows(`SELECT 1 FROM sent WHERE key = ? AND chat_id = ?`, o.key, chat.id).length === 0) {
          this.enqueue(chat.id, o.key, "new");
          current++;
        }
      }
    }
    if (current) await this.schedule(nowSec());
    return { ok: true, sub, current, examples: [...examples], districts: sub.districts ?? [] };
  }

  removeSub(chatId: number, id: number): boolean {
    const before = this.subsOf(chatId).length;
    this.sql.exec(`DELETE FROM sub_districts WHERE sub_id = (SELECT id FROM subs WHERE chat_id = ? AND id = ?)`, chatId, id);
    this.sql.exec(`DELETE FROM subs WHERE chat_id = ? AND id = ?`, chatId, id);
    return this.subsOf(chatId).length < before;
  }

  /** /now: re-send every current outage that concerns the chat. */
  async current(chatId: number): Promise<number> {
    const now = nowSec();
    const subs = this.subsOf(chatId);
    if (subs.length === 0) return 0;
    const utilitiesOf = this.utilitiesLookup();
    let n = 0;
    // Only what is current, by the index, and only in the chat's cities. The
    // regions alone keep a couple of hundred planned works current days ahead;
    // a chat that follows Tbilisi should not parse every one of them.
    const wanted = new Set(subs.map((s) => s.city));
    const cities = this.rows<{ city: string }>(
      `SELECT DISTINCT city FROM events WHERE current_until > ? AND finished_at IS NULL`, now,
    )
      .map((r) => r.city)
      .filter((c) => wanted.has(citySkel(c)));
    if (cities.length === 0) return 0;
    const rows = this.rows<EventRow>(
      `SELECT * FROM events WHERE current_until > ? AND finished_at IS NULL
         AND city IN (${cities.map(() => "?").join(", ")}) ORDER BY first_seen`,
      now, ...cities,
    );
    for (const ev of rows) {
      const o = JSON.parse(ev.data) as Outage;
      if (!matchOutage(o, subs, utilitiesOf).has(chatId)) continue;
      this.enqueue(chatId, o.key, "repeat");
      if (++n >= 15) break;
    }
    if (n) await this.schedule(nowSec());
    return n;
  }

  // --- /status for the operator ----------------------------------------------

  status(): string {
    const now = nowSec();
    const lines = ["<b>Источники</b>"];
    const relay = this.meta("gwp_relay");
    lines.push(relay ? `GWP через ${this.meta("gwp_relay_colo")} (${relay})` : "GWP: ретранслятор ещё не найден");
    for (const s of SOURCES) {
      const r = this.sourceRow(s.name);
      const ok = r.last_ok ? `${fmtDuration(now - r.last_ok)} назад` : "ещё ни разу";
      const err = r.err_count ? ` · ❌ ${r.err_count}: ${escapeHtml((r.last_err ?? "").slice(0, 80))}` : "";
      lines.push(`• <code>${s.name}</code> каждые ${s.everySec} с · ок ${ok} · ${r.items ?? "?"} шт.${err}`);
    }
    // How late we learn of things: our first sighting minus the provider's own
    // publication time, over the last week. This is the provider's delay plus
    // our polling interval, and the number that answers "why so late?". Left
    // out: whatever the first read found (an archive, not news), and dates with
    // no time of day — te.ge's "28 სექტემბერი" would count from midnight.
    const week = this.rows<{ source: string; lag: number }>(
      `SELECT source, first_seen - published_at AS lag FROM events
       WHERE published_at IS NOT NULL AND first_read = 0 AND first_seen > ?
         AND (published_at + ?) % 86400 != 0
         AND first_seen - published_at BETWEEN -60 AND 86400`,
      now - 7 * 86400,
      TBILISI_OFFSET_SEC,
    );
    const bySource = new Map<string, number[]>();
    for (const r of week) bySource.set(r.source, [...(bySource.get(r.source) ?? []), r.lag]);
    if (bySource.size) {
      lines.push("", "<b>Задержка «опубликовано → увидели» за неделю (медиана)</b>");
      for (const [src, lags] of bySource) lines.push(`• <code>${src}</code>: ${fmtDuration(median(lags)!)} (n=${lags.length})`);
    }
    const counts = this.rows<{ chats: number; subs: number; outbox: number; events: number }>(
      `SELECT (SELECT COUNT(*) FROM chats) AS chats, (SELECT COUNT(*) FROM subs) AS subs,
              (SELECT COUNT(*) FROM outbox) AS outbox, (SELECT COUNT(*) FROM events) AS events`,
    )[0]!;
    lines.push("", `Чатов ${counts.chats}, подписок ${counts.subs}, событий ${counts.events}, в очереди ${counts.outbox}.`);
    lines.push(`Сейчас ${fmtDateTime(now)}.`);
    return lines.join("\n");
  }

}

export function hub(env: Env): DurableObjectStub<Hub> {
  return env.HUB.get(env.HUB.idFromName("hub"));
}

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseGwp } from "../src/sources/gwp.ts";
import { parseTelasi } from "../src/sources/telasi.ts";
import { matchOutage, streetSub, citySub, fromStoredKeys } from "../src/match.ts";
import { parseSocar } from "../src/sources/regions.ts";
import { renderOutage, reasonOf, visibleLength } from "../src/render.ts";
import { isCurrent } from "../src/diff.ts";
import { splitCityStreet, resolveCity } from "../src/cities.ts";
import { tbilisiEpoch } from "../src/time.ts";

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const NOW = tbilisiEpoch(2026, 10, 8, 3, 0);
const ALL = () => ["water", "power", "gas"];
const sub = (id, chatId, s) => ({ id, chatId, ...s });

const gwp = parseGwp(fixture("gwp.json"), "gwp", NOW);
const telasi = parseTelasi(fixture("telasi.json"), NOW);
const mtatsminda = gwp.find((o) => o.key === "gwp:GWP-REQ-1301661");

test("an outage reaches the chats whose street it names, and only those", () => {
  const subs = [
    sub(1, 10, streetSub("Жвания")),
    sub(2, 20, streetSub("Политковская")),
    sub(3, 30, citySub("Тбилиси")),
    sub(4, 40, streetSub("Батуми, Жвания".split(", ")[1], "ბათუმი")),
  ];
  const hit = matchOutage(mtatsminda, subs, ALL);
  assert.deepEqual([...hit.keys()].sort(), [10, 30]);
});

test("a chat that turned water off hears nothing about water", () => {
  const subs = [sub(1, 10, streetSub("Жвания"))];
  assert.equal(matchOutage(mtatsminda, subs, () => ["power", "gas"]).size, 0);
});

test("the message leads with the reader's street, bold, in Russian", () => {
  const html = renderOutage(mtatsminda, [sub(1, 10, streetSub("Жвания"))]);
  const lines = html.split("\n");
  assert.equal(lines[0], "💧 <b>Вода · Тбилиси, Мтацминда</b>");
  assert.equal(lines[1], "⚠️ Аварийное · повреждение сети");
  assert.equal(lines[2], "🕒 07.10 15:00 – 08.10 03:00");
  assert.equal(lines[3], "📍 <b>Зураб Жвания</b>");
  assert.match(html, /<blockquote expandable>📋 Адреса \(7\):/);
  assert.match(html, /<blockquote expandable>🇬🇪 .*<b>ჟვანიას<\/b>/);
});

test("an estimate that passed before the notice came out is called that", () => {
  const late = telasi.find((o) => o.key === "telasi:5918");
  assert.match(renderOutage(late, []), /Восстановление ожидалось к 07\.10 17:47 — раньше, чем вышло сообщение/);
});

test("a 135-street notice still fits in one Telegram message", () => {
  const big = telasi.find((o) => o.key === "telasi:5918");
  const html = renderOutage(big, [sub(1, 1, citySub("თბილისი"))]);
  assert.ok(visibleLength(html) <= 4096, `visible length ${visibleLength(html)}`);
  assert.match(html, /и ещё \d+|🇬🇪/);
});

test("the cause is read from the preamble, not from street names", () => {
  // მაჭავარიანი contains "ავარი", "accident"; the notice is about planned works.
  const planned = telasi.find((o) => o.key === "telasi:5917:1");
  assert.match(planned.text, /მაჭავარიანის/);
  assert.equal(reasonOf(planned), "срочные работы");
});

test("what counts as news", () => {
  const base = { text: "", addresses: [] };
  assert.equal(isCurrent({ ...base, end: NOW + 60 }, NOW, false), true);
  assert.equal(isCurrent({ ...base, end: NOW - 86400 }, NOW, false), false);
  // Published a minute ago with an estimate already in the past: still news.
  assert.equal(isCurrent({ ...base, end: NOW - 600, publishedAt: NOW - 60 }, NOW, false), true);
  // A live list says it is happening, whatever the times say.
  assert.equal(isCurrent({ ...base, end: NOW - 600 }, NOW, true), true);
});

test("'Батуми, Руставели' is a street in Batumi; 'Руставели' alone is in Tbilisi", () => {
  assert.deepEqual(splitCityStreet("Батуми, Руставели", []), { city: "ბათუმი", street: "Руставели" });
  assert.deepEqual(splitCityStreet("Kutaisi: Rustaveli", []), { city: "ქუთაისი", street: "Rustaveli" });
  assert.deepEqual(splitCityStreet("Руставели", []), { street: "Руставели" });
  assert.deepEqual(splitCityStreet("Политковская, 32", []), { street: "Политковская, 32" });
  assert.equal(resolveCity("Зестафони", []), "ზესტაფონი");
});

test("a notice for several districts names them all in the header", () => {
  const [o] = parseTelasi(fixture("telasi-5919.json"), NOW);
  const html = renderOutage(o, []);
  assert.equal(html.split("\n")[0], "💡 <b>Свет · Тбилиси, Сололак-Мтацминда-Крцаниси и Исани</b>");
});

test("a subscription stored before syncope matching finds the name without its vowel", () => {
  // Telasi, 7 October: "დიღმის მასივის 1 კვარტალს" — Digomi, in the genitive.
  const digomi = telasi.find((o) => o.key === "telasi:5910");
  // A row as the subs table holds it: the keys JSON, never rewritten.
  const stored = { ...streetSub("Дигоми"), ...fromStoredKeys('["digom"]') };
  assert.deepEqual([...matchOutage(digomi, [sub(1, 10, stored)], ALL).keys()], [10]);
  assert.match(renderOutage(digomi, [sub(1, 10, stored)]), /<b>დიღმის<\/b>/);

  // SOCAR in Kaspi, 20 October: "წერეთლის ქ".
  const kaspi = parseSocar(fixture("socar-2026-10-20.json")).find((o) => o.key === "socar:ac94afbe-046d-4601-a1cd-11dfe8967061");
  const tsereteli = sub(2, 20, streetSub("Церетели", "კასპი"));
  assert.deepEqual([...matchOutage(kaspi, [tsereteli], ALL).keys()], [20]);
  assert.equal(renderOutage(kaspi, [tsereteli]).split("\n")[3], "📍 <b>ул. Церетели</b>");
});

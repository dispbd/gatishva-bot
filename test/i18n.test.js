import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseGwp } from "../src/sources/gwp.ts";
import { streetSub } from "../src/match.ts";
import { renderOutage } from "../src/render.ts";
import { translitEn, addressLocal } from "../src/georgian.ts";
import { langFromTelegram, t, LANGS } from "../src/i18n.ts";
import { fmtRange, tbilisiEpoch } from "../src/time.ts";

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const NOW = tbilisiEpoch(2026, 10, 8, 3, 0);
const water = parseGwp(fixture("gwp.json"), "gwp", NOW).find((o) => o.key === "gwp:GWP-REQ-1301661");
const zhvania = [{ id: 1, chatId: 1, ...streetSub("Жвания") }];

test("a new chat starts in its first user's Telegram language", () => {
  assert.equal(langFromTelegram("ka"), "ka");
  assert.equal(langFromTelegram("ru"), "ru");
  assert.equal(langFromTelegram("uk"), "ru");
  assert.equal(langFromTelegram("en-GB"), "en");
  assert.equal(langFromTelegram("de"), "en");
  // A channel post says nothing about language.
  assert.equal(langFromTelegram(undefined), "ru");
});

test("English reads Georgian names the way Tbilisi's street signs spell them", () => {
  assert.equal(translitEn("ჭავჭავაძე"), "Chavchavadze");
  assert.equal(translitEn("წერეთელი"), "Tsereteli");
  assert.equal(translitEn("აღმაშენებელი"), "Aghmashenebeli");
  assert.equal(addressLocal("ალექსანდრე ჭავჭავაძის ქ. N 4", "en"), "Aleksandre Chavchavadze St. No. 4");
  assert.equal(addressLocal("ვაჟა-ფშაველას გამზ", "en"), "Vazha-Pshavela Ave.");
  assert.equal(addressLocal("სოფ. ნუკრიანი", "en"), "Village Nukriani");
  // Georgian readers get the address as published.
  assert.equal(addressLocal("ალექსანდრე ჭავჭავაძის ქ. N 4", "ka"), "ალექსანდრე ჭავჭავაძის ქ. N 4");
});

test("in English: the parsed fields and the addresses translated, the original underneath", () => {
  const html = renderOutage(water, zhvania, { lang: "en" });
  const lines = html.split("\n");
  assert.equal(lines[0], "💧 <b>Water · Tbilisi, Mtatsminda</b>");
  assert.equal(lines[1], "⚠️ Emergency · network damage");
  assert.equal(lines[3], "📍 <b>Zurab Zhvania</b>");
  assert.match(html, /<blockquote expandable>📋 Addresses \(7\):/);
  assert.match(html, /<blockquote expandable>🇬🇪 .*<b>ჟვანიას<\/b>/);
});

test("in Georgian the translation would be the original, so only the original is shown", () => {
  const html = renderOutage(water, zhvania, { lang: "ka" });
  assert.equal(html.split("\n")[0], "💧 <b>წყალი · თბილისი, მთაწმინდა</b>");
  assert.doesNotMatch(html, /📋/, "no address list: it would repeat the original");
  assert.doesNotMatch(html, /🇬🇪/, "the original needs no flag when it is the only text");
  assert.equal((html.match(/<blockquote/g) ?? []).length, 1);
  assert.match(html, /<blockquote expandable>მთაწმინდა, .*<b>ჟვანიას<\/b>/);
});

test("Russian stays the default for chats from before languages existed", () => {
  assert.equal(renderOutage(water, zhvania).split("\n")[0], "💧 <b>Вода · Тбилиси, Мтацминда</b>");
});

test("time windows read naturally in each language", () => {
  const at = tbilisiEpoch(2026, 10, 9, 11, 0);
  assert.equal(fmtRange(at, undefined, "ru"), "с 09.10 11:00");
  assert.equal(fmtRange(undefined, at, "en"), "until 09.10 11:00");
  assert.equal(fmtRange(at, undefined, "ka"), "09.10 11:00-დან");
});

test("every language's help names every command", () => {
  for (const lang of LANGS) {
    for (const cmd of ["/add", "/city", "/list", "/types", "/now", "/lang"]) {
      assert.ok(t(lang).help.includes(cmd), `${lang} help lacks ${cmd}`);
    }
  }
});

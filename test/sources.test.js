// Every parser against a real answer from its provider, saved on 2026-10-08.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseGwp, gwpTimes, gwpDate } from "../src/sources/gwp.ts";
import { parseTelasi, telasiEta } from "../src/sources/telasi.ts";
import { parseEnergo, parseSocar, parseUwsc, energoPlace } from "../src/sources/regions.ts";
import { teLinks, parseTeArticle } from "../src/sources/te.ts";
import { tbilisiEpoch, fmtRange } from "../src/time.ts";

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const NOW = tbilisiEpoch(2026, 10, 8, 3, 0);

test("GWP: four current outages, Georgian month-first dates", () => {
  const list = parseGwp(fixture("gwp.json"), "gwp", NOW);
  assert.equal(list.length, 4);
  const mtatsminda = list.find((o) => o.key === "gwp:GWP-REQ-1301661");
  assert.equal(mtatsminda.district, "მთაწმინდა");
  assert.equal(mtatsminda.emergency, true);
  assert.equal(fmtRange(mtatsminda.start, mtatsminda.end), "07.10 15:00 – 08.10 03:00");
  assert.equal(mtatsminda.addresses.length, 7); // "ჭავჭავაძის შესახვევებით და ჩიხებით" is one
  assert.equal(list.find((o) => o.key === "gwp:GWP-REQ-1301428").emergency, false);
});

test("GWP: an outage with only an end time", () => {
  const t = gwpTimes("დაზიანების გამო 10/8/2026 09:00 საათამდე წყალმომარაგება შეუწყდა", NOW);
  assert.equal(t.start, undefined);
  assert.equal(t.end, tbilisiEpoch(2026, 10, 8, 9, 0));
});

test("GWP: an ambiguous date is read the way that lands nearer to now", () => {
  // Month first, as GWP usually writes: around 8 October, 10/7 is the 7th of October.
  assert.equal(gwpDate(10, 7, 2026, 23, 15, NOW), tbilisiEpoch(2026, 10, 7, 23, 15));
  // Day first, as a notice of 8 October did: 8/10 is not the 10th of August.
  assert.equal(gwpDate(8, 10, 2026, 20, 0, NOW), tbilisiEpoch(2026, 10, 8, 20, 0));
  // Only one reading is a date at all.
  assert.equal(gwpDate(13, 10, 2026, 9, 0, NOW), tbilisiEpoch(2026, 10, 13, 9, 0));
});

test("Telasi: an emergency's estimate is read through the stray spaces", () => {
  assert.equal(telasiEta("აღდგენის სავარაუდო დრო: 07.10.2026 06 :20 სთ."), tbilisiEpoch(2026, 10, 7, 6, 20));
  assert.equal(telasiEta("აღდგენის სავარაუდო დრო: 07.10.2026 04: 10 სთ."), tbilisiEpoch(2026, 10, 7, 4, 10));
});

test("Telasi: emergencies carry publication time and the (often stale) estimate", () => {
  const o = parseTelasi(fixture("telasi.json"), NOW).find((x) => x.key === "telasi:5918");
  assert.equal(o.emergency, true);
  assert.equal(o.district, "ვარკეთილი");
  assert.equal(o.publishedAt, tbilisiEpoch(2026, 10, 7, 17, 54, 19));
  assert.equal(o.end, tbilisiEpoch(2026, 10, 7, 17, 47));
  assert.ok(o.end < o.publishedAt, "published seven minutes after its own estimate");
  assert.equal(o.addresses.length, 135);
});

test("Telasi: a planned notice becomes one outage per district, each with its hours", () => {
  const parts = parseTelasi(fixture("telasi.json"), NOW).filter((x) => x.key.startsWith("telasi:5917:"));
  assert.deepEqual(parts.map((p) => p.district), ["კრწანისი", "მთაწმინდა", "ისანი"]);
  assert.ok(parts.every((p) => !p.emergency));
  assert.equal(fmtRange(parts[0].start, parts[0].end), "09.10 11:00 – 18:00");
  assert.equal(fmtRange(parts[2].start, parts[2].end), "09.10 01:00 – 04:00");
  assert.ok(parts[1].addresses.includes("ყაზბეგის"));
});

test("Energo-Pro: places lose their district prefix and 'unknown' street", () => {
  assert.equal(energoPlace("გურჯაანის რ-ნი/ახაშენი/უცნობი"), "ახაშენი");
  assert.equal(energoPlace("ზესტაფონი/სტაროსელსკის"), "ზესტაფონი, სტაროსელსკის");
  const list = parseEnergo(fixture("energo.json"));
  assert.equal(list[0].city, "ზესტაფონი");
  assert.equal(list[0].emergency, false);
  assert.equal(fmtRange(list[0].start, list[0].end), "12.10 13:00 – 15:00");
});

test("SOCAR: municipality before the colon, places after", () => {
  const [o] = parseSocar(fixture("socar.json"));
  assert.equal(o.city, "სიღნაღი");
  assert.deepEqual(o.addresses, ["სოფ. ნუკრიანი"]);
  assert.equal(fmtRange(o.start, o.end), "09.10 11:00 – 16:00");
  assert.equal(o.emergency, false);
});

test("UWSC: times out of the excerpt, town stripped from each address", () => {
  const list = parseUwsc(fixture("uwsc.json"));
  const borjomi = list.find((o) => o.city === "ბორჯომი");
  assert.equal(borjomi.emergency, true);
  assert.equal(fmtRange(borjomi.start, borjomi.end), "07.10 16:50 – 22:00");
  assert.ok(borjomi.addresses.every((a) => !a.startsWith("ბორჯომი")));
});

test("Tbilisi Energy: newest post ids from the listing, times out of the prose", () => {
  assert.deepEqual(teLinks(fixture("te-list.html")).slice(0, 3).map((l) => l.id), [517, 516, 515]);
  const o = parseTeArticle(514, "https://te.ge/ka/514", fixture("te-514.html"));
  assert.equal(o.utility, "gas");
  assert.equal(o.emergency, false);
  assert.equal(fmtRange(o.start, o.end), "29.09 11:30 – 30.09 14:00");
  assert.match(o.text, /კოჯორი/);
});

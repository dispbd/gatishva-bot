import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sameStreet, reportersFor, signalOutage, confirms, REPORT_WINDOW_SEC } from "../src/reports.ts";
import { parseGwp } from "../src/sources/gwp.ts";
import { matchOutage, streetSub } from "../src/match.ts";
import { renderOutage } from "../src/render.ts";
import { tbilisiEpoch } from "../src/time.ts";

const NOW = tbilisiEpoch(2026, 10, 8, 3, 0);
const report = (userId, label, minutesAgo, utility = "water", city = "tbilisi") => ({
  userId, utility, city, label, created: NOW - minutesAgo * 60,
});

test("neighbours name one street in different scripts and words", () => {
  assert.equal(sameStreet("Политковская", "ანა პოლიტკოვსკაია"), true);
  assert.equal(sameStreet("ул. Жвания", "Zhvania"), true);
  assert.equal(sameStreet("Жвания", "Политковская"), false);
});

test("a signal needs different people, on the same street and utility, within the window", () => {
  const reports = [
    report(1, "Политковская", 5),
    report(1, "Politkovskaya", 3), // the same person again
    report(2, "პოლიტკოვსკაია", 2),
    report(3, "Политковская", 1, "power"), // another utility
    report(4, "Жвания", 1), // another street
    report(5, "Политковская", REPORT_WINDOW_SEC / 60 + 1), // too long ago
  ];
  assert.equal(reportersFor(reports, { utility: "water", city: "tbilisi", label: "Политковская" }, NOW), 2);
});

const signal = signalOutage({
  key: "report:water:tbilisi:zhvani:1",
  utility: "water",
  city: "თბილისი",
  label: "Жвания",
  count: 4,
  since: NOW - 18 * 60,
});

test("a signal reaches the street's subscribers like any outage", () => {
  const subs = [
    { id: 1, chatId: 10, ...streetSub("ზურაბ ჟვანია") },
    { id: 2, chatId: 20, ...streetSub("Политковская") },
  ];
  assert.deepEqual([...matchOutage(signal, subs, () => ["water"]).keys()], [10]);
});

test("the provider's own outage on that street confirms it", () => {
  const water = parseGwp(readFileSync(new URL("./fixtures/gwp.json", import.meta.url), "utf8"), "gwp", NOW);
  const mtatsminda = water.find((o) => o.key === "gwp:GWP-REQ-1301661"); // lists ზურაბ ჟვანიას
  assert.equal(confirms(mtatsminda, signal), true);
  assert.equal(confirms({ ...mtatsminda, utility: "power" }, signal), false);
  assert.equal(confirms(water.find((o) => o.key === "gwp:GWP-REQ-1301428"), signal), false);
});

test("the message says it is residents talking, and whether it is confirmed", () => {
  const sub = [{ id: 1, chatId: 10, ...streetSub("Жвания") }];
  const open = renderOutage(signal, sub).split("\n");
  assert.equal(open[0], "💧 <b>Вода · Тбилиси</b>");
  assert.match(open[1], /^👥 Сообщают жители: 4 человека за \d+ мин$/);
  assert.equal(open[2], "Официально пока не подтверждено");
  assert.equal(open[3], "📍 <b>Жвания</b>");
  const confirmed = { ...signal, reports: { ...signal.reports, confirmedBy: "GWP", confirmedAt: NOW } };
  assert.equal(renderOutage(confirmed, sub).split("\n")[2], "✅ Подтвердил GWP — жители заметили на 18 мин раньше");
});

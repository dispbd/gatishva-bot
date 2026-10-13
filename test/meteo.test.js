// Weather warnings from meteo.gov.ge. The real answer is 11 MB of outlines; no
// warning was in force when it was saved, so the warnings here are made up in
// the same shape.
import { test } from "node:test";
import assert from "node:assert/strict";
import { slimWarnings, warningLevel, parseWarnings } from "../src/sources/meteo.ts";
import { matchOutage, streetSub, citySub, roadSub } from "../src/match.ts";
import { renderOutage } from "../src/render.ts";

const zone = (id, village, color, title = null, info = null) => ({
  Pins: [{ lng: 44.7, lat: 41.7 }, { lng: 44.8, lat: 41.75 }],
  Color: color,
  ID: id,
  Info: info,
  Village: village,
  Title: title,
  IconID: 0,
});
const raw = JSON.stringify([
  zone(1, "ახმეტა", "#86c55e"),
  zone(74, "თბილისი", "#f7941d", "ძლიერი ქარი", "<p>13-14 ოქტომბერს მოსალოდნელია ძლიერი ქარი, სიჩქარით 25 მ/წმ-მდე.</p>"),
  zone(61, "ბათუმი", "#ed1c24", "შტორმი", "<p>სანაპირო ზოლში შტორმი.</p>"),
]);

test("the outlines are cut out before anything else looks at the answer", () => {
  const slim = slimWarnings(raw);
  assert.ok(!slim.includes("lng"));
  assert.equal(JSON.parse(slim).length, 3);
});

test("the colour gives the danger level, green meaning none", () => {
  assert.equal(warningLevel("#86c55e"), 0);
  assert.equal(warningLevel("#ffff00"), 1);
  assert.equal(warningLevel("#f7941d"), 2);
  assert.equal(warningLevel("#ed1c24"), 3);
  assert.equal(warningLevel(null), 0);
});

test("only municipalities under a warning become outages", () => {
  const list = parseWarnings(slimWarnings(raw));
  assert.deepEqual(list.map((o) => [o.city, o.level]), [["თბილისი", 2], ["ბათუმი", 3]]);
  // A new wording is a new warning, so the key carries it.
  const reworded = parseWarnings(slimWarnings(raw.replace("25 მ/წმ", "30 მ/წმ")));
  assert.notEqual(reworded[0].key, list[0].key);
  assert.equal(reworded[1].key, list[1].key);
});

test("a warning reaches everyone following a place in that municipality", () => {
  const [tbilisi] = parseWarnings(slimWarnings(raw));
  const subs = [
    { id: 1, chatId: 10, ...streetSub("Политковская") },
    { id: 2, chatId: 20, ...citySub("Тбилиси") },
    { id: 3, chatId: 30, ...streetSub("Руставели", "ბათუმი") },
    { id: 4, chatId: 40, ...roadSub("Гудаури") },
  ];
  assert.deepEqual([...matchOutage(tbilisi, subs, () => []).keys()].sort(), [10, 20]);
});

test("the message gives place, danger level and cause", () => {
  const [tbilisi, batumi] = parseWarnings(slimWarnings(raw));
  assert.deepEqual(renderOutage(tbilisi, []).split("\n").slice(0, 2), [
    "⛈ <b>Опасная погода · Тбилиси</b>",
    "🟠 Опасность средняя · сильный ветер",
  ]);
  assert.equal(renderOutage(batumi, [], { lang: "en" }).split("\n")[1], "🔴 High danger · storm");
  assert.match(renderOutage(batumi, [], { finished: true }), /^✅ <b>Отменено<\/b> — NEA снял предупреждение/);
});

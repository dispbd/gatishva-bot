// A fault that cuts whole districts names no streets. These are the pieces
// that let it reach a street's subscribers anyway.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseGwp } from "../src/sources/gwp.ts";
import { parseTelasi } from "../src/sources/telasi.ts";
import { matchOutage, streetSub, learnedDistrict, sameDistrict } from "../src/match.ts";
import { renderOutage } from "../src/render.ts";
import { splitStreetDistrict, resolveDistrict } from "../src/cities.ts";
import { tbilisiEpoch } from "../src/time.ts";

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const NOW = tbilisiEpoch(2026, 10, 8, 15, 0);
const ALL = () => ["water", "power", "gas"];
const sub = (id, chatId, s, districts) => ({ id, chatId, ...s, districts });

// Notice 5919: "to the Sololaki-Mtatsminda-Krtsanisi and Isani districts".
const [fault] = parseTelasi(fixture("telasi-5919.json"), NOW);

test("a notice with districts and no streets cuts those districts whole", () => {
  assert.equal(fault.wholeDistricts, true);
});

test("a street learns its district from a notice that lists it under one", () => {
  const water = parseGwp(fixture("gwp.json"), "gwp", NOW).find((o) => o.key === "gwp:GWP-REQ-1301661");
  assert.equal(learnedDistrict(water, sub(1, 1, streetSub("Жвания"))), "მთაწმინდა");
  // A street the notice does not list learns nothing from it.
  assert.equal(learnedDistrict(water, sub(2, 1, streetSub("Политковская"))), undefined);
  // Nor does anything learn from a notice that names no streets.
  assert.equal(learnedDistrict(fault, sub(3, 1, streetSub("Жвания"))), undefined);
});

test("the whole-district fault reaches streets in those districts, and only those", () => {
  const subs = [
    sub(1, 10, streetSub("Жвания"), ["მთაწმინდა"]), // GWP's name for the district
    sub(2, 20, streetSub("Узнадзе"), ["ისანი"]),
    sub(3, 30, streetSub("Икалто"), ["საბურთალო"]),
    sub(4, 40, streetSub("Политковская")), // district not known yet
  ];
  assert.deepEqual([...matchOutage(fault, subs, ALL).keys()].sort(), [10, 20]);
});

test("a compound district matches any of its parts", () => {
  assert.equal(sameDistrict("სოლოლაკ-მთაწმინდა-კრწანისი", "მთაწმინდა"), true);
  assert.equal(sameDistrict("სოლოლაკ-მთაწმინდა-კრწანისი", "სოლოლაკი"), true);
  assert.equal(sameDistrict("მთაწმინდა-კრწანისი", "ისანი"), false);
});

test("the message says why it came: the whole district, the reader's street included", () => {
  const html = renderOutage(fault, [sub(1, 10, streetSub("Жвания"), ["მთაწმინდა"])]);
  assert.match(html, /📍 Отключение на весь район, в том числе <b>Жвания<\/b>/);
});

test("'/add Политковская, Мтацминда' names the district by hand", () => {
  assert.deepEqual(splitStreetDistrict("Политковская, Мтацминда"), { street: "Политковская", district: "მთაწმინდა" });
  assert.deepEqual(splitStreetDistrict("Politkovskaya, Mtatsminda"), { street: "Politkovskaya", district: "მთაწმინდა" });
  // Not a district: the comma is part of the street.
  assert.deepEqual(splitStreetDistrict("Политковская, 32"), { street: "Политковская, 32" });
  assert.equal(resolveDistrict("Ваке"), "ვაკე");
  assert.equal(resolveDistrict("Дигоми"), "დიღომი");
});

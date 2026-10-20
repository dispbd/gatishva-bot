// Villages and small towns: learnt from the notices, named by subscribers.
// Notices as Energo-Pro, SOCAR and UWSC published them on 20 October 2026.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { settlementsOf, parsePlace, placeKey, KNOWN_SETTLEMENTS } from "../src/places.ts";
import { parseEnergo, parseSocar, parseUwsc, energoSettlement } from "../src/sources/regions.ts";
import { streetSub, placeSub, matchOutage, storedKeys, fromStoredKeys, DEFAULT_CITY } from "../src/match.ts";

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const energo = parseEnergo(fixture("energo-2026-10-20.json"));
const socar = parseSocar(fixture("socar-2026-10-20.json"));
const uwsc = parseUwsc(fixture("uwsc.json"));
const all = [...energo, ...socar, ...uwsc];

/** The index the Hub keeps, built the same way. */
function lookup(outages) {
  const index = new Map();
  for (const o of outages) {
    for (const name of settlementsOf(o)) {
      const k = `${placeKey(name)}|${o.city}`;
      const e = index.get(k) ?? { name, city: o.city, seen: 0 };
      e.seen++;
      index.set(k, e);
    }
  }
  return (typed) => {
    const key = placeKey(typed);
    const found = [...index.entries()].filter(([k]) => k.startsWith(`${key}|`)).map(([, v]) => v);
    for (const [name, city] of KNOWN_SETTLEMENTS) {
      if (placeKey(name) === key && !found.some((s) => s.city === city)) found.push({ name, city, seen: 0 });
    }
    return found;
  };
}
const settlements = lookup(all);
const known = [...new Set(all.map((o) => o.city))];
const place = (text, tbilisiStreet = () => false) => parsePlace(text, known, settlements, tbilisiStreet, DEFAULT_CITY);

test("the notices name their settlements", () => {
  const names = new Set(all.flatMap(settlementsOf));
  for (const n of ["ბაკურიანი", "ყარაჯალა", "დიღომი", "კულაში", "ჩაქვი", "ჭოგნარი"]) assert.ok(names.has(n), n);
  // "ს. ხიმშიაშვილის ქ" is a street named after a person, not a village.
  assert.ok(![...names].some((n) => n.startsWith("ხიმშიაშვილ")));
});

test("a village with its municipality, with or without a street", () => {
  assert.deepEqual(place("Бакуриани, Гоголадзе"), { city: "ბორჯომი", place: "ბაკურიანი", street: "Гоголадзе" });
  assert.deepEqual(place("Боржоми, Бакуриани, Гоголадзе"), { city: "ბორჯომი", place: "ბაკურიანი", street: "Гоголадзе" });
  assert.deepEqual(place("Кулаши"), { city: "სამტრედია", place: "კულაში", street: undefined });
  assert.deepEqual(place("Караджала"), { city: "თელავი", place: "ყარაჯალა", street: undefined });
});

test("Tbilisi stays the default, and a street there wins over a village elsewhere", () => {
  assert.deepEqual(place("Политковская, Мтацминда"), { city: DEFAULT_CITY, street: "Политковская", district: "მთაწმინდა" });
  assert.deepEqual(place("Дигоми, Месхи"), { city: DEFAULT_CITY, place: "დიღომი", street: "Месхи" });
  assert.equal(place("Караджала", () => true).city, DEFAULT_CITY);
  assert.deepEqual(place("Батуми, Руставели"), { city: "ბათუმი", place: undefined, street: "Руставели" });
});

test("a street in a village matches only notices naming both", () => {
  const sub = { id: 1, chatId: 10, ...placeSub("Бакуриани, Гоголадзе", "ბორჯომი", "ბაკურიანი", "Гоголадзе") };
  const hits = energo.filter((o) => matchOutage(o, [sub], () => ["power"]).size);
  assert.ok(hits.length > 0);
  for (const o of hits) assert.match(o.text, /ბაკურიან/);
  // The same street without its village would be a different subscription.
  assert.notEqual(storedKeys(sub), storedKeys(streetSub("Гоголадзе", "ბორჯომი")));
  assert.deepEqual(fromStoredKeys(storedKeys(sub)), { keys: sub.keys, place: sub.place });
  assert.deepEqual(fromStoredKeys('["rustavel"]'), { keys: ["rustavel"] }); // rows from before
});

test("Energo's paths say which step is a settlement, and only sure ones are taken", () => {
  assert.equal(energoSettlement("თელავის რ-ნი/ყარაჯალა/უცნობი", "თელავი"), "ყარაჯალა");
  assert.equal(energoSettlement("ბორჯომი/ბაკურიანი/წაქაძეს ქუჩა", "ბორჯომი"), "ბაკურიანი");
  assert.equal(energoSettlement("საგურამო", "მცხეთა"), "საგურამო");
  assert.equal(energoSettlement("ჭიათურის რაიონი/სოფ. სვერი", "ჭიათურა"), "სვერი");
  // The town itself, and "town/X", where X may as well be a street.
  assert.equal(energoSettlement("მესტია/მესტია/დ. მესტია", "მესტია"), undefined);
  assert.equal(energoSettlement("ყვარლის რ-ნი/ყვარელი/ჭავჭავაძე", "ყვარელი"), undefined);
  assert.equal(energoSettlement("მარნეული/ნიზამი", "მარნეული"), undefined);
  assert.equal(energoSettlement("რუსთავი/მე-16", "რუსთავი"), undefined);
});

test("a village marker is a word of its own", () => {
  const o = { key: "x", source: "telasi", provider: "Telasi", utility: "power", city: "თბილისი", emergency: true, text: "", url: "" };
  assert.deepEqual(settlementsOf({ ...o, addresses: ["დაბაკნეთის I გასასვლელის"] }), []);
  assert.deepEqual(settlementsOf({ ...o, addresses: ["(სოფ.ახალდაბა)იეთიმ გურჯის ქ"] }), ["ახალდაბა"]);
  assert.deepEqual(settlementsOf({ ...o, addresses: ["სოფ. ჭოგნარის ნაწილი"] }), ["ჭოგნარი"]);
});

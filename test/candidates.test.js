// Reading a typed address several ways, and what the notices say about each.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readings, candidates, needsChoice, isWholeCity, MAX_CANDIDATES } from "../src/candidates.ts";
import { placeKey, settlementsOf, KNOWN_SETTLEMENTS } from "../src/places.ts";
import { DEFAULT_CITY } from "../src/match.ts";

const outage = (key, city, addresses, extra = {}) => ({
  key, source: "gwp", provider: "GWP", utility: "water", city, emergency: true, url: "",
  text: addresses.join(", "), addresses, ...extra,
});
const events = [
  outage("t1", "თბილისი", ["ბაკურიანის ქ. N 4"], { district: "საბურთალო" }),
  outage("e1", "ბორჯომი", ["ბორჯომი, ბაკურიანი, წაქაძეს ქუჩა"], { source: "energo", settlements: ["ბაკურიანი"] }),
  outage("t2", "თბილისი", ["ვაზისუბანს"], { district: "ვარკეთილი" }),
  outage("t3", "თბილისი", ["ვაზისუბანი N 12"], { district: "ვარკეთილი" }),
  outage("t4", "თბილისი", ["ვაზისუბანს"], { district: "ისანი" }),
  outage("t5", "თბილისი", ["ილია ჭავჭავაძის გამზ."], { district: "ვაკე" }),
  outage("k1", "ყაზბეგი", ["სტეფანწმინდა"]),
];
const known = [...new Set(events.map((o) => o.city))];
const settlements = (typed) => {
  const key = placeKey(typed);
  const found = [];
  for (const o of events) for (const name of settlementsOf(o)) {
    if (placeKey(name) === key && !found.some((s) => s.city === o.city)) found.push({ name, city: o.city, seen: 1 });
  }
  for (const [name, city] of KNOWN_SETTLEMENTS) {
    if (placeKey(name) === key && !found.some((s) => s.city === city)) found.push({ name, city, seen: 0 });
  }
  return found;
};
const tbilisiStreet = (w) => ["Бакуриани", "Вазисубани", "Чавчавадзе"].includes(w);
const of = (text) => candidates(readings(text, known, settlements, tbilisiStreet, DEFAULT_CITY), events, DEFAULT_CITY);

test("a Tbilisi street that is also a resort: both are offered", () => {
  const list = of("Бакуриани");
  assert.equal(needsChoice(list), true);
  assert.deepEqual(
    list.map((c) => [c.city, c.place ?? null, c.district ?? null, c.count]).sort(),
    [["თბილისი", null, "საბურთალო", 1], ["ბორჯომი", "ბაკურიანი", null, 1]].sort(),
  );
});

test("one street in two districts: one reading per district, busiest first", () => {
  const list = of("Вазисубани");
  assert.equal(needsChoice(list), true);
  assert.deepEqual(list.map((c) => [c.district, c.count, c.inferred]), [["ვარკეთილი", 2, true], ["ისანი", 1, true]]);
  assert.match(list[0].example, /ვაზისუბან/);
});

test("one reading the notices support: subscribe, no question", () => {
  const list = of("Чавчавадзе");
  assert.equal(needsChoice(list), false);
  assert.equal(list[0].district, "ვაკე");
  assert.equal(list[0].inferred, true); // so it is not pinned unasked
  assert.equal(needsChoice(of("Политковская")), false); // nothing known: as before
});

test("a lone municipality name is the whole city or a Tbilisi street", () => {
  const list = of("Казбеги");
  assert.equal(needsChoice(list), true);
  assert.ok(list.some((c) => isWholeCity(c) && c.city === "ყაზბეგი" && c.count === 1));
  assert.ok(list.some((c) => c.city === DEFAULT_CITY && c.street === "Казбеги"));
});

test("a typed city or district is taken at its word", () => {
  assert.equal(needsChoice(of("Батуми, Руставели")), false);
  const [c] = of("Вазисубани, Исани");
  assert.equal(c.district, "ისანი");
  assert.equal(c.inferred, undefined);
});

test("the keyboard stays short", () => {
  const many = Array.from({ length: 9 }, (_, i) => outage(`v${i}`, "თბილისი", ["ვაზისუბანს"], { district: `რაიონი${i}` }));
  const list = candidates(readings("Вазисубани", known, settlements, tbilisiStreet, DEFAULT_CITY), many, DEFAULT_CITY);
  assert.equal(list.length, MAX_CANDIDATES);
});

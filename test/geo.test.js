// An address from a point: maps links, Nominatim's answers, pasted addresses.
// The Nominatim addresses are real answers of 20 October 2026.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { pointOfUrl, pointOfLink, findMapLink, placeOfAddress } from "../src/geo.ts";
import { fromFullAddress } from "../src/places.ts";

test("every maps app's link gives its point", () => {
  const vake = { lat: 41.7099, lon: 44.7653 };
  // Google: the place itself wins over the view it was looked at from.
  assert.deepEqual(pointOfUrl("https://www.google.com/maps/place/Vake/@41.7,44.7,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d41.7099!4d44.7653"), vake);
  assert.deepEqual(pointOfUrl("https://www.google.com/maps/@41.7099,44.7653,17z"), vake);
  assert.deepEqual(pointOfUrl("https://maps.google.com/?q=41.7099,44.7653"), vake);
  assert.deepEqual(pointOfUrl("https://maps.apple.com/?ll=41.7099,44.7653&q=Dropped%20Pin"), vake);
  // Yandex writes longitude first.
  assert.deepEqual(pointOfUrl("https://yandex.ru/maps/?ll=44.7653%2C41.7099&z=17"), vake);
  assert.deepEqual(pointOfUrl("https://yandex.com/maps/10277/tbilisi/?pt=44.7653,41.7099&z=17"), vake);
  assert.deepEqual(pointOfUrl("https://www.openstreetmap.org/#map=18/41.7099/44.7653"), vake);
  assert.deepEqual(pointOfUrl("https://www.openstreetmap.org/?mlat=41.7099&mlon=44.7653"), vake);
  assert.deepEqual(pointOfUrl("geo:41.7099,44.7653?z=17"), vake);
  assert.equal(pointOfUrl("https://maps.app.goo.gl/AbCdEf"), undefined); // short: needs following
});

test("a maps link is found in a message; other links are not maps", () => {
  assert.equal(findMapLink("вот тут https://maps.app.goo.gl/AbCdEf, спасибо"), "https://maps.app.goo.gl/AbCdEf");
  assert.equal(findMapLink("https://example.com/maps"), undefined);
  assert.equal(findMapLink("Руставели 12"), undefined);
});

test("a short link is followed through its redirects", async (t) => {
  const hops = new Map([
    ["https://maps.app.goo.gl/AbCdEf", "https://www.google.com/maps/place/x/data=!3d41.7272!4d44.7487"],
  ]);
  mock.method(globalThis, "fetch", async (url) => new Response(null, { status: 302, headers: { location: hops.get(String(url)) ?? "" } }));
  t.after(() => mock.restoreAll());
  assert.deepEqual(await pointOfLink("https://maps.app.goo.gl/AbCdEf"), { lat: 41.7272, lon: 44.7487 });
});

test("Nominatim's address becomes municipality, settlement, street and district", () => {
  assert.deepEqual(
    placeOfAddress({ house_number: "48/2", road: "ილია ჭავჭავაძის გამზირი", quarter: "ვაკე", suburb: "ვაკის რაიონი", city: "თბილისი", country_code: "ge" }),
    { city: "თბილისი", street: "ილია ჭავჭავაძის გამზირი", district: "ვაკე" },
  );
  assert.deepEqual(
    placeOfAddress({ road: "სერგო ზაქარიაძის ქუჩა", suburb: "საბურთალოს რაიონი", city: "თბილისი", country_code: "ge" }).district,
    "საბურთალო",
  );
  // Tskneti is left out: Telasi abbreviates it, so a required name would miss.
  assert.deepEqual(
    placeOfAddress({ road: "შოთა რუსთაველის ქუჩა", quarter: "წყნეთი", suburb: "ვაკის რაიონი", city: "თბილისი", country_code: "ge" }),
    { city: "თბილისი", street: "შოთა რუსთაველის ქუჩა", district: "ვაკე" },
  );
  assert.deepEqual(
    placeOfAddress({ road: "მერაბ კოსტავას ქუჩა", town: "ბაკურიანი", county: "ბორჯომის მუნიციპალიტეტი", country_code: "ge" }),
    { city: "ბორჯომი", place: "ბაკურიანი", street: "მერაბ კოსტავას ქუჩა" },
  );
  assert.deepEqual(
    placeOfAddress({ road: "თამარ მეფის ქუჩა", suburb: "ქალაქ-მუზეუმი", city: "ქუთაისი", country_code: "ge" }),
    { city: "ქუთაისი", street: "თამარ მეფის ქუჩა" },
  );
  assert.deepEqual(
    placeOfAddress({ village: "ნოჯიხევი", county: "ხობის მუნიციპალიტეტი", country_code: "ge" }),
    { city: "ხობი", place: "ნოჯიხევი" },
  );
  assert.equal(placeOfAddress({ road: "Istiklal Caddesi", city: "İstanbul", country_code: "tr" }), "outside");
  assert.equal(placeOfAddress({ suburb: "ვაკის რაიონი", city: "თბილისი", country_code: "ge" }), undefined);
});

test("an address pasted from a map reads like a typed one", () => {
  const read = (s) => fromFullAddress(s, [], (p) => /bakuriani/i.test(p));
  assert.equal(read("Ilia Chavchavadze Ave 37, Tbilisi 0179, Georgia"), "Ilia Chavchavadze Ave");
  assert.equal(read("Грузия, Тбилиси, проспект Ильи Чавчавадзе, 37"), "проспект Ильи Чавчавадзе");
  assert.equal(read("ილია ჭავჭავაძის გამზ. 37, თბილისი 0179"), "ილია ჭავჭავაძის გამზ.");
  assert.equal(read("Тбилиси, Ваке, ул. Абашидзе, 5"), "ул. Абашидзе, Ваке");
  assert.equal(read("Tamar Mepe St, 5, Kutaisi, Imereti, Georgia"), "Kutaisi, Tamar Mepe St");
  assert.equal(read("Merab Kostava St 15/1, Bakuriani 1200, Georgia"), "Bakuriani, Merab Kostava St");
  assert.equal(read("Руставели 12"), "Руставели");
  // Not a pasted address: left to the usual reading.
  assert.equal(read("Политковская, Мтацминда"), undefined);
  assert.equal(read("Батуми, Руставели"), undefined);
});

// Road restrictions from the Roads Department, saved on 2026-10-13.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseGeoroad, roadItemsFromPage, roadPlace } from "../src/sources/georoad.ts";
import { parseGwp } from "../src/sources/gwp.ts";
import { matchOutage, roadSub, streetSub, citySub } from "../src/match.ts";
import { renderOutage } from "../src/render.ts";
import { tbilisiEpoch } from "../src/time.ts";

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const roads = parseGeoroad(fixture("georoad.json"));
const closed = roads.find((o) => o.key === "road:5286");
const reopened = roads.find((o) => o.key === "road:5287");

test("the items come out of the page's server-components stream, brackets in the HTML and all", () => {
  const items = [{ id: 1, restriction_status: "1", translates: [{ language: "ka", title: "a [b] \"c\"", content: "<p>]</p>" }] }];
  const payload = `8:["$","$L14",null,{"parsedData":${JSON.stringify(items)},"total":1}]`;
  const html = `<script>self.__next_f.push([1,${JSON.stringify(payload)}])</script>`;
  assert.deepEqual(roadItemsFromPage(html), items);
});

test("a closure and the reopening that follows are two notices", () => {
  assert.equal(roads.length, 9);
  assert.equal(closed.emergency, true);
  assert.equal(closed.over, false);
  assert.equal(closed.publishedAt, tbilisiEpoch(2026, 10, 6, 21, 29, 36));
  assert.equal(reopened.over, true);
  assert.equal(reopened.emergency, false);
});

test("the header names the road and the section, the road in the nominative", () => {
  assert.equal(roadPlace("ვაზიანი-გომბორი-თელავის გზის 26-ე კმ-ზე ავტოტრანსპორტის მოძრაობა აღდგა"), "ვაზიანი-გომბორი-თელავი, 26 კმ");
  assert.equal(roadPlace("ფშაველი–აბანო–ომალოს გზის კმ22-კმ72 მონაკვეთზე მოძრაობა აკრძალულია"), "ფშაველი–აბანო–ომალო, 22–72 კმ");
  assert.equal(roadPlace("ლეჩური-ომალოს მონაკვეთზე მოძრაობა აღდგა"), "ლეჩური-ომალო");
});

test("a road subscription catches road notices, and only those", () => {
  const subs = [
    { id: 1, chatId: 10, ...roadSub("Телави") },
    { id: 2, chatId: 20, ...roadSub("Гудаури") },
    { id: 3, chatId: 30, ...streetSub("Телави") }, // a street of that name in Tbilisi
    { id: 4, chatId: 40, ...citySub("Тбилиси") },
  ];
  assert.deepEqual([...matchOutage(closed, subs, () => ["water"]).keys()], [10]);
  // ...and never a water outage, whatever its streets are called.
  const water = parseGwp(fixture("gwp.json"), "gwp", tbilisiEpoch(2026, 10, 8, 3, 0));
  for (const o of water) assert.equal(matchOutage(o, [subs[0]], () => ["water"]).size, 0);
});

test("roads arrive whatever the chat switched off in /types", () => {
  const sub = { id: 1, chatId: 10, ...roadSub("Телави") };
  assert.equal(matchOutage(closed, [sub], () => []).size, 1);
});

test("the message says closed or reopened, and why", () => {
  const sub = [{ id: 1, chatId: 10, ...roadSub("Омало") }];
  const shut = renderOutage(roads.find((o) => o.key === "road:5282"), sub).split("\n");
  assert.equal(shut[0], "🚧 <b>Дороги · Пшавели–Абано–Омало, 39–45 км</b>");
  assert.match(shut[1], /^⛔ Движение ограничено · (снегопад|гололёд)$/);
  const back = renderOutage(reopened, [{ id: 1, chatId: 10, ...roadSub("Телави") }], { lang: "en" }).split("\n");
  assert.equal(back[0], "🚧 <b>Roads · Vaziani-Gombori-Telavi, 26 km</b>");
  assert.match(back[1], /^✅ Traffic restored/);
});

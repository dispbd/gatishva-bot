// Naming a city: Russian spellings, and Energo's service centres for two.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveCity } from "../src/cities.ts";
import { streetSub, citySub, matchOutage, cityParts } from "../src/match.ts";

test("cities written the Russian way, not letter by letter", () => {
  assert.equal(resolveCity("Боржоми", []), "ბორჯომი");
  assert.equal(resolveCity("Сигнахи", []), "სიღნაღი");
  assert.equal(resolveCity("Цхалтубо", []), "წყალტუბო");
  // The municipality, not the service centre that happens to start like it.
  assert.equal(resolveCity("Шуахеви", ["შუახევი-ქედა"]), "შუახევი");
});

test("a service centre for two municipalities reaches each by its name", () => {
  assert.equal(cityParts("შუახევი-ქედა").length, 2);
  assert.deepEqual(cityParts("თბილისი"), []);
  const base = { key: "e", source: "energo", provider: "Energo-Pro", utility: "power", emergency: false, url: "" };
  const shuakhevi = { ...base, city: "შუახევი-ქედა", text: "შუახევი-ქედა: შუახევი/შუახევი/ს. ხიმშიაშვილის ქ №9", addresses: ["შუახევი, შუახევი, ს. ხიმშიაშვილის ქ №9"] };
  const keda = { ...base, city: "შუახევი-ქედა", text: "შუახევი-ქედა: ქედა/დანდალო", addresses: ["ქედა, დანდალო"] };
  const subs = [
    { id: 1, chatId: 10, ...streetSub("Химшиашвили", "შუახევი") },
    { id: 2, chatId: 20, ...citySub("შუახევი") },
    { id: 3, chatId: 30, ...citySub("ქედა") },
  ];
  assert.deepEqual([...matchOutage(shuakhevi, subs, () => ["power"]).keys()].sort(), [10, 20]);
  assert.deepEqual([...matchOutage(keda, subs, () => ["power"]).keys()], [30]);
});

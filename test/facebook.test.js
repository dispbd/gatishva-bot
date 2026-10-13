import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { facebookConfig, toPlain, publishPost, editPost, commentOnPost } from "../src/facebook.ts";
import { parseGwp } from "../src/sources/gwp.ts";
import { renderOutage } from "../src/render.ts";
import { tbilisiEpoch } from "../src/time.ts";

test("the Page stays off until it has both an id and a token", () => {
  assert.equal(facebookConfig({}), undefined);
  assert.equal(facebookConfig({ FB_PAGE_ID: "1" }), undefined);
  assert.equal(facebookConfig({ FB_PAGE_TOKEN: "t" }), undefined);
  const cfg = facebookConfig({ FB_PAGE_ID: "1", FB_PAGE_TOKEN: "t" });
  assert.deepEqual(cfg.cities, ["თბილისი"]);
  assert.equal(cfg.lang, "ka");
  const custom = facebookConfig({ FB_PAGE_ID: "1", FB_PAGE_TOKEN: "t", FB_PAGE_CITIES: "თბილისი, ბათუმი", FB_PAGE_LANG: "ru" });
  assert.deepEqual(custom.cities, ["თბილისი", "ბათუმი"]);
  assert.equal(custom.lang, "ru");
});

test("a post is the Telegram message without its markup", () => {
  const water = parseGwp(readFileSync(new URL("./fixtures/gwp.json", import.meta.url), "utf8"), "gwp", tbilisiEpoch(2026, 10, 8, 3, 0));
  const plain = toPlain(renderOutage(water[2], [], { lang: "ru" }));
  assert.doesNotMatch(plain, /<|&amp;|&lt;/);
  assert.match(plain, /^💧 Вода · Тбилиси, Мтацминда\n⚠️ Аварийное · повреждение сети/);
  assert.match(plain, /📋 Адреса \(7\):\n/);
  assert.match(plain, /GWP: https:\/\/www\.gwp\.ge\/ka\/gadaudebeli$/);
});

test("posting, editing and commenting go to the Graph API with the Page's token", async (t) => {
  const calls = [];
  mock.method(globalThis, "fetch", async (url, init) => {
    calls.push({ url: String(url), body: Object.fromEntries(new URLSearchParams(init.body)) });
    return new Response(JSON.stringify({ id: "123_456" }));
  });
  t.after(() => mock.restoreAll());
  const cfg = facebookConfig({ FB_PAGE_ID: "123", FB_PAGE_TOKEN: "tok", FB_GRAPH_VERSION: "v23.0" });
  assert.equal(await publishPost(cfg, "hello"), "123_456");
  await editPost(cfg, "123_456", "hello again");
  await commentOnPost(cfg, "123_456", "over");
  assert.deepEqual(
    calls.map((c) => [c.url, c.body.message, c.body.access_token]),
    [
      ["https://graph.facebook.com/v23.0/123/feed", "hello", "tok"],
      ["https://graph.facebook.com/v23.0/123_456", "hello again", "tok"],
      ["https://graph.facebook.com/v23.0/123_456/comments", "over", "tok"],
    ],
  );
});

test("an error from Facebook is an error, so the outbox retries it", async (t) => {
  mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ error: { message: "Invalid token", code: 190 } }), { status: 400 }));
  t.after(() => mock.restoreAll());
  await assert.rejects(publishPost(facebookConfig({ FB_PAGE_ID: "1", FB_PAGE_TOKEN: "t" }), "x"), /Invalid token/);
});

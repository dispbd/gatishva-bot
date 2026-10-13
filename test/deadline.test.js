import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { fetchWithin } from "../src/sources/common.ts";

test("an answer lifts the deadline at once, so no timer outlives the request", async (t) => {
  mock.method(globalThis, "fetch", async () => new Response("ok"));
  const cleared = mock.method(globalThis, "clearTimeout");
  t.after(() => mock.restoreAll());
  assert.equal(await fetchWithin("https://example.test/", {}, 60_000, (r) => r.text()), "ok");
  assert.equal(cleared.mock.callCount(), 1);
});

test("a request that does not answer in time is cut off", async (t) => {
  // Never answers by itself; settles only when its signal aborts.
  mock.method(globalThis, "fetch", (_url, init) => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason))));
  t.after(() => mock.restoreAll());
  await assert.rejects(fetchWithin("https://slow.test/", {}, 20, (r) => r.text()), /took longer than 20 ms/);
});

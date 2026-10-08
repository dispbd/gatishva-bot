import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { fetchGwp } from "../src/sources/gwp.ts";

test("without a relay GWP is fetched directly", async (t) => {
  const urls = [];
  mock.method(globalThis, "fetch", async (url) => {
    urls.push(String(url));
    return new Response("[]");
  });
  t.after(() => mock.restoreAll());
  await fetchGwp("Disconnect", {});
  assert.deepEqual(urls, ["https://www.gwp.ge/api/Disconnect"]);
});

test("with a relay, the request goes through it and nowhere else", async (t) => {
  const direct = mock.method(globalThis, "fetch", async () => new Response("[]"));
  t.after(() => mock.restoreAll());
  const asked = [];
  const body = await fetchGwp("Disconnect/ListPlanAsync", { gwp: async (p) => (asked.push(p), "[1]") });
  assert.equal(body, "[1]");
  assert.deepEqual(asked, ["Disconnect/ListPlanAsync"]);
  assert.equal(direct.mock.callCount(), 0);
});

test("a relay failure is a failure, not an empty list", async () => {
  const gwp = async () => {
    throw new Error("relay gwp-x in FRA: timeout");
  };
  await assert.rejects(fetchGwp("Disconnect", { gwp }), /FRA/);
});

import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { energo, ENERGO_ATTEMPTS } from "../src/sources/regions.ts";

/** Answers in turn, the way Energo-Pro's load balancer did on 2026-10-11. */
function rotation(statuses) {
  let n = 0;
  const fetchMock = mock.method(globalThis, "fetch", async () => {
    const status = statuses[n++ % statuses.length];
    return new Response(status === 200 ? '{"status":200,"data":[]}' : "Not Found", { status });
  });
  return fetchMock;
}

test("Energo-Pro: two dead backends out of three cost two retries, not a failed poll", async (t) => {
  const f = rotation([404, 404, 200]);
  t.after(() => mock.restoreAll());
  assert.equal(await energo.fetchRaw({}), '{"status":200,"data":[]}');
  assert.equal(f.mock.callCount(), 3);
});

test("Energo-Pro: when every backend is down the poll fails after a bounded number of tries", async (t) => {
  const f = rotation([404]);
  t.after(() => mock.restoreAll());
  await assert.rejects(energo.fetchRaw({}), /answered 404/);
  assert.equal(f.mock.callCount(), ENERGO_ATTEMPTS);
});

test("Energo-Pro: an error that a retry cannot fix is not retried", async (t) => {
  const f = rotation([401]);
  t.after(() => mock.restoreAll());
  await assert.rejects(energo.fetchRaw({}), /answered 401/);
  assert.equal(f.mock.callCount(), 1);
});

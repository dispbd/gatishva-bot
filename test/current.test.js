// /now reads "what is current" from an index of currentUntil, so that number
// must say exactly what the rules of isCurrent always said.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isCurrent, currentUntil, NEWS_WINDOW_SEC, UNTIL_FINISHED } from "../src/diff.ts";

/** The rules as written before the index, kept here as the reference. */
function isCurrentAsBefore(o, now, live) {
  if (live) return true;
  if (o.end !== undefined && o.end > now) return true;
  if (o.publishedAt !== undefined && o.publishedAt > now - NEWS_WINDOW_SEC) return true;
  if (o.end === undefined && o.start !== undefined) return o.start > now - NEWS_WINDOW_SEC;
  return false;
}

test("currentUntil agrees with the old rules on every combination", () => {
  const now = 1_800_000_000;
  const H = 3600;
  const times = [undefined, now - 10 * H, now - 3 * H - 1, now - 3 * H, now - H, now, now + 1, now + 5 * H];
  let checked = 0;
  for (const start of times)
    for (const end of times)
      for (const publishedAt of times)
        for (const live of [false, true]) {
          const o = { start, end, publishedAt, text: "", addresses: [] };
          assert.equal(
            isCurrent(o, now, live),
            isCurrentAsBefore(o, now, live),
            JSON.stringify({ start, end, publishedAt, live }),
          );
          checked++;
        }
  assert.equal(checked, 8 * 8 * 8 * 2);
});

test("what each kind of outage is current until", () => {
  const base = { text: "", addresses: [] };
  // On a live list: until the provider takes it off.
  assert.equal(currentUntil({ ...base, end: 100 }, true), UNTIL_FINISHED);
  // Planned works: until they end.
  assert.equal(currentUntil({ ...base, start: 50, end: 100 }, false), 100);
  // Telasi's emergency, estimate already past: news for three hours after publication.
  assert.equal(currentUntil({ ...base, end: 100, publishedAt: 200 }, false), 200 + NEWS_WINDOW_SEC);
  // No times at all: never current.
  assert.equal(currentUntil(base, false), 0);
});

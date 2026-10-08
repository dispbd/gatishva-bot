#!/usr/bin/env node
// Poll every source once, the way the Hub does, and print what came back:
// size, time, item count and the newest few items. The first thing to run when
// a source alert fires — it shows whether the provider is down or has changed
// its format (a parse error) without deploying anything.
//
//   npm run probe            all sources
//   npm run probe -- telasi  one source
import { SOURCES } from "../src/sources/index.ts";
import { fmtRange, fmtDateTime } from "../src/time.ts";
import { addressRu } from "../src/georgian.ts";

const only = process.argv[2];
for (const s of SOURCES.filter((x) => !only || x.name === only)) {
  const t0 = performance.now();
  try {
    const raw = await s.fetchRaw(process.env);
    const fetched = performance.now() - t0;
    const t1 = performance.now();
    const list = s.parse(raw, Math.floor(Date.now() / 1000));
    const parsed = performance.now() - t1;
    console.log(
      `\n== ${s.name}: ${list.length} items, ${(raw.length / 1024).toFixed(0)} KB, ` +
        `fetch ${fetched.toFixed(0)} ms, parse ${parsed.toFixed(1)} ms`,
    );
    for (const o of list.slice(0, 3)) {
      const when = fmtRange(o.start, o.end) || "—";
      const pub = o.publishedAt ? ` (опубл. ${fmtDateTime(o.publishedAt)})` : "";
      console.log(`  ${o.emergency ? "⚠️" : "🛠"} ${o.city}/${o.district ?? "-"} ${when}${pub}`);
      console.log(`     ${o.addresses.slice(0, 4).map(addressRu).join(", ")}${o.addresses.length > 4 ? ", …" : ""}`);
    }
  } catch (e) {
    console.log(`\n== ${s.name}: FAILED after ${(performance.now() - t0).toFixed(0)} ms: ${e.message}`);
  }
}

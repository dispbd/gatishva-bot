// Reaching GWP from Cloudflare.
//
// gwp.ge answers only from Georgia — and, oddly, from a few networks in Madrid.
// Measured 2026-10-08: from 40 check-host.net locations worldwide only Madrid got
// an answer; from Cloudflare, Frankfurt, Milan, Amsterdam, London, Lisbon, New
// York, Miami, San Jose and Singapore all timed out, while Madrid answered every
// time in 0.3–0.4 s. AWS (via Vercel) timed out in every region tried, and a
// placement hint does not move a Worker to Tbilisi.
//
// The Hub's own Durable Object cannot be moved, but a new one can be *created*
// with a location hint, and stays where it was created. A "weur" hint lands in
// Madrid roughly one time in three. So the Hub creates relays until one reaches
// GWP, remembers its name, and starts over only if that one stops working.
import { DurableObject } from "cloudflare:workers";
import { BROWSER_UA } from "./sources/common.ts";
import { describe } from "./telegram.ts";
import type { GwpPath } from "./types.ts";

export interface RelayResult {
  ok: boolean;
  /** The data centre this relay lives in: "MAD" when it works. */
  colo: string;
  body?: string;
  error?: string;
}

/** Holds no storage at all: a relay that is never used again costs nothing. */
export class GwpRelay extends DurableObject<Env> {
  private colo?: string;

  async fetchGwp(path: GwpPath): Promise<RelayResult> {
    this.colo ??= await whereAmI();
    try {
      const r = await fetch(`https://www.gwp.ge/api/${path}`, {
        headers: { "User-Agent": BROWSER_UA, Accept: "application/json" },
        signal: AbortSignal.timeout(8_000),
      });
      if (!r.ok) return { ok: false, colo: this.colo, error: `HTTP ${r.status}` };
      return { ok: true, colo: this.colo, body: await r.text() };
    } catch (e) {
      return { ok: false, colo: this.colo, error: describe(e) };
    }
  }
}

async function whereAmI(): Promise<string> {
  try {
    const trace = await (await fetch("https://www.cloudflare.com/cdn-cgi/trace")).text();
    return /colo=(\w+)/.exec(trace)?.[1] ?? "?";
  } catch {
    return "?";
  }
}

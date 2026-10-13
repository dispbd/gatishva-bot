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
import { BROWSER_UA, fetchWithin } from "./sources/common.ts";
import { describe } from "./telegram.ts";
import type { GwpPath } from "./types.ts";

export interface RelayResult {
  ok: boolean;
  /**
   * The data centre this relay lives in: "MAD" when it works. Looked up
   * only when asked for, or when the request failed — see fetchGwp.
   */
  colo?: string;
  body?: string;
  error?: string;
}

/** Holds no storage at all: a relay that is never used again costs nothing. */
export class GwpRelay extends DurableObject<Env> {
  private colo?: string;

  /**
   * `locate` asks where this relay lives, which only a hunt needs to know.
   * Asking on every call cost a request to cloudflare.com each time the
   * object woke up — about 2,000 a day, one per poll. A failure always says
   * where it happened, since that is the first question about it.
   */
  async fetchGwp(path: GwpPath, locate = false): Promise<RelayResult> {
    const result = await this.fetchOnce(path);
    if (locate || !result.ok) {
      this.colo ??= await whereAmI();
      result.colo = this.colo;
    }
    return result;
  }

  private async fetchOnce(path: GwpPath): Promise<RelayResult> {
    try {
      // A deadline that is lifted on answer: see fetchWithin.
      return await fetchWithin(
        `https://www.gwp.ge/api/${path}`,
        { headers: { "User-Agent": BROWSER_UA, Accept: "application/json" } },
        8_000,
        async (r): Promise<RelayResult> =>
          r.ok ? { ok: true, body: await r.text() } : { ok: false, error: `HTTP ${r.status}` },
      );
    } catch (e) {
      return { ok: false, error: describe(e) };
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

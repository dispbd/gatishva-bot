export type Utility = "water" | "power" | "gas";
export const UTILITIES: Utility[] = ["water", "power", "gas"];

/**
 * One outage, whichever provider published it, in the provider's own words.
 * Everything a subscriber is matched on or shown is derived from this.
 */
export interface Outage {
  /** Stable across polls, so a re-read item is recognised: "gwp:GWP-REQ-1301377". */
  key: string;
  /** Which source produced it; see src/sources/index.ts. */
  source: string;
  /** Short provider name for the footer: "GWP", "Telasi". */
  provider: string;
  utility: Utility;
  /** Georgian city or service-centre name, as the provider writes it. */
  city: string;
  /** Georgian district name in the nominative, when the provider gives one. */
  district?: string;
  emergency: boolean;
  /** Epoch seconds. Absent when the provider does not say. */
  start?: number;
  /** Planned end, or the estimated restoration for an emergency. */
  end?: number;
  /** When the provider published it, if it says — the key to measuring lag. */
  publishedAt?: number;
  /** The provider's headline, in Georgian. */
  title?: string;
  /** The full notice as plain text, in Georgian. Subscriptions match against this. */
  text: string;
  /** The affected addresses, one per item, as published. */
  addresses: string[];
  /** Link to the notice, or to the provider's outage page when there is none. */
  url: string;
}

export type GwpPath = "Disconnect" | "Disconnect/ListPlanAsync";

/**
 * What a source may need from its caller to fetch: only GWP, which on
 * Cloudflare has to go through a relay in Madrid (src/gwp-relay-do.ts).
 */
export interface SourceEnv {
  gwp?: (path: GwpPath) => Promise<string>;
}

export interface SourceDef {
  name: string;
  /** How often to poll. */
  everySec: number;
  /**
   * Whether this key comes from a list of *current* outages only, so that its
   * vanishing means "restored". Archives keep their items, and there absence
   * means nothing.
   */
  live: (key: string) => boolean;
  /**
   * Fetch the raw payload. Kept apart from parsing so parsing can be tested on
   * fixtures.
   */
  fetchRaw(env: SourceEnv): Promise<string>;
  /** Pure: raw payload in, outages out. `now` is epoch seconds. */
  parse(raw: string, now: number): Outage[];
}

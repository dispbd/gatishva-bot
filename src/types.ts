/** What an outage cuts off. Roads are no utility, but they travel the same path. */
export type Utility = "water" | "power" | "gas" | "road" | "weather";

/**
 * The utilities a chat switches on and off in /types. Roads come by road
 * subscription only, and weather warnings to anyone following a place they
 * cover: a storm warning is not something to opt out of by accident.
 */
export const UTILITIES: Utility[] = ["water", "power", "gas"];

/** Whether a chat with `on` switched on wants outages of `u`. */
export function wanted(u: Utility, on: Utility[]): boolean {
  return !UTILITIES.includes(u) || on.includes(u);
}

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
  /** Every district, when the notice names more than one; `district` is the first. */
  districts?: string[];
  /**
   * The notice cuts its districts as a whole and names no streets — a fault on
   * the high-voltage grid. Street subscribers are matched by district instead.
   */
  wholeDistricts?: boolean;
  /**
   * The notice cuts the whole municipality, "სიღნაღის მუნიციპალიტეტი სრულად":
   * every street followed there is concerned.
   */
  wholeCity?: boolean;
  /**
   * The villages and towns the notice covers, Georgian nominative, when the
   * provider's own structure says which words are settlements (Energo's paths).
   * Teaches the bot where a settlement lies; see src/places.ts.
   */
  settlements?: string[];
  /**
   * What the header names instead of city and district, Georgian: a road and
   * its section, "ვაზიანი-გომბორი-თელავი, 26-ე კმ".
   */
  place?: string;
  /** The notice itself says it is over: "traffic restored". */
  over?: boolean;
  /** A weather warning's danger level, 1 (yellow) to 3 (red). */
  level?: 1 | 2 | 3;
  /** Set on a residents' signal: how many reported, since when, and who confirmed it. */
  reports?: { count: number; since: number; confirmedBy?: string; confirmedAt?: number };
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

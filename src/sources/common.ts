// What every source parser shares: fetching politely, and the Georgian
// vocabulary the providers describe outages with.

/**
 * Tbilisi Energy's CDN answers 403 to anything that does not look like a
 * browser, and the others do not mind one.
 */
export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

const TIMEOUT_MS = 15_000;

/**
 * fetch with a deadline that is lifted the moment the answer is in.
 *
 * Not AbortSignal.timeout: its timer cannot be cancelled, and a pending timer
 * keeps a Worker's invocation alive. Every poll lasted exactly 15 s of wall
 * time (and every GWP relay call exactly 8 s) for a few hundred milliseconds
 * of work, spending the Durable Object's free duration on waiting for timers
 * that had nothing left to cancel. `read` runs inside the deadline too, so a
 * body that stalls halfway is cut off as well.
 */
export async function fetchWithin<T>(
  url: string,
  init: RequestInit,
  ms: number,
  read: (r: Response) => Promise<T>,
): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(new Error(`${url} took longer than ${ms} ms`)), ms);
  try {
    return await read(await fetch(url, { ...init, signal: ctl.signal }));
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch text, failing loudly on anything but a 2xx — a parser fed an error page would report "no outages". */
export function fetchText(url: string, init: RequestInit = {}): Promise<string> {
  const headers = { "User-Agent": BROWSER_UA, ...(init.headers as Record<string, string> | undefined) };
  return fetchWithin(url, { ...init, headers }, TIMEOUT_MS, async (r) => {
    if (!r.ok) throw new Error(`${url} answered ${r.status}`);
    return await r.text();
  });
}

/**
 * Try `fn` up to `attempts` times, straight away, while it fails with one of
 * `statuses`. For a provider whose load balancer sends some requests to a
 * backend that is down: the next request lands elsewhere, so waiting would
 * only add delay.
 */
export async function retrying<T>(fn: () => Promise<T>, attempts: number, statuses: number[]): Promise<T> {
  const transient = new RegExp(`answered (${statuses.join("|")})$`);
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= attempts || !(e instanceof Error) || !transient.test(e.message)) throw e;
    }
  }
}

export function postJson(url: string, body: unknown, headers: Record<string, string> = {}): Promise<string> {
  return fetchText(url, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8", ...headers },
    body: JSON.stringify(body),
  });
}

/** HTML to plain text: paragraphs become line breaks, entities are decoded. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h\d)>/gi, "\n")
      // Inline tags vanish without a trace: Word-pasted HTML splits words across
      // spans ("მ</span><span>ოსახლეობას"), and a space there would break them.
      .replace(/<\/?(span|strong|b|i|em|u|a|font|o:p)\b[^>]*>/gi, "")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n[\n ]*/g, "\n")
    .trim();
}

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  ndash: "–", mdash: "—", laquo: "«", raquo: "»", ldquo: "“", rdquo: "”", bdquo: "„",
  lsquo: "‘", rsquo: "’", hellip: "…", eacute: "é",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (all, name: string) => {
    if (name[0] === "#") {
      const code = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : all;
    }
    return ENTITIES[name.toLowerCase()] ?? all;
  });
}

/** Collapse runs of whitespace — every provider pads its text generously. */
export function squash(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * "არაგეგმიური" is unplanned; "ავარია" an accident; "გადაუდებელი" urgent.
 * Only ever ask this of a headline or a preamble(), never a street list.
 */
export function looksEmergency(text: string): boolean {
  return /არაგეგმ|ავარი|გადაუდებ|დაზიან|ხანძ/.test(text);
}

/**
 * The sentence before the address list. Keywords must be looked for here only:
 * street names are full of them — მაჭავარიანი contains "ავარი", "accident".
 */
export function preamble(text: string): string {
  const colon = text.search(/:(?!\d{2})/);
  return colon === -1 ? text.slice(0, 200) : text.slice(0, colon);
}

/**
 * Tbilisi districts in the case forms the texts use ("საბურთალოს რაიონის"),
 * mapped to the nominative. Several shorten their stem — ისანი → ისნის,
 * დიღომი → დიღმის — so no suffix rule gets them all.
 */
const DISTRICT_FORMS: Record<string, string> = {
  "გლდანის": "გლდანი",
  "ნაძალადევის": "ნაძალადევი",
  "დიდუბის": "დიდუბე",
  "ჩუღურეთის": "ჩუღურეთი",
  "საბურთალოს": "საბურთალო",
  "ვაკის": "ვაკე",
  "მთაწმინდის": "მთაწმინდა",
  "მთაწმინდისა": "მთაწმინდა",
  "კრწანისის": "კრწანისი",
  "ისნის": "ისანი",
  "ისნისა": "ისანი",
  "სამგორის": "სამგორი",
  "ვარკეთილის": "ვარკეთილი",
  "დიღმის": "დიღომი",
};

/**
 * One district name as a notice writes it, put into the nominative. A compound
 * name inflects only its last part: "სოლოლაკ-მთაწმინდა-კრწანისის".
 */
export function districtName(word: string): string {
  const parts = word.split("-");
  const last = parts.pop()!;
  const nominative =
    DISTRICT_FORMS[last] ??
    last
      .replace(/ისა$/, "ისი") // "კრწანისა და ისნის": the form before "and"
      .replace(/ის$/, "ი")
      .replace(/([აეოუ])ს$/, "$1");
  return [...parts, nominative].join("-");
}

/**
 * Every district a notice names, nominative, in order: "საბურთალოს რაიონის"
 * gives one, "სოლოლაკ-მთაწმინდა-კრწანისა და ისნის რაიონებს" two. A list is
 * names joined by commas or "და" ("and"), directly before the word "district"
 * in any of its forms, so the words that come before the list are not caught.
 */
export function districtsOf(text: string): string[] {
  const m =
    /((?:[ა-ჿ-]+(?:\s*,\s*|\s+და\s+))*[ა-ჿ-]+)\s+(?:რაიონებს|რაიონებში|რაიონების|რაიონის|რაიონში|რაიონს|რ-ში|რ-ნის)(?![ა-ჿ])/.exec(
      text,
    );
  if (!m) return [];
  return m[1]!
    .split(/\s*,\s*|\s+და\s+/)
    .filter(Boolean)
    .map(districtName);
}

/**
 * The district fields of an Outage: the first district, and the whole list
 * when a notice names more than one — a high-voltage fault can take out
 * "Sololaki-Mtatsminda-Krtsanisi and Isani" at once.
 */
export function districtFields(text: string): { district?: string; districts?: string[] } {
  const all = districtsOf(text);
  return { district: all[0], districts: all.length > 1 ? all : undefined };
}

/** The first district a notice names, or undefined. */
export function districtOf(text: string): string | undefined {
  return districtsOf(text)[0];
}

export const TBILISI = "თბილისი";

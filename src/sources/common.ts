// What every source parser shares: fetching politely, and the Georgian
// vocabulary the providers describe outages with.

/**
 * Tbilisi Energy's CDN answers 403 to anything that does not look like a
 * browser, and the others do not mind one.
 */
export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

const TIMEOUT_MS = 15_000;

/** Fetch text, failing loudly on anything but a 2xx — a parser fed an error page would report "no outages". */
export async function fetchText(url: string, init: RequestInit = {}): Promise<string> {
  const r = await fetch(url, {
    ...init,
    headers: { "User-Agent": BROWSER_UA, ...(init.headers as Record<string, string> | undefined) },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!r.ok) throw new Error(`${url} answered ${r.status}`);
  return await r.text();
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
 * Tbilisi districts in the genitive, as the texts name them ("საბურთალოს
 * რაიონის"), mapped to the nominative. Several shorten their stem in the
 * genitive — ისანი → ისნის, დიღომი → დიღმის — so no suffix rule gets them all.
 */
const DISTRICT_GENITIVE: Record<string, string> = {
  "გლდანის": "გლდანი",
  "ნაძალადევის": "ნაძალადევი",
  "დიდუბის": "დიდუბე",
  "ჩუღურეთის": "ჩუღურეთი",
  "საბურთალოს": "საბურთალო",
  "ვაკის": "ვაკე",
  "მთაწმინდის": "მთაწმინდა",
  "კრწანისის": "კრწანისი",
  "ისნის": "ისანი",
  "სამგორის": "სამგორი",
  "ვარკეთილის": "ვარკეთილი",
  "დიღმის": "დიღომი",
  "მთაწმინდა-კრწანისის": "მთაწმინდა-კრწანისი",
  "ვაკე-საბურთალოს": "ვაკე-საბურთალო",
  "დიდუბე-ჩუღურეთის": "დიდუბე-ჩუღურეთი",
  "ისანი-სამგორის": "ისანი-სამგორი",
  "გლდანი-ნაძალადევის": "გლდანი-ნაძალადევი",
};

/** The district a Telasi/TE notice names, nominative, or undefined. */
export function districtOf(text: string): string | undefined {
  const m = /([ა-ჿ-]+)\s+(?:რაიონის|რაიონში|რაიონებში|რ-ში|რ-ნის)/.exec(text);
  if (!m) return undefined;
  return DISTRICT_GENITIVE[m[1]!] ?? m[1]!.replace(/ის$/, "ი").replace(/ს$/, "");
}

export const TBILISI = "თბილისი";

// Georgian text, and the scripts people actually type Georgian street names in.
//
// Every provider publishes in Georgian; subscribers type "Политковская",
// "Politkovskaya" or "პოლიტკოვსკაია" and expect all three to mean the same street.
// Rather than translating either side, both are reduced to a *skeleton*: a coarse
// Latin spelling in which letters that the other scripts cannot tell apart
// collapse into one. Georgian has three k's (კ ქ ყ), two t's, two p's, two ts's
// and two ch's, which Russian and casual Latin spell identically — so the
// skeleton spells them identically too. Matching is then a substring test.
//
// The skeleton also drops spaces and punctuation, which is not just tidiness:
// Telasi's texts are full of words broken by stray spaces ("მას ივის",
// "ბუაჩი ძის"), and a match must survive them.
import type { Lang } from "./i18n.ts";

const KA_TO_SKEL: Record<string, string> = {
  "ა": "a", "ბ": "b", "გ": "g", "დ": "d", "ე": "e", "ვ": "v", "ზ": "z", "თ": "t",
  "ი": "i", "კ": "k", "ლ": "l", "მ": "m", "ნ": "n", "ო": "o", "პ": "p", "ჟ": "zh",
  "რ": "r", "ს": "s", "ტ": "t", "უ": "u", "ფ": "p", "ქ": "k", "ღ": "g", "ყ": "k",
  "შ": "sh", "ჩ": "ch", "ც": "c", "ძ": "dz", "წ": "c", "ჭ": "ch", "ხ": "h", "ჯ": "j",
  "ჰ": "h",
};

const CYR_TO_SKEL: Record<string, string> = {
  "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e", "ж": "zh",
  "з": "z", "и": "i", "й": "i", "к": "k", "л": "l", "м": "m", "н": "n", "о": "o",
  "п": "p", "р": "r", "с": "s", "т": "t", "у": "u", "ф": "p", "х": "h", "ц": "c",
  "ч": "ch", "ш": "sh", "щ": "sh", "ъ": "", "ы": "i", "ь": "", "э": "e", "ю": "iu",
  "я": "ia",
};

/**
 * Multi-letter spellings, longest first, for Latin and Cyrillic input. "kh" is
 * how ხ is romanised, "gh" is ღ, "ts"/"tz" is ც/წ; Russian writes ჯ as "дж".
 */
const DIGRAPHS: [string, string][] = [
  ["dzh", "j"], ["tch", "ch"], ["дж", "j"],
  ["kh", "h"], ["gh", "g"], ["ts", "c"], ["tz", "c"], ["zh", "zh"], ["sh", "sh"],
  ["ch", "ch"], ["dz", "dz"], ["ph", "p"], ["th", "t"],
];

const LAT_TO_SKEL: Record<string, string> = {
  "a": "a", "b": "b", "c": "c", "d": "d", "e": "e", "f": "p", "g": "g", "h": "h",
  "i": "i", "j": "j", "k": "k", "l": "l", "m": "m", "n": "n", "o": "o", "p": "p",
  "q": "k", "r": "r", "s": "s", "t": "t", "u": "u", "v": "v", "w": "v", "x": "h",
  "y": "i", "z": "z",
};

const DIGITS = "0123456789";

/** A letter in any of the three scripts — what counts as "inside a word". */
export function isLetter(ch: string | undefined): boolean {
  return !!ch && /[\p{L}\p{N}]/u.test(ch);
}

export interface Skeleton {
  /** The coarse spelling, letters and digits only. */
  s: string;
  /** For each character of `s`, the index in the original text it came from. */
  map: number[];
  /** Whether the character of `s` at that position begins a word of the original. */
  starts: boolean[];
}

/**
 * Reduce text in any script to its skeleton, remembering where each skeleton
 * character came from so a match can be mapped back for highlighting.
 *
 * Doubled letters collapse within a word ("Руставелли", "ии" from "ия"), since
 * nobody spells doubles consistently across scripts; across a space they do not,
 * or a word that starts with the letter the previous one ended in would lose its
 * first character and could never be matched from its start.
 */
export function skeletonize(text: string): Skeleton {
  const lower = text.toLowerCase();
  const s: string[] = [];
  const map: number[] = [];
  const starts: boolean[] = [];
  let sawSeparator = true;

  const push = (out: string, at: number) => {
    for (const ch of out) {
      const last = s[s.length - 1];
      if (!sawSeparator && last === ch && !DIGITS.includes(ch)) continue;
      s.push(ch);
      map.push(at);
      starts.push(sawSeparator);
      sawSeparator = false;
    }
  };

  for (let i = 0; i < lower.length; ) {
    const ch = lower[i]!;
    const di = DIGRAPHS.find(([from]) => lower.startsWith(from, i));
    if (di) {
      push(di[1], i);
      i += di[0].length;
      continue;
    }
    const out = KA_TO_SKEL[ch] ?? CYR_TO_SKEL[ch] ?? LAT_TO_SKEL[ch] ?? (DIGITS.includes(ch) ? ch : null);
    if (out === null) {
      // Apostrophes are how Latin marks ejectives (k'), not word breaks.
      if (ch !== "'" && ch !== "’") sawSeparator = true;
    } else {
      push(out, i);
    }
    i += 1;
  }
  return { s: s.join(""), map, starts };
}

export function skel(text: string): string {
  return skeletonize(text).s;
}

/**
 * Words that say what kind of street it is, in every script, as skeleton
 * prefixes. They are dropped from what a subscriber types — "ул. Руставели" and
 * "Rustaveli ave" are both just "Rustaveli" — because the provider texts use the
 * Georgian word in any grammatical case, or leave it out altogether.
 */
const STREET_TYPE_WORDS = [
  "ul", "ulica", "pr", "prosp", "prospekt", "per", "pereulok", "tupik", "pl", "ploshad",
  "shose", "shosse", "kv", "kvartal", "mkr", "mikroraion", "rn", "raion",
  "st", "str", "street", "ave", "avenue", "lane", "ln", "rd", "road", "sq", "square", "blind", "alley",
];
// Compared as skeletons, since skeletons are what the query is turned into —
// "street" itself skeletonizes to "stret".
const STREET_TYPE_SKELS = new Set(STREET_TYPE_WORDS.map(skel));

function isTypeWord(word: string): boolean {
  return STREET_TYPE_SKELS.has(skel(word)) || !!typeWord(word);
}

/** The shortest key worth matching: below this, "ул. Ана" matches half the city. */
export const MIN_KEY = 4;

/**
 * The skeleton keys for what a subscriber typed, best first. An outage matches
 * the subscription if its text contains any of them at the start of a word.
 *
 * The whole phrase comes first, so "26 мая" or "Важа-Пшавела" match as written.
 * For several words the longest one is offered too, because the texts often
 * name a street by surname alone: "Ильи Чавчавадзе" must still find
 * "ჭავჭავაძის". Each key loses a trailing vowel — the nominative ending that
 * Georgian replaces with its case endings (ჭავჭავაძე → ჭავჭავაძის).
 */
export function streetKeys(query: string): string[] {
  const words = query.split(/[\s,.;:()]+/).filter((w) => w && !isTypeWord(w));
  const stem = (k: string) => (k.length > MIN_KEY && /[aeiou]$/.test(k) ? k.slice(0, -1) : k);
  const keys: string[] = [];
  const phrase = stem(skel(words.join(" ")));
  if (phrase.length >= MIN_KEY) keys.push(phrase);
  if (words.length > 1) {
    const longest = words.map((w) => stem(skel(w))).sort((a, b) => b.length - a.length)[0];
    if (longest && longest.length >= 6 && !keys.includes(longest)) keys.push(longest);
  }
  return keys;
}

/** A matched span of the original text, [start, end). */
export type Span = [number, number];

/**
 * Where in `text` any of `keys` occurs at the start of a word, as spans of the
 * original text widened to whole words — so the highlight covers "ჭავჭავაძის",
 * case ending and all, not just the part that matched.
 */
export function findKeys(text: string, keys: string[], sk: Skeleton = skeletonize(text)): Span[] {
  const spans: Span[] = [];
  for (const key of keys) {
    if (!key) continue;
    for (let at = sk.s.indexOf(key); at !== -1; at = sk.s.indexOf(key, at + 1)) {
      if (!sk.starts[at]) continue;
      let start = sk.map[at]!;
      let end = sk.map[at + key.length - 1]! + 1;
      while (start > 0 && isLetter(text[start - 1])) start--;
      while (end < text.length && isLetter(text[end])) end++;
      spans.push([start, end]);
    }
  }
  return mergeSpans(spans);
}

export function mergeSpans(spans: Span[]): Span[] {
  const sorted = [...spans].sort((a, b) => a[0] - b[0]);
  const out: Span[] = [];
  for (const sp of sorted) {
    const last = out[out.length - 1];
    if (last && sp[0] <= last[1]) last[1] = Math.max(last[1], sp[1]);
    else out.push([sp[0], sp[1]]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Georgian → Russian and English, for display.
//
// Machine translation mangles street names, and the people reading these are
// looking for *their* street, which they know by its Russian or Latin spelling.
// Street names are proper nouns: transliterating them is both more accurate and
// free. The street-type words around them are translated from a small table.

const KA_TO_RU: Record<string, string> = {
  "ა": "а", "ბ": "б", "გ": "г", "დ": "д", "ე": "е", "ვ": "в", "ზ": "з", "თ": "т",
  "ი": "и", "კ": "к", "ლ": "л", "მ": "м", "ნ": "н", "ო": "о", "პ": "п", "ჟ": "ж",
  "რ": "р", "ს": "с", "ტ": "т", "უ": "у", "ფ": "п", "ქ": "к", "ღ": "г", "ყ": "к",
  "შ": "ш", "ჩ": "ч", "ც": "ц", "ძ": "дз", "წ": "ц", "ჭ": "ч", "ხ": "х", "ჯ": "дж",
  "ჰ": "х",
};
const KA_VOWELS = "აეიოუ";

export function hasGeorgian(text: string): boolean {
  return /[ა-ჿ]/.test(text);
}

/**
 * Georgian's national romanisation without the apostrophes that mark
 * ejectives — the spelling on Tbilisi's own street signs: Chavchavadze,
 * Tsereteli, Agmashenebeli.
 */
const KA_TO_EN: Record<string, string> = {
  "ა": "a", "ბ": "b", "გ": "g", "დ": "d", "ე": "e", "ვ": "v", "ზ": "z", "თ": "t",
  "ი": "i", "კ": "k", "ლ": "l", "მ": "m", "ნ": "n", "ო": "o", "პ": "p", "ჟ": "zh",
  "რ": "r", "ს": "s", "ტ": "t", "უ": "u", "ფ": "p", "ქ": "k", "ღ": "gh", "ყ": "q",
  "შ": "sh", "ჩ": "ch", "ც": "ts", "ძ": "dz", "წ": "ts", "ჭ": "ch", "ხ": "kh", "ჯ": "j",
  "ჰ": "h",
};

function capitalise(text: string): string {
  // Georgian has no capitals; Latin and Cyrillic names need them.
  return text.replace(/(^|[^\p{L}])(\p{Ll})/gu, (_, sep: string, c: string) => sep + c.toUpperCase());
}

/** Letter-by-letter Georgian → Latin. */
export function translitEn(text: string): string {
  let out = "";
  for (const ch of text) out += KA_TO_EN[ch] ?? ch;
  return capitalise(out);
}

/** A Georgian name as a reader of `lang` writes it; Georgian readers get it as is. */
export function translit(text: string, lang: Lang): string {
  if (lang === "ru") return translitRu(text);
  if (lang === "en") return translitEn(text);
  return text;
}

/** Letter-by-letter Georgian → Cyrillic, with the few rules Russian spelling expects. */
export function translitRu(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    const prev = text[i - 1];
    const next = text[i + 1];
    const atWordStart = !isLetter(prev);
    if (ch === "ი" && next === "ა" && !isLetter(text[i + 2])) {
      // ჟვანია → Жвания, პოლიტკოვსკაია → Политковская
      out += prev && KA_VOWELS.includes(prev) ? "я" : "ия";
      i++;
    } else if (ch === "ე" && atWordStart) {
      out += "э";
    } else if (ch === "ი" && prev && KA_VOWELS.includes(prev) && !(next && KA_VOWELS.includes(next))) {
      out += "й";
    } else {
      out += KA_TO_RU[ch] ?? ch;
    }
  }
  return capitalise(out);
}

/**
 * Names that drop a vowel before the case ending, so no suffix rule can put it
 * back: წერეთელი → წერეთლის would otherwise read "Церетли". The common ones on
 * Tbilisi's street signs.
 */
const SYNCOPE: Record<string, string> = {
  "წერეთლის": "წერეთელი",
  "გორგასლის": "გორგასალი",
  "აღმაშენებლის": "აღმაშენებელი",
  "მაჩაბლის": "მაჩაბელი",
  "ბარნოვის": "ბარნოვი",
  "ხეივნის": "ხეივანი",
};

/**
 * The nominative of a street name the texts give in the genitive or dative,
 * which is nearly always: "ჭავჭავაძის" is "of Chavchavadze". Only the common
 * endings are undone; anything else is left as written, which still reads.
 */
export function toNominative(word: string): string {
  if (SYNCOPE[word]) return SYNCOPE[word];
  if (/ძის$/.test(word)) return word.replace(/ძის$/, "ძე");
  if (/შვილი?ს$/.test(word)) return word.replace(/შვილი?ს$/, "შვილი");
  if (/შვილების$/.test(word)) return word.replace(/შვილების$/, "შვილი"); // ძმები ზუბალაშვილების
  if (/(ოვ|ევ|ინ)ის$/.test(word)) return word.slice(0, -2); // გრიბოედოვის → Грибоедов
  if (/[აეოუ]ს$/.test(word)) return word.slice(0, -1); // ჟვანიას, ვაჟა-ფშაველას
  if (/ის$/.test(word)) return word.slice(0, -2) + "ი"; // ყაზბეგის → ყაზბეგი
  if (/ზე$/.test(word)) return toNominative(word.slice(0, -2));
  return word;
}

/**
 * Street-type words, matched by skeleton prefix (so every case form is caught),
 * with how they read in Russian and English. Georgian puts the type after the
 * name, as English does — "Chavchavadze St." — while Russian moves some to the
 * front: `lead` gives "ул. Чавчавадзе", `enLead` gives "Village Nukriani".
 */
const TYPE_WORDS: { prefix: string; ru: string; en: string; lead?: boolean; enLead?: boolean; exact?: boolean }[] = [
  { prefix: "k", ru: "ул.", en: "St.", lead: true, exact: true }, // "ქ."
  { prefix: "kuch", ru: "ул.", en: "St.", lead: true },
  { prefix: "gamz", ru: "пр.", en: "Ave.", lead: true },
  { prefix: "shesahvev", ru: "пер.", en: "Lane" },
  { prefix: "chih", ru: "туп.", en: "Dead End" },
  { prefix: "kvartl", ru: "кв.", en: "Block" },
  { prefix: "kvartal", ru: "кв.", en: "Block" },
  { prefix: "kv", ru: "кв.", en: "Block", exact: true },
  { prefix: "mikroraion", ru: "мкр", en: "Microdistrict" },
  { prefix: "mkr", ru: "мкр", en: "Microdistrict", exact: true },
  { prefix: "mr", ru: "мкр", en: "Microdistrict", exact: true },
  { prefix: "dasahleb", ru: "пос.", en: "Settlement" },
  { prefix: "sopel", ru: "с.", en: "Village", lead: true, enLead: true },
  { prefix: "sop", ru: "с.", en: "Village", lead: true, enLead: true, exact: true },
  { prefix: "s", ru: "с.", en: "Village", lead: true, enLead: true, exact: true }, // "ს." — also "village"
  { prefix: "heivan", ru: "аллея", en: "Alley" },
  { prefix: "heivn", ru: "аллея", en: "Alley" }, // ხეივნის, without its vowel
  { prefix: "agmart", ru: "подъём", en: "Rise" },
  { prefix: "dagmart", ru: "спуск", en: "Descent" },
  { prefix: "moedan", ru: "пл.", en: "Sq.", lead: true },
  { prefix: "moedn", ru: "пл.", en: "Sq.", lead: true },
  { prefix: "gzatkecil", ru: "шоссе", en: "Hwy" },
  { prefix: "gasasvlel", ru: "проезд", en: "Passage" },
  { prefix: "masiv", ru: "массив", en: "Massif" },
  { prefix: "raion", ru: "р-н", en: "District" },
  { prefix: "kentebs", ru: "(нечёт.)", en: "(odd)" },
  { prefix: "lucebs", ru: "(чёт.)", en: "(even)" },
  { prefix: "teritori", ru: "терр.", en: "area" },
  { prefix: "mimdebare", ru: "окрестности", en: "vicinity" },
  { prefix: "da", ru: "и", en: "and", exact: true },
];

function typeWord(word: string): (typeof TYPE_WORDS)[number] | undefined {
  if (!hasGeorgian(word)) return undefined;
  const k = skel(word);
  return TYPE_WORDS.find((t) => (t.exact ? k === t.prefix : k.startsWith(t.prefix)));
}

/** One address as a Russian reader would write it; see addressLocal. */
export function addressRu(item: string): string {
  return addressLocal(item, "ru");
}

/**
 * One address as a reader of `lang` would write it: "ალექსანდრე ჭავჭავაძის ქ. N 4"
 * becomes "ул. Александре Чавчавадзе № 4" or "Aleksandre Chavchavadze St. No. 4".
 * Georgian readers, and text that is not Georgian, get it as written.
 */
export function addressLocal(item: string, lang: Lang): string {
  if (lang === "ka" || !hasGeorgian(item)) return item.trim();
  // "N31-39(კენტებს)": the parenthesis is its own word, "odd numbers".
  // A Roman numeral glued to its word ("Iშესახვევის") is two words.
  const tokens = item
    .replace(/\(/g, " (")
    .replace(/\)/g, ") ")
    .replace(/\b([IVX]+)(?=[ა-ჿ])/g, "$1 ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ");
  const lead: string[] = [];
  const body: string[] = [];
  // The name to put into the nominative is the last name word before a type
  // word or a number — "ჭავჭავაძის" in "ჭავჭავაძის I შესახვევი".
  let nameEnd = -1;
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]!;
    if (typeWord(tok) || !hasGeorgian(tok) || /\d/.test(tok)) {
      if (nameEnd === -1 && i > 0) nameEnd = i - 1;
    }
  }
  if (nameEnd === -1) nameEnd = tokens.length - 1;

  const no = lang === "en" ? "No." : "№";
  tokens.forEach((tok, i) => {
    const t = typeWord(tok);
    if (t) {
      const label = lang === "en" ? t.en : t.ru;
      const leads = lang === "en" ? t.enLead : t.lead;
      if (leads && !lead.includes(label)) lead.push(label);
      else if (!leads) body.push(label);
      return;
    }
    if (tok === "N" || tok === "№") return body.push(no);
    const word = i === nameEnd ? toNominative(tok) : tok;
    body.push(translit(word.replace(/^N(?=\d)/, `${no} `), lang));
  });
  return [...lead, ...body].join(" ").replace(/\s+/g, " ").trim();
}

/**
 * Split a Georgian enumeration of addresses into items. Providers separate them
 * with commas and finish with "და" ("and"), and sometimes semicolons.
 */
export function splitAddresses(list: string): string[] {
  const parts = list
    .replace(/\s+/g, " ")
    .split(/\s*[,;]\s*|\s+(?=და\s)/)
    .map((s) => s.replace(/^[\s.:–-]+|[\s.:–-]+$/g, "").trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    const rest = p.replace(/^და\s+/, "");
    const last = out.length - 1;
    if (last >= 0 && HOUSE_NUMBERS.test(rest)) {
      // "ბათუმის 25, 38": the commas also separate house numbers of one
      // street, and "38" on its own is not an address.
      out[last] += `, ${rest}`;
    } else if (last >= 0 && rest !== p && rest.split(" ").every((w) => typeWord(w))) {
      // "და" both ends a list and joins words inside an item: "ჭავჭავაძის
      // შესახვევებით და ჩიხებით" is one place — its lanes and its dead ends.
      out[last] += ` ${p}`;
    } else {
      out.push(rest);
    }
  }
  return out.filter((s) => s.length > 1);
}

/** "38", "N 16", "12ა", "32-50": a house number or a range, with no street name. */
const HOUSE_NUMBERS = /^(?:N|№)?\s*\d+[ა-ჿa-z]?(?:\s*-\s*\d+[ა-ჿa-z]?)?$/u;

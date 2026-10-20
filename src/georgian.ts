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

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

/** First letters of the digraphs; any other letter skips the digraph search. */
const DIGRAPH_FIRST = new Set(DIGRAPHS.map(([from]) => from[0]!));

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
    for (let k = 0; k < out.length; k++) {
      const ch = out[k]!;
      if (!sawSeparator && s[s.length - 1] === ch && !isDigit(ch)) continue;
      s.push(ch);
      map.push(at);
      starts.push(sawSeparator);
      sawSeparator = false;
    }
  };

  for (let i = 0; i < lower.length; ) {
    const ch = lower[i]!;
    // The providers' texts are nearly all Georgian, and no Georgian letter
    // begins a digraph: this path is most of the work, so it goes first.
    const ka = KA_TO_SKEL[ch];
    if (ka !== undefined) {
      push(ka, i);
      i += 1;
      continue;
    }
    const di = DIGRAPH_FIRST.has(ch) ? DIGRAPHS.find(([from]) => lower.startsWith(from, i)) : undefined;
    if (di) {
      push(di[1], i);
      i += di[0].length;
      continue;
    }
    const out = CYR_TO_SKEL[ch] ?? LAT_TO_SKEL[ch] ?? (isDigit(ch) ? ch : null);
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
 * Georgian replaces with its case endings (ჭავჭავაძე → ჭავჭავაძის). A name
 * that also loses a vowel inside, ვაზისუბანი → ვაზისუბნის, is handled by
 * findKeys, not here: these keys are stored with each subscription.
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
 * Many Georgian names lose their last vowel before a case ending that starts
 * with a vowel: ვაზისუბანი → ვაზისუბნის, წერეთელი → წერეთლის, დიღომი →
 * დიღმის, კოჯორი → კოჯრის. A key that ends in a consonant, a vowel and l, m, n
 * or r is therefore also looked for without that vowel: "vazisuban" →
 * "vazisubn". Derived here, at match time, so subscriptions stored long ago
 * catch these forms too without their keys being rewritten.
 */
const SYNCOPE_KEY = /^(.*[^aeiou])[aeo]([lmnr])$/;

export function syncopated(key: string): string | undefined {
  const m = SYNCOPE_KEY.exec(key);
  return m && m[1]!.length + 1 >= MIN_KEY ? m[1]! + m[2]! : undefined;
}

/**
 * What must follow a syncopated key in its word: a case ending, and nothing
 * else — the instrumental -ით, -იდან, the adverbial -ად, -ამდე, a plural -ებ-.
 * Without this "maran" would find მარნეული, "muhur" მუხრანი and "sakar"
 * საკრებულოს — other words entirely. Only the genitive -ის, the case street
 * names are given in, may run on, because Telasi glues the next word to it:
 * "ვაზისუბნისდასხლებას".
 */
const AFTER_SYNCOPE = /^(?:is.*|ita?|idan|ada?|amde|eb(?:i|is|it|idan|shi|ze|ma|s|ad))$/;

/**
 * Where in `text` any of `keys` occurs at the start of a word, as spans of the
 * original text widened to whole words — so the highlight covers "ჭავჭავაძის",
 * case ending and all, not just the part that matched.
 */
export function findKeys(text: string, keys: string[], sk: Skeleton = skeletonize(text)): Span[] {
  const spans: Span[] = [];
  const search = (key: string, syncope: boolean) => {
    for (let at = sk.s.indexOf(key); at !== -1; at = sk.s.indexOf(key, at + 1)) {
      if (!sk.starts[at]) continue;
      if (syncope) {
        let wordEnd = at + key.length;
        while (wordEnd < sk.s.length && !sk.starts[wordEnd]) wordEnd++;
        if (!AFTER_SYNCOPE.test(sk.s.slice(at + key.length, wordEnd))) continue;
      }
      let start = sk.map[at]!;
      let end = sk.map[at + key.length - 1]! + 1;
      while (start > 0 && isLetter(text[start - 1])) start--;
      while (end < text.length && isLetter(text[end])) end++;
      spans.push([start, end]);
    }
  };
  for (const key of keys) {
    if (!key) continue;
    search(key, false);
    const short = syncopated(key);
    if (short) search(short, true);
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
  { prefix: "shes", ru: "пер.", en: "Lane", exact: true }, // "შეს." in Telasi's live lists
  { prefix: "chih", ru: "туп.", en: "Dead End" },
  { prefix: "kvartl", ru: "кв.", en: "Block" },
  { prefix: "kvartal", ru: "кв.", en: "Block" },
  { prefix: "kv", ru: "кв.", en: "Block", exact: true },
  { prefix: "mikroraion", ru: "мкр", en: "Microdistrict" },
  { prefix: "mkr", ru: "мкр", en: "Microdistrict", exact: true },
  { prefix: "mr", ru: "мкр", en: "Microdistrict", exact: true },
  { prefix: "dasahleb", ru: "пос.", en: "Settlement" },
  { prefix: "daba", ru: "пос.", en: "Daba", lead: true, enLead: true, exact: true }, // "დაბა კულაში"
  { prefix: "uban", ru: "квартал", en: "Quarter" }, // "ონაროს უბანი"
  { prefix: "gasavlel", ru: "проезд", en: "Passage" }, // Telasi's own misspelling of გასასვლელი
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
  { prefix: "km", ru: "км", en: "km", exact: true }, // "კმ", on road sections
];

type TypeWord = (typeof TYPE_WORDS)[number];

/**
 * A small memo for the pure functions that rendering calls over and over.
 * The same street words and addresses recur in every message about an outage
 * — one per subscribed chat, again on every edit — and the Durable Object's
 * isolate lives across many of them. Cleared wholesale when full: simpler than
 * an LRU, and refilling costs only what the first message cost anyway.
 */
function memo<V>(limit: number, compute: (key: string) => V): (key: string) => V {
  const cache = new Map<string, V>();
  return (key) => {
    if (cache.has(key)) return cache.get(key)!;
    const value = compute(key);
    if (cache.size >= limit) cache.clear();
    cache.set(key, value);
    return value;
  };
}

const typeWordOf = memo<TypeWord | null>(5000, (word) => {
  if (!hasGeorgian(word)) return null;
  const k = skel(word);
  return TYPE_WORDS.find((t) => (t.exact ? k === t.prefix : k.startsWith(t.prefix))) ?? null;
});

function typeWord(word: string): TypeWord | undefined {
  return typeWordOf(word) ?? undefined;
}

const addressCached = memo<string>(5000, (key) => {
  const at = key.indexOf("\u0000");
  return addressUncached(key.slice(at + 1), key.slice(0, at) as Lang);
});

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
  return addressCached(`${lang}\u0000${item}`);
}

/**
 * An address is often a path of places, "ყვარელი, ილ.ჭავჭავაძეს ქუჩა" or "დაბა
 * ახალდაბა. ყაზბეგის ქ.", and each part is translated on its own: otherwise
 * "ул." leads the town's name instead of the street's.
 */
function addressUncached(item: string, lang: Lang): string {
  const out: string[] = [];
  for (const part of addressParts(normaliseAddress(item))) {
    const local = partLocal(part, lang, out.length === 0);
    // Energo repeats the town: "მესტია, მესტია, ბ.კახიანის ქ".
    if (local && local !== out[out.length - 1]) out.push(local);
  }
  return out.join(", ");
}

/**
 * The spellings that hide where one word ends. Telasi puts a Tbilisi suburb in
 * front, "(სოფ.ახალდაბა)იეთიმ გურჯის ქ" — it reads as a qualifier, so it goes
 * last. Initials and abbreviations lose their space, "შ.რუსთაველის"; numbers
 * glue to words, "მე-2ჩიხი"; Roman numerals too, "Iშესახვევის".
 */
function normaliseAddress(item: string): string {
  const front = /^\s*\(([^()]*)\)\s*(.+)$/.exec(item);
  const s = front ? `${front[2]} (${front[1]})` : item;
  return s
    .replace(/([ა-ჿ])\.(?=[ა-ჿ№\d])/g, "$1. ")
    .replace(/\s*#\s*(?=\d)/g, " № ") // "თამარ მეფის ქუჩა#2"
    .replace(/([ა-ჿ])№/g, "$1 №")
    .replace(/(\d)(?=[ა-ჿ]{3})/g, "$1 ")
    .replace(/\b([IVX]+)(?=[ა-ჿ])/g, "$1 ")
    .replace(/([^\s(])\(/g, "$1 (")
    .replace(/\)(?=[^\s,.)])/g, ") ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Split at commas and at ". " between words — never inside a parenthesis. */
function addressParts(s: string): string[] {
  const raw: string[] = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    const sentence = ch === "." && s[i + 1] === " " && hasGeorgian(s[i + 2] ?? "") && !isAbbreviation(cur);
    if (depth === 0 && (ch === "," || sentence)) {
      raw.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  raw.push(cur);
  const parts: string[] = [];
  for (const p of raw.map((x) => x.trim()).filter(Boolean)) {
    // "ბათუმის 25, 38": a lone house number belongs to the street before it.
    if (parts.length && HOUSE_NUMBERS.test(p)) parts[parts.length - 1] += `, ${p}`;
    else parts.push(...splitVillage(p));
  }
  return parts;
}

/** "...ს. ხიმშიაშვილის": the text before a dot ends with an initial or an abbreviation. */
function isAbbreviation(before: string): boolean {
  const last = before.trim().split(" ").pop() ?? "";
  return last.length <= 3 && hasGeorgian(last);
}

/** Words that come before a village's name and belong to it: "ქვემო ხანდაკი". */
const NAME_MODIFIERS = new Set(["ქვემო", "ზემო", "ზედა", "შუა", "ახალი", "ძველი", "დიდი", "პატარა"]);

const VILLAGE_TYPES = new Set(["sopel", "sop", "s", "daba"]);

function isVillageWord(tokens: string[], i: number): boolean {
  const t = typeWord(tokens[i]!);
  return !!t && VILLAGE_TYPES.has(t.prefix) && !isInitial(tokens, i);
}

/**
 * "სოფელი დიღომი დიდგორის ქუჩა" is a village and a street in it; "ს.
 * ნოჯიხევი 2 ქ." a village and its second street. The village takes its name,
 * the rest is a part of its own.
 */
function splitVillage(part: string): string[] {
  const tokens = part.split(" ");
  const i = tokens.findIndex((_, k) => isVillageWord(tokens, k));
  if (i === -1 || i + 1 >= tokens.length) return [part];
  let end = i + 1;
  if (NAME_MODIFIERS.has(tokens[end]!) && end + 1 < tokens.length) end++;
  const rest = tokens.slice(end + 1);
  // "სოფ.ახალდაბა (მე-2 ჩიხი)": a parenthesis stays with the village.
  const own = (w: string) => !!typeWord(w) || /^ნაწილ/.test(w); // "სოფ. ჩხარი ნაწილობრივ"
  if (rest.every(own) || rest[0]!.startsWith("(")) return [part];
  return [tokens.slice(0, end + 1).join(" "), rest.join(" ")];
}

/**
 * "ს." is "village" and also an initial: "ს. ხიმშიაშვილის ქ" is S. Khimshiashvili
 * Street. A name in the genitive with a street type after it is a person's.
 */
function isInitial(tokens: string[], i: number): boolean {
  if (skel(tokens[i]!) !== "s") return false;
  const next = tokens[i + 1];
  return !!next && /ს$/.test(next) && tokens.slice(i + 2).some((w) => STREET_TYPES.has(typeWord(w)?.prefix ?? ""));
}

const STREET_TYPES = new Set(["k", "kuch", "gamz", "shesahvev", "shes", "chih", "moedan", "moedn"]);

/**
 * Telasi's abbreviations of Tbilisi's suburbs and districts, "(წყნ)", "(სამგ)":
 * a short word that only one of these begins with is that one.
 */
const PLACES_ABBREVIATED = [
  "წყნეთი", "კოჯორი", "ტაბახმელა", "შინდისი", "ოქროყანა", "წავკისი", "ლისი", "დიღომი",
  "გლდანი", "ნაძალადევი", "დიდუბე", "ჩუღურეთი", "საბურთალო", "ვაკე", "მთაწმინდა",
  "კრწანისი", "ისანი", "სამგორი", "ვარკეთილი", "სოლოლაკი", "ავლაბარი",
];

function expandAbbreviation(word: string): string {
  if (word.length < 3 || word.length > 5 || !hasGeorgian(word)) return word;
  const found = PLACES_ABBREVIATED.filter((p) => p.startsWith(word) && p !== word);
  return found.length === 1 ? found[0]! : word;
}

const ORDINAL = /^მე-?(\d+)$/;

function ordinal(n: string, lang: Lang): string {
  if (lang !== "en") return `${n}-й`;
  const last = n.slice(-1);
  const teen = n.slice(-2, -1) === "1";
  return n + (!teen && last === "1" ? "st" : !teen && last === "2" ? "nd" : !teen && last === "3" ? "rd" : "th");
}

/**
 * "ნაწილობრივ" (partly), and "ნაწილი" after a genitive — "სოფ. ჭოგნარის
 * ნაწილი", part of the village. "სამხედრო ნაწილი" is a military unit.
 */
function isPartly(tokens: string[], i: number): boolean {
  const tok = tokens[i]!;
  return tok === "ნაწილობრივ" || (tok === "ნაწილი" && i > 0 && /ს$/.test(tokens[i - 1]!));
}

const MONTHS: Record<string, [string, string]> = {
  "იანვრის": ["января", "January"], "თებერვლის": ["февраля", "February"], "მარტის": ["марта", "March"],
  "აპრილის": ["апреля", "April"], "მაისის": ["мая", "May"], "ივნისის": ["июня", "June"],
  "ივლისის": ["июля", "July"], "აგვისტოს": ["августа", "August"], "სექტემბრის": ["сентября", "September"],
  "ოქტომბრის": ["октября", "October"], "ნოემბრის": ["ноября", "November"], "დეკემბრის": ["декабря", "December"],
};

/** One part of an address, as the existing rules have always read a street. */
function partLocal(part: string, lang: Lang, first = false): string {
  // A parenthesis is translated by itself and stays where it stood.
  const groups: string[] = [];
  const marked = part.replace(/\(([^()]*)\)/g, (_, inner: string) => {
    const words = inner.trim().split(" ");
    const local = words.length && words.every((w) => typeWord(w))
      ? words.map((w) => (lang === "en" ? typeWord(w)!.en : typeWord(w)!.ru)).join(" ") // "(კენტებს)" → "(нечёт.)"
      : `(${partLocal(words.length === 1 ? expandAbbreviation(words[0]!) : inner.trim(), lang)})`;
    groups.push(local);
    return ` \u0001${groups.length - 1} `;
  });
  const tokens = marked.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);

  // A place written as a type word alone — Tskneti's quarter "დაბა" — is a name.
  const words = tokens.filter((w) => !w.startsWith("\u0001"));
  const allTypes = words.length > 0 && words.every((w) => typeWord(w));

  const lead: string[] = [];
  const body: string[] = [];
  // The name to put into the nominative is the last name word before a type
  // word or a number — "ჭავჭავაძის" in "ჭავჭავაძის I შესახვევი".
  let nameEnd = -1;
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]!;
    // A parenthesis inside a name does not end it: "რაიმონდ (გურამ) გოგოლაძის".
    if (tok.startsWith("\u0001")) continue;
    const isType = (!!typeWord(tok) && !isInitial(tokens, i) && !allTypes) || isPartly(tokens, i);
    if (isType || !hasGeorgian(tok) || /\d/.test(tok)) {
      if (nameEnd === -1 && i > 0) nameEnd = i - 1;
    }
  }
  if (nameEnd === -1) nameEnd = tokens.length - 1;

  const no = lang === "en" ? "No." : "№";
  tokens.forEach((tok, i) => {
    if (tok.startsWith("\u0001")) return body.push(groups[Number(tok.slice(1))]!);
    // "ქ თბილისი, …": a "ქ" before the first place's name is ქალაქი, the town.
    // Elsewhere, "ქ. წამებულის", it is the street it usually is.
    if (first && i === 0 && /^ქ\.?$/.test(tok) && tokens.length > 1 && !/ს$/.test(tokens[1]!)) {
      if (lang !== "en") lead.push("г.");
      return;
    }
    if (isPartly(tokens, i)) return body.push(lang === "en" ? "(partly)" : "(частично)");
    const ord = ORDINAL.exec(tok);
    if (ord) return body.push(ordinal(ord[1]!, lang));
    // "9 აპრილის", "26 მაისის": a date names the street.
    const month = /^\d+$/.test(tokens[i - 1] ?? "") ? MONTHS[tok] : undefined;
    if (month) return body.push(lang === "en" ? month[1] : month[0]);
    const t = allTypes || isInitial(tokens, i) ? undefined : typeWord(tok);
    if (t) {
      const label = lang === "en" ? t.en : t.ru;
      const leads = lang === "en" ? t.enLead : t.lead;
      if (leads && !lead.includes(label)) lead.push(label);
      else if (!leads) body.push(label);
      return;
    }
    if (tok === "N" || tok === "№") return body.push(no);
    // An initial, "ბ.", is not a name to decline; "უტიაშვილის." is.
    const bare = tok.replace(/\.$/, "");
    const word = i === nameEnd && !/^[ა-ჿ]{1,3}\.$/.test(tok) ? toNominative(bare) : tok;
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

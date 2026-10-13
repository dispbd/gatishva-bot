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
// Georgian → Russian, for display.
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
  // Georgian has no capitals; Russian names need them.
  return out.replace(/(^|[^\p{L}])(\p{Ll})/gu, (_, sep: string, c: string) => sep + c.toUpperCase());
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
 * with how they read in Russian. `lead` ones move to the front, Russian style:
 * "ул. Чавчавадзе", not "Чавчавадзе ул.".
 */
const TYPE_WORDS: { prefix: string; ru: string; lead?: boolean; exact?: boolean }[] = [
  { prefix: "k", ru: "ул.", lead: true, exact: true }, // "ქ."
  { prefix: "kuch", ru: "ул.", lead: true },
  { prefix: "gamz", ru: "пр.", lead: true },
  { prefix: "shesahvev", ru: "пер." },
  { prefix: "chih", ru: "туп." },
  { prefix: "kvartl", ru: "кв." },
  { prefix: "kvartal", ru: "кв." },
  { prefix: "kv", ru: "кв.", exact: true },
  { prefix: "mikroraion", ru: "мкр" },
  { prefix: "mkr", ru: "мкр", exact: true },
  { prefix: "mr", ru: "мкр", exact: true },
  { prefix: "dasahleb", ru: "пос." },
  { prefix: "sopel", ru: "с.", lead: true },
  { prefix: "sop", ru: "с.", lead: true, exact: true },
  { prefix: "s", ru: "с.", lead: true, exact: true }, // "ს." — also "village"
  { prefix: "heivan", ru: "аллея" },
  { prefix: "heivn", ru: "аллея" }, // ხეივნის, without its vowel
  { prefix: "agmart", ru: "подъём" },
  { prefix: "dagmart", ru: "спуск" },
  { prefix: "moedan", ru: "пл.", lead: true },
  { prefix: "moedn", ru: "пл.", lead: true },
  { prefix: "gzatkecil", ru: "шоссе" },
  { prefix: "gasasvlel", ru: "проезд" },
  { prefix: "masiv", ru: "массив" },
  { prefix: "raion", ru: "р-н" },
  { prefix: "kentebs", ru: "(нечёт.)" },
  { prefix: "lucebs", ru: "(чёт.)" },
  { prefix: "teritori", ru: "терр." },
  { prefix: "mimdebare", ru: "окрестности" },
  { prefix: "da", ru: "и", exact: true },
];

function typeWord(word: string): (typeof TYPE_WORDS)[number] | undefined {
  if (!hasGeorgian(word)) return undefined;
  const k = skel(word);
  return TYPE_WORDS.find((t) => (t.exact ? k === t.prefix : k.startsWith(t.prefix)));
}

/**
 * One address as a Russian reader would write it: "ალექსანდრე ჭავჭავაძის ქ. N 4"
 * becomes "ул. Александре Чавчавадзе № 4". Text that is not Georgian is left alone.
 */
export function addressRu(item: string): string {
  if (!hasGeorgian(item)) return item.trim();
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

  tokens.forEach((tok, i) => {
    const t = typeWord(tok);
    if (t) {
      if (t.lead && !lead.includes(t.ru)) lead.push(t.ru);
      else if (!t.lead) body.push(t.ru);
      return;
    }
    if (tok === "N" || tok === "№") return body.push("№");
    const word = i === nameEnd ? toNominative(tok) : tok;
    body.push(translitRu(word.replace(/^N(?=\d)/, "№ ")));
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

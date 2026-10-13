// Everything the bot says, in Russian, English and Georgian.
//
// The providers write in Georgian. A reader of Russian or English gets the
// parsed fields and the addresses in their language with the Georgian original
// underneath; a reader of Georgian gets the original alone, since a
// "translation" would repeat it word for word.
//
// The language belongs to the chat, not to a person: a group reads one
// language. It starts as the first user's Telegram language and /lang changes it.

export type Lang = "ru" | "en" | "ka";
export const LANGS: Lang[] = ["ru", "en", "ka"];

export const LANG_NAME: Record<Lang, string> = { ru: "🇷🇺 Русский", en: "🇬🇧 English", ka: "🇬🇪 ქართული" };

/**
 * A chat's starting language from its first user's Telegram setting. Russian
 * for the languages whose speakers in Georgia mostly read it; English for the
 * rest; Russian, the bot's first audience, when Telegram says nothing (a post
 * in a channel carries no language at all).
 */
export function langFromTelegram(code: string | undefined): Lang {
  const base = (code ?? "").toLowerCase().split("-")[0] ?? "";
  if (base === "ka") return "ka";
  if (base === "" || ["ru", "uk", "be", "kk", "ky", "uz", "tg"].includes(base)) return "ru";
  return "en";
}

export function isLang(s: string | null | undefined): s is Lang {
  return s === "ru" || s === "en" || s === "ka";
}

function ruPlural(n: number, one: string, few: string, many: string): string {
  const d = n % 10;
  const dd = n % 100;
  if (d === 1 && dd !== 11) return one;
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return few;
  return many;
}

export type Reason =
  | "fire" | "switching" | "corrosion" | "damage" | "accident"
  | "reconstruction" | "maintenance" | "urgent" | "works"
  | "avalanche" | "landslide" | "rockfall" | "mudflow" | "snow" | "ice" | "flood";

export interface Strings {
  // --- outage messages ---
  utility: Record<"water" | "power" | "gas" | "road", string>;
  roadClosed: string;
  roadRestored: string;
  finished: (provider: string) => string;
  finishedReply: (icon: string, provider: string) => string;
  emergency: string;
  planned: string;
  reason: Record<Reason, string>;
  from: (t: string) => string;
  until: (t: string) => string;
  restoreAbout: (t: string) => string;
  restoreStale: (t: string) => string;
  wholeDistrict: (labels: string) => string;
  addresses: (n: number) => string;
  andMore: (n: number) => string;
  published: (t: string) => string;
  and: string;
  // --- conversation ---
  help: string;
  menu: { street: string; city: string; subs: string; types: string; now: string; lang: string };
  followingRoad: (label: string) => string;
  roadHint: string;
  promptStreet: string;
  promptStreetHint: string;
  streetExample: string;
  promptCity: string;
  promptCityHint: string;
  cityExample: string;
  districtExample: string;
  you: string;
  notAdmin: string;
  unknownCity: (typed: string) => string;
  tooShort: string;
  tooMany: (n: number) => string;
  followingCity: (city: string) => string;
  followingStreet: (label: string, city: string) => string;
  seenAs: (list: string) => string;
  notSeenYet: string;
  districtKnown: (districts: string) => string;
  districtUnknown: (label: string) => string;
  currentNow: (n: number) => string;
  listTitle: (n: number) => string;
  listEmpty: string;
  typesTitle: string;
  nowSome: (n: number) => string;
  nowNone: string;
  removed: string;
  alreadyRemoved: string;
  langTitle: string;
  langSet: string;
}

const SOURCES_RU =
  "GWP (вода, Тбилиси), Telasi (свет, Тбилиси), Tbilisi Energy (газ, Тбилиси), Energo-Pro (свет, регионы), SOCAR (газ, регионы), water.gov.ge (вода, регионы)";

const ru: Strings = {
  utility: { water: "Вода", power: "Свет", gas: "Газ", road: "Дороги" },
  roadClosed: "⛔ Движение ограничено",
  roadRestored: "✅ Движение восстановлено",
  finished: (p) => `✅ <b>Завершено</b> — ${p} убрал отключение из списка текущих`,
  finishedReply: (icon, p) => `✅ ${icon} По данным ${p}, отключение завершено.`,
  emergency: "⚠️ Аварийное",
  planned: "🛠 Плановое",
  reason: {
    fire: "пожар", switching: "переключение в сети", corrosion: "коррозия трубы",
    damage: "повреждение сети", accident: "авария", reconstruction: "реконструкция",
    maintenance: "профилактика", urgent: "срочные работы", works: "работы",
    avalanche: "лавинная опасность", landslide: "оползень", rockfall: "камнепад", mudflow: "сель",
    snow: "снегопад", ice: "гололёд", flood: "паводок",
  },
  from: (t) => `с ${t}`,
  until: (t) => `до ${t}`,
  restoreAbout: (t) => `⏱ Восстановление ≈ ${t}`,
  restoreStale: (t) => `⏱ Восстановление ожидалось к ${t} — раньше, чем вышло сообщение`,
  wholeDistrict: (labels) => `📍 Отключение на весь район, в том числе ${labels}`,
  addresses: (n) => `📋 Адреса (${n}):`,
  andMore: (n) => `… и ещё ${n}`,
  published: (t) => `опубликовано ${t}`,
  and: " и ",
  help: `Я присылаю отключения <b>воды 💧, света 💡 и газа 🔥</b> в Грузии — как только поставщик их опубликует. Ваша улица в сообщении выделена <b>жирным</b>, полный список адресов и текст поставщика спрятаны под спойлер.

<b>Подписаться на улицу</b> (Тбилиси):
/add Политковская
— можно по-русски, латиницей или по-грузински; сколько угодно улиц.

<b>Если вдруг отключат весь район</b>, бот поймёт, что это ваша улица, по прошлым отключениям. Новую улицу можно сразу привязать к району:
/add Политковская, Мтацминда

<b>В другом городе:</b>
/add Батуми, Руставели

<b>На весь город:</b>
/city Кутаиси

<b>Дороги</b> — перекрытия и восстановление движения:
/road Гудаури

/list — подписки и удаление
/types — выбрать воду, свет, газ
/now — что отключено прямо сейчас
/lang — язык

<b>В группе</b> подписки меняют только админы, а приходят сообщения всем.

Источники: ${SOURCES_RU}.`,
  menu: {
    street: "📍 Добавить улицу", city: "🏙 Весь город", subs: "📋 Подписки",
    types: "⚙️ Вода/свет/газ", now: "🔎 Что отключено сейчас", lang: "🌐 Язык",
  },
  followingRoad: (l) => `✅ Подписка на дороги: <b>${l}</b>. Пришлю, когда там ограничат или восстановят движение.`,
  roadHint: "Напишите место на дороге: /road Гудаури",
  promptStreet: "📍 Какую улицу добавить?",
  promptStreetHint: "Ответьте на это сообщение названием — по-русски, латиницей или по-грузински. Для другого города: «Батуми, Руставели».",
  streetExample: "Политковская",
  promptCity: "🏙 Какой город?",
  promptCityHint: "Ответьте на это сообщение: например, «Батуми».",
  cityExample: "Батуми",
  districtExample: "Мтацминда",
  you: "вы",
  notAdmin: "В группе подписки меняют только админы.",
  unknownCity: (x) => `Не знаю города «${x}». Проверьте написание — например, «Батуми» или «Кутаиси».`,
  tooShort: "Слишком коротко — напишите название улицы хотя бы из 4 букв.",
  tooMany: (n) => `Уже ${n} подписок — это предел. Удалите лишние в /list.`,
  followingCity: (c) => `✅ Подписка: весь город <b>${c}</b>.`,
  followingStreet: (l, c) => `✅ Подписка: <b>${l}</b> (${c}).`,
  seenAs: (list) => `Уже встречалась в отключениях как: ${list}.`,
  notSeenYet: "В недавних отключениях её не было — пришлю, как только появится.",
  districtKnown: (d) => `Район: ${d} — аварии на весь район тоже придут.`,
  districtUnknown: (l) => `Район улицы пока не знаю, и аварию на весь район не пришлю. Укажите его: /add ${l}, Мтацминда`,
  currentNow: (n) => `Сейчас по ней ${n} ${ruPlural(n, "отключение", "отключения", "отключений")} — присылаю.`,
  listTitle: (n) => `<b>Подписки (${n})</b> — нажмите, чтобы удалить:`,
  listEmpty: "Подписок пока нет. Добавьте улицу: /add Политковская",
  typesTitle: "Что присылать в этот чат:",
  nowSome: (n) => `🔎 Сейчас по вашим адресам: ${n}. Присылаю.`,
  nowNone: "✅ Сейчас по вашим адресам отключений нет.",
  removed: "Удалено",
  alreadyRemoved: "Уже удалено",
  langTitle: "Язык бота в этом чате:",
  langSet: "Готово: теперь по-русски.",
};

const en: Strings = {
  utility: { water: "Water", power: "Power", gas: "Gas", road: "Roads" },
  roadClosed: "⛔ Traffic restricted",
  roadRestored: "✅ Traffic restored",
  finished: (p) => `✅ <b>Over</b> — ${p} has taken it off its list of current outages`,
  finishedReply: (icon, p) => `✅ ${icon} According to ${p}, the outage is over.`,
  emergency: "⚠️ Emergency",
  planned: "🛠 Planned",
  reason: {
    fire: "fire", switching: "network switching", corrosion: "pipe corrosion",
    damage: "network damage", accident: "accident", reconstruction: "reconstruction",
    maintenance: "maintenance", urgent: "urgent works", works: "works",
    avalanche: "avalanche danger", landslide: "landslide", rockfall: "rockfall", mudflow: "mudflow",
    snow: "snowfall", ice: "ice", flood: "flood",
  },
  from: (t) => `from ${t}`,
  until: (t) => `until ${t}`,
  restoreAbout: (t) => `⏱ Back ≈ ${t}`,
  restoreStale: (t) => `⏱ Expected back by ${t} — before the notice even came out`,
  wholeDistrict: (labels) => `📍 The whole district is off, ${labels} included`,
  addresses: (n) => `📋 Addresses (${n}):`,
  andMore: (n) => `… and ${n} more`,
  published: (t) => `published ${t}`,
  and: " and ",
  help: `I send <b>water 💧, power 💡 and gas 🔥</b> outages in Georgia as soon as the provider publishes them. Your street is in <b>bold</b>; the full address list and the provider's own text are folded away underneath.

<b>Follow a street</b> (Tbilisi):
/add Politkovskaya
— in Latin, Russian or Georgian letters; as many streets as you like.

<b>If a whole district goes off</b>, the bot knows your street is in it from earlier outages. A new street can be tied to its district right away:
/add Politkovskaya, Mtatsminda

<b>In another city:</b>
/add Batumi, Rustaveli

<b>A whole city:</b>
/city Kutaisi

<b>Roads</b> — closures and reopenings:
/road Gudauri

/list — your subscriptions, and removing them
/types — water, power, gas
/now — what is off right now
/lang — language

<b>In a group</b> only admins change the subscriptions; everyone gets the messages.

Sources: GWP (water, Tbilisi), Telasi (power, Tbilisi), Tbilisi Energy (gas, Tbilisi), Energo-Pro (power, regions), SOCAR (gas, regions), water.gov.ge (water, regions).`,
  menu: {
    street: "📍 Add a street", city: "🏙 Whole city", subs: "📋 Subscriptions",
    types: "⚙️ Water/power/gas", now: "🔎 What's off now", lang: "🌐 Language",
  },
  followingRoad: (l) => `✅ Following roads: <b>${l}</b>. I'll tell you when traffic there is restricted or restored.`,
  roadHint: "Name a place on the road: /road Gudauri",
  promptStreet: "📍 Which street?",
  promptStreetHint: "Reply to this message with its name — in Latin, Russian or Georgian letters. For another city: “Batumi, Rustaveli”.",
  streetExample: "Politkovskaya",
  promptCity: "🏙 Which city?",
  promptCityHint: "Reply to this message: “Batumi”, for example.",
  cityExample: "Batumi",
  districtExample: "Mtatsminda",
  you: "you",
  notAdmin: "In a group only admins change the subscriptions.",
  unknownCity: (x) => `I don't know a city called “${x}”. Check the spelling — “Batumi” or “Kutaisi”, for example.`,
  tooShort: "Too short — give at least 4 letters of the street's name.",
  tooMany: (n) => `${n} subscriptions already — that's the limit. Remove some in /list.`,
  followingCity: (c) => `✅ Following: all of <b>${c}</b>.`,
  followingStreet: (l, c) => `✅ Following: <b>${l}</b> (${c}).`,
  seenAs: (list) => `Seen in outages before as: ${list}.`,
  notSeenYet: "Not in any recent outage — I'll send it as soon as it turns up.",
  districtKnown: (d) => `District: ${d} — outages of the whole district will reach you too.`,
  districtUnknown: (l) =>
    `I don't know the street's district yet, so an outage of the whole district would miss it. Name it: /add ${l}, Mtatsminda`,
  currentNow: (n) => `${n} ${n === 1 ? "outage" : "outages"} there right now — sending.`,
  listTitle: (n) => `<b>Subscriptions (${n})</b> — tap one to remove it:`,
  listEmpty: "No subscriptions yet. Add a street: /add Politkovskaya",
  typesTitle: "What to send to this chat:",
  nowSome: (n) => `🔎 At your addresses right now: ${n}. Sending.`,
  nowNone: "✅ Nothing is off at your addresses right now.",
  removed: "Removed",
  alreadyRemoved: "Already removed",
  langTitle: "The bot's language in this chat:",
  langSet: "Done: English from now on.",
};

const ka: Strings = {
  utility: { water: "წყალი", power: "შუქი", gas: "გაზი", road: "გზები" },
  roadClosed: "⛔ მოძრაობა შეზღუდულია",
  roadRestored: "✅ მოძრაობა აღდგა",
  finished: (p) => `✅ <b>დასრულდა</b> — ${p}-მ გათიშვა მიმდინარეების სიიდან ამოიღო`,
  finishedReply: (icon, p) => `✅ ${icon} ${p}-ის ცნობით, გათიშვა დასრულდა.`,
  emergency: "⚠️ ავარიული",
  planned: "🛠 გეგმიური",
  reason: {
    fire: "ხანძარი", switching: "ქსელში გადართვა", corrosion: "მილის კოროზია",
    damage: "ქსელის დაზიანება", accident: "ავარია", reconstruction: "რეკონსტრუქცია",
    maintenance: "პროფილაქტიკა", urgent: "გადაუდებელი სამუშაოები", works: "სამუშაოები",
    avalanche: "ზვავსაშიშროება", landslide: "მეწყერი", rockfall: "ქვაცვენა", mudflow: "ღვარცოფი",
    snow: "თოვლი", ice: "მოყინვა", flood: "წყალდიდობა",
  },
  from: (t) => `${t}-დან`,
  until: (t) => `${t}-მდე`,
  restoreAbout: (t) => `⏱ აღდგენა ≈ ${t}`,
  restoreStale: (t) => `⏱ აღდგენა ${t}-სთვის იყო მოსალოდნელი — შეტყობინების გამოქვეყნებამდე`,
  wholeDistrict: (labels) => `📍 გათიშულია მთელი რაიონი, მათ შორის ${labels}`,
  addresses: (n) => `📋 მისამართები (${n}):`,
  andMore: (n) => `… და კიდევ ${n}`,
  published: (t) => `გამოქვეყნდა ${t}`,
  and: " და ",
  help: `ვაგზავნი <b>წყლის 💧, შუქისა 💡 და გაზის 🔥</b> გათიშვებს საქართველოში — როგორც კი მომწოდებელი გამოაქვეყნებს. თქვენი ქუჩა შეტყობინებაში <b>მუქად</b> არის გამოყოფილი, მომწოდებლის სრული ტექსტი კი ჩაკეცილია.

<b>ქუჩის გამოწერა</b> (თბილისი):
/add პოლიტკოვსკაია
— ქართულად, ლათინურად ან რუსულად; რამდენი ქუჩაც გინდათ.

<b>თუ მთელ რაიონს გათიშავენ</b>, ბოტი წინა გათიშვებით მიხვდება, რომ ეს თქვენი ქუჩაა. ახალი ქუჩა შეგიძლიათ რაიონს მაშინვე მიაბათ:
/add პოლიტკოვსკაია, მთაწმინდა

<b>სხვა ქალაქში:</b>
/add ბათუმი, რუსთაველი

<b>მთელი ქალაქი:</b>
/city ქუთაისი

<b>გზები</b> — გზების ჩაკეტვა და მოძრაობის აღდგენა:
/road გუდაური

/list — გამოწერები და მათი წაშლა
/types — წყალი, შუქი, გაზი
/now — რა არის გათიშული ახლა
/lang — ენა

<b>ჯგუფში</b> გამოწერებს მხოლოდ ადმინები ცვლიან, შეტყობინებები კი ყველას მოდის.

წყაროები: GWP (წყალი, თბილისი), Telasi (შუქი, თბილისი), Tbilisi Energy (გაზი, თბილისი), Energo-Pro (შუქი, რეგიონები), SOCAR (გაზი, რეგიონები), water.gov.ge (წყალი, რეგიონები).`,
  menu: {
    street: "📍 ქუჩის დამატება", city: "🏙 მთელი ქალაქი", subs: "📋 გამოწერები",
    types: "⚙️ წყალი/შუქი/გაზი", now: "🔎 რა არის გათიშული", lang: "🌐 ენა",
  },
  followingRoad: (l) => `✅ გამოწერილია გზები: <b>${l}</b>. გაცნობებთ, როცა იქ მოძრაობას შეზღუდავენ ან აღადგენენ.`,
  roadHint: "დაწერეთ ადგილი გზაზე: /road გუდაური",
  promptStreet: "📍 რომელი ქუჩა დავამატო?",
  promptStreetHint: "უპასუხეთ ამ შეტყობინებას ქუჩის სახელით — ქართულად, ლათინურად ან რუსულად. სხვა ქალაქისთვის: „ბათუმი, რუსთაველი“.",
  streetExample: "პოლიტკოვსკაია",
  promptCity: "🏙 რომელი ქალაქი?",
  promptCityHint: "უპასუხეთ ამ შეტყობინებას: მაგალითად, „ბათუმი“.",
  cityExample: "ბათუმი",
  districtExample: "მთაწმინდა",
  you: "თქვენ",
  notAdmin: "ჯგუფში გამოწერებს მხოლოდ ადმინები ცვლიან.",
  unknownCity: (x) => `ქალაქი „${x}“ ვერ ვიპოვე. შეამოწმეთ მართლწერა — მაგალითად, „ბათუმი“ ან „ქუთაისი“.`,
  tooShort: "ძალიან მოკლეა — დაწერეთ ქუჩის სახელის მინიმუმ 4 ასო.",
  tooMany: (n) => `უკვე ${n} გამოწერა გაქვთ — ეს ზღვარია. ზედმეტი წაშალეთ /list-ში.`,
  followingCity: (c) => `✅ გამოწერილია მთელი ქალაქი: <b>${c}</b>.`,
  followingStreet: (l, c) => `✅ გამოწერილია: <b>${l}</b> (${c}).`,
  seenAs: (list) => `გათიშვებში უკვე შეგვხვედრია ასე: ${list}.`,
  notSeenYet: "ბოლო გათიშვებში არ ყოფილა — გამოგიგზავნით, როგორც კი გამოჩნდება.",
  districtKnown: (d) => `რაიონი: ${d} — მთელი რაიონის გათიშვებიც მოგივათ.`,
  districtUnknown: (l) =>
    `ქუჩის რაიონი ჯერ არ ვიცი, ამიტომ მთელი რაიონის გათიშვა ვერ მოგივათ. მიუთითეთ: /add ${l}, მთაწმინდა`,
  currentNow: (n) => `ახლა მასზე ${n} გათიშვაა — გიგზავნით.`,
  listTitle: (n) => `<b>გამოწერები (${n})</b> — წასაშლელად დააჭირეთ:`,
  listEmpty: "გამოწერები ჯერ არ არის. დაამატეთ ქუჩა: /add პოლიტკოვსკაია",
  typesTitle: "რა გამოვგზავნო ამ ჩატში:",
  nowSome: (n) => `🔎 ახლა თქვენს მისამართებზე: ${n}. გიგზავნით.`,
  nowNone: "✅ ახლა თქვენს მისამართებზე გათიშვა არ არის.",
  removed: "წაიშალა",
  alreadyRemoved: "უკვე წაშლილია",
  langTitle: "ბოტის ენა ამ ჩატში:",
  langSet: "მზადაა: ახლა ქართულად.",
};

const ALL: Record<Lang, Strings> = { ru, en, ka };

export function t(lang: Lang): Strings {
  return ALL[lang];
}

/** Every language's version of a string; for recognising a reply to a prompt. */
export function inEveryLang<T>(pick: (s: Strings) => T): T[] {
  return LANGS.map((l) => pick(ALL[l]));
}

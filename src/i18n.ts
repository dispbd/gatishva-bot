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
  | "avalanche" | "landslide" | "rockfall" | "mudflow" | "snow" | "ice" | "flood"
  | "wind" | "storm" | "rain" | "hail" | "thunder" | "heat" | "frost";

export interface Strings {
  // --- outage messages ---
  utility: Record<"water" | "power" | "gas" | "road" | "weather", string>;
  /** Danger levels 1-3 of a weather warning. */
  level: [string, string, string];
  warningLifted: (provider: string) => string;
  // --- residents' reports ---
  reportsKind: (people: number, minutes: number) => string;
  reportsUnconfirmed: string;
  reportsConfirmed: (provider: string, minutesEarlier: number) => string;
  reportAsk: string;
  reportWhat: Record<"water" | "power" | "gas", string>;
  reportWhere: string;
  reportOtherStreet: string;
  reportPrompt: Record<"water" | "power" | "gas", string>;
  reportPrivateOnly: string;
  reportCounted: (count: number, need: number) => string;
  reportSignal: (count: number) => string;
  reportRepeat: string;
  reportLimit: string;
  reportOfficial: (provider: string) => string;
  reportsToggle: string;
  // --- Messenger ---
  messengerHelp: (bot: string) => string;
  messengerNone: (street: string, bot: string) => string;
  messengerMore: (more: number, bot: string) => string;
  warningLiftedReply: (icon: string, provider: string) => string;
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
  wholeCity: (labels: string) => string;
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
  /** A point instead of a name: the location button and what can go wrong. */
  sendLocation: string;
  locationHint: string;
  locationOutside: string;
  locationUnknown: string;
  linkUnreadable: string;
  geoFailed: string;
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
  /** A typed address the notices read more than one way. */
  chooseTitle: (typed: string) => string;
  chooseHint: string;
  chooseAll: string;
  chooseCity: (city: string) => string;
  chooseOther: string;
  notThis: string;
  choiceExpired: string;
  retype: string;
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
  utility: { water: "Вода", power: "Свет", gas: "Газ", road: "Дороги", weather: "Опасная погода" },
  level: ["🟡 Опасность низкая", "🟠 Опасность средняя", "🔴 Опасность высокая"],
  warningLifted: (p) => `✅ <b>Отменено</b> — ${p} снял предупреждение`,
  warningLiftedReply: (icon, p) => `✅ ${icon} ${p} снял предупреждение.`,
  reportsKind: (n, m) => `👥 Сообщают жители: ${n} ${ruPlural(n, "человек", "человека", "человек")} за ${m} мин`,
  reportsUnconfirmed: "Официально пока не подтверждено",
  reportsConfirmed: (p, m) => (m > 0 ? `✅ Подтвердил ${p} — жители заметили на ${m} мин раньше` : `✅ Подтвердил ${p}`),
  reportAsk: "👥 Что случилось? Если у нескольких соседей то же самое, бот предупредит остальных.",
  reportWhat: { water: "💧 Нет воды", power: "💡 Нет света", gas: "🔥 Нет газа" },
  reportWhere: "Где? Выберите улицу или укажите другую:",
  reportOtherStreet: "✏️ Другая улица",
  reportPrompt: { water: "👥 💧 На какой улице нет воды?", power: "👥 💡 На какой улице нет света?", gas: "👥 🔥 На какой улице нет газа?" },
  reportPrivateOnly: "Сообщить можно в личке с ботом.",
  reportCounted: (c, n) => `Спасибо, учёл. На этой улице сообщили ${c} из ${n} — когда наберётся, предупрежу соседей.`,
  reportSignal: (c) => `Спасибо! Сообщили уже ${c} — соседи предупреждены.`,
  reportRepeat: "Вы уже сообщали об этом недавно — спасибо, учтено.",
  reportLimit: "На сегодня сообщений достаточно — спасибо!",
  reportOfficial: (p) => `Об этом уже известно официально (${p}) — смотрите /now.`,
  reportsToggle: "👥 Сообщения жителей",
  messengerHelp: (bot) => `Напишите улицу — например, «Политковская» или «Батуми, Руставели», — и я скажу, нет ли там сейчас отключений воды, света или газа.\n\nПолучать уведомления сразу, как отключение объявят, можно в Telegram: ${bot}`,
  messengerNone: (street, bot) => `✅ Сейчас на «${street}» отключений нет.\n\nЧтобы узнать сразу, когда они появятся, подпишитесь в Telegram: ${bot}`,
  messengerMore: (more, bot) => (more > 0 ? `И ещё ${more}. ` : "") + `Уведомления по этой улице — в Telegram: ${bot}`,
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
    wind: "сильный ветер", storm: "шторм", rain: "ливни", hail: "град", thunder: "гроза", heat: "жара", frost: "заморозки",
  },
  from: (t) => `с ${t}`,
  until: (t) => `до ${t}`,
  restoreAbout: (t) => `⏱ Восстановление ≈ ${t}`,
  restoreStale: (t) => `⏱ Восстановление ожидалось к ${t} — раньше, чем вышло сообщение`,
  wholeDistrict: (labels) => `📍 Отключение на весь район, в том числе ${labels}`,
  wholeCity: (labels) => `📍 Отключение на весь муниципалитет, в том числе ${labels}`,
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

<b>В селе или посёлке</b> — достаточно его названия, с улицей или без:
/add Бакуриани, Гоголадзе

<b>По точке на карте:</b> пришлите геолокацию 📍 или ссылку из карт — улицу найдёт OpenStreetMap, саму точку бот не хранит.

<b>На весь город:</b>
/city Кутаиси

<b>Дороги</b> — перекрытия и восстановление движения:
/road Гудаури

<b>Опасная погода</b> — предупреждения метеослужбы (шторм, ливни, сели, оползни) приходят сами, если вы подписаны на улицу или город в этом муниципалитете.

/list — подписки и удаление
/types — выбрать воду, свет, газ
/now — что отключено прямо сейчас
/report — сообщить, что у вас нет воды, света или газа: когда о том же сообщат несколько соседей, бот предупредит остальных
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
  sendLocation: "📍 Отправить геолокацию",
  locationHint: "Или пришлите геолокацию 📍 либо ссылку из карт — улицу по точке найдёт OpenStreetMap, саму точку бот не хранит.",
  locationOutside: "Эта точка не в Грузии — пришлите другую или напишите адрес.",
  locationUnknown: "По этой точке улицу не нашёл — напишите адрес словами.",
  linkUnreadable: "Не смог прочитать точку из этой ссылки — пришлите геолокацию 📍 или напишите адрес.",
  geoFailed: "Сервис карт сейчас не отвечает — попробуйте чуть позже или напишите адрес.",
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
  chooseTitle: (t) => `«${t}» может означать разные места. Какое ваше?`,
  chooseHint: "Число — сколько раз адрес встречался в отключениях за месяц.",
  chooseAll: "Все эти",
  chooseCity: (c) => `🏙 ${c} — весь город`,
  chooseOther: "✏️ Другое — напишу точнее",
  notThis: "✏️ Не то",
  choiceExpired: "Этот выбор устарел — отправьте адрес ещё раз: /add",
  retype: "Подписку убрал. Напишите адрес точнее — например, с городом или районом.",
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
  utility: { water: "Water", power: "Power", gas: "Gas", road: "Roads", weather: "Severe weather" },
  level: ["🟡 Low danger", "🟠 Medium danger", "🔴 High danger"],
  warningLifted: (p) => `✅ <b>Lifted</b> — ${p} has withdrawn the warning`,
  warningLiftedReply: (icon, p) => `✅ ${icon} ${p} has withdrawn the warning.`,
  reportsKind: (n, m) => `👥 Residents report: ${n} ${n === 1 ? "person" : "people"} in ${m} min`,
  reportsUnconfirmed: "Not confirmed officially yet",
  reportsConfirmed: (p, m) => (m > 0 ? `✅ Confirmed by ${p} — residents noticed ${m} min earlier` : `✅ Confirmed by ${p}`),
  reportAsk: "👥 What's wrong? If several neighbours say the same, the bot warns the rest.",
  reportWhat: { water: "💧 No water", power: "💡 No power", gas: "🔥 No gas" },
  reportWhere: "Where? Pick a street or name another:",
  reportOtherStreet: "✏️ Another street",
  reportPrompt: { water: "👥 💧 Which street has no water?", power: "👥 💡 Which street has no power?", gas: "👥 🔥 Which street has no gas?" },
  reportPrivateOnly: "Reports go through a private chat with the bot.",
  reportCounted: (c, n) => `Thanks, noted. ${c} of ${n} reports on this street — once there are enough, I'll warn the neighbours.`,
  reportSignal: (c) => `Thanks! ${c} reports now — the neighbours have been warned.`,
  reportRepeat: "You reported this a moment ago — thanks, it's counted.",
  reportLimit: "That's plenty of reports for today — thank you!",
  reportOfficial: (p) => `This is already known officially (${p}) — see /now.`,
  reportsToggle: "👥 Residents' reports",
  messengerHelp: (bot) => `Write a street — "Politkovskaya" or "Batumi, Rustaveli", say — and I'll tell you whether water, power or gas is off there right now.\n\nFor alerts the moment an outage is announced, use Telegram: ${bot}`,
  messengerNone: (street, bot) => `✅ Nothing is off on "${street}" right now.\n\nTo hear the moment something is, follow it in Telegram: ${bot}`,
  messengerMore: (more, bot) => (more > 0 ? `And ${more} more. ` : "") + `Alerts for this street: ${bot}`,
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
    wind: "strong wind", storm: "storm", rain: "heavy rain", hail: "hail", thunder: "thunderstorm", heat: "heat", frost: "frost",
  },
  from: (t) => `from ${t}`,
  until: (t) => `until ${t}`,
  restoreAbout: (t) => `⏱ Back ≈ ${t}`,
  restoreStale: (t) => `⏱ Expected back by ${t} — before the notice even came out`,
  wholeDistrict: (labels) => `📍 The whole district is off, ${labels} included`,
  wholeCity: (labels) => `📍 The whole municipality is off, ${labels} included`,
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

<b>In a village or small town</b> — its name will do, with a street or without:
/add Bakuriani, Gogoladze

<b>From a point on the map:</b> send a location 📍 or a maps link — OpenStreetMap finds the street; the bot does not keep the point.

<b>A whole city:</b>
/city Kutaisi

<b>Roads</b> — closures and reopenings:
/road Gudauri

<b>Severe weather</b> — the weather service's warnings (storms, heavy rain, mudflows, landslides) come by themselves to anyone following a street or city in that municipality.

/list — your subscriptions, and removing them
/types — water, power, gas
/now — what is off right now
/report — say you have no water, power or gas: when several neighbours say the same, the bot warns the rest
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
  sendLocation: "📍 Send my location",
  locationHint: "Or send a location 📍 or a maps link — OpenStreetMap finds the street; the bot does not keep the point.",
  locationOutside: "This point is not in Georgia — send another one or write the address.",
  locationUnknown: "No street found at this point — write the address in words.",
  linkUnreadable: "Couldn't read a point from this link — send a location 📍 or write the address.",
  geoFailed: "The map service isn't answering right now — try again a little later, or write the address.",
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
  chooseTitle: (t) => `“${t}” can mean several places. Which one is yours?`,
  chooseHint: "The number is how many outages named it this month.",
  chooseAll: "All of these",
  chooseCity: (c) => `🏙 ${c} — the whole city`,
  chooseOther: "✏️ Something else — I'll be more precise",
  notThis: "✏️ Not this one",
  choiceExpired: "This choice has expired — send the address again: /add",
  retype: "Removed. Write the address more precisely — with the city or the district, say.",
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
  utility: { water: "წყალი", power: "შუქი", gas: "გაზი", road: "გზები", weather: "საშიში ამინდი" },
  level: ["🟡 საფრთხის დონე დაბალი", "🟠 საფრთხის დონე საშუალო", "🔴 საფრთხის დონე მაღალი"],
  warningLifted: (p) => `✅ <b>გაუქმდა</b> — ${p}-მ გაფრთხილება მოხსნა`,
  warningLiftedReply: (icon, p) => `✅ ${icon} ${p}-მ გაფრთხილება მოხსნა.`,
  reportsKind: (n, m) => `👥 მაცხოვრებლები გვატყობინებენ: ${n} ადამიანი ${m} წუთში`,
  reportsUnconfirmed: "ოფიციალურად ჯერ არ დადასტურებულა",
  reportsConfirmed: (p, m) => (m > 0 ? `✅ დაადასტურა ${p}-მ — მაცხოვრებლებმა ${m} წუთით ადრე შეამჩნიეს` : `✅ დაადასტურა ${p}-მ`),
  reportAsk: "👥 რა მოხდა? თუ რამდენიმე მეზობელი იგივეს იტყვის, ბოტი დანარჩენებს გააფრთხილებს.",
  reportWhat: { water: "💧 წყალი არ არის", power: "💡 შუქი არ არის", gas: "🔥 გაზი არ არის" },
  reportWhere: "სად? აირჩიეთ ქუჩა ან მიუთითეთ სხვა:",
  reportOtherStreet: "✏️ სხვა ქუჩა",
  reportPrompt: { water: "👥 💧 რომელ ქუჩაზე არ არის წყალი?", power: "👥 💡 რომელ ქუჩაზე არ არის შუქი?", gas: "👥 🔥 რომელ ქუჩაზე არ არის გაზი?" },
  reportPrivateOnly: "შეტყობინება ბოტთან პირად ჩატში შეგიძლიათ.",
  reportCounted: (c, n) => `გმადლობთ, აღვრიცხე. ამ ქუჩაზე ${n}-დან ${c} შეტყობინებაა — როცა საკმარისი იქნება, მეზობლებს გავაფრთხილებ.`,
  reportSignal: (c) => `გმადლობთ! უკვე ${c} შეტყობინებაა — მეზობლები გაფრთხილებულნი არიან.`,
  reportRepeat: "ამის შესახებ ახლახან უკვე შეგვატყობინეთ — გმადლობთ, აღრიცხულია.",
  reportLimit: "დღეისთვის საკმარისი შეტყობინებაა — გმადლობთ!",
  reportOfficial: (p) => `ეს უკვე ოფიციალურადაა ცნობილი (${p}) — იხილეთ /now.`,
  reportsToggle: "👥 მაცხოვრებლების შეტყობინებები",
  messengerHelp: (bot) => `დაწერეთ ქუჩა — მაგალითად, „პოლიტკოვსკაია“ ან „ბათუმი, რუსთაველი“ — და გეტყვით, არის თუ არა იქ ახლა წყლის, შუქის ან გაზის გათიშვა.\n\nშეტყობინებები გათიშვის გამოცხადებისთანავე — Telegram-ში: ${bot}`,
  messengerNone: (street, bot) => `✅ „${street}“-ზე ახლა გათიშვა არ არის.\n\nრომ მაშინვე გაიგოთ, გამოიწერეთ Telegram-ში: ${bot}`,
  messengerMore: (more, bot) => (more > 0 ? `და კიდევ ${more}. ` : "") + `ამ ქუჩის შეტყობინებები — Telegram-ში: ${bot}`,
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
    wind: "ძლიერი ქარი", storm: "შტორმი", rain: "ძლიერი წვიმა", hail: "სეტყვა", thunder: "ჭექა-ქუხილი", heat: "სიცხე", frost: "წაყინვა",
  },
  from: (t) => `${t}-დან`,
  until: (t) => `${t}-მდე`,
  restoreAbout: (t) => `⏱ აღდგენა ≈ ${t}`,
  restoreStale: (t) => `⏱ აღდგენა ${t}-სთვის იყო მოსალოდნელი — შეტყობინების გამოქვეყნებამდე`,
  wholeDistrict: (labels) => `📍 გათიშულია მთელი რაიონი, მათ შორის ${labels}`,
  wholeCity: (labels) => `📍 გათიშულია მთელი მუნიციპალიტეტი, მათ შორის ${labels}`,
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

<b>სოფელში ან დაბაში</b> — საკმარისია მისი სახელი, ქუჩით ან მის გარეშე:
/add ბაკურიანი, გოგოლაძე

<b>რუკის წერტილით:</b> გამოგზავნეთ მდებარეობა 📍 ან რუკის ბმული — ქუჩას OpenStreetMap იპოვის, თავად წერტილს ბოტი არ ინახავს.

<b>მთელი ქალაქი:</b>
/city ქუთაისი

<b>გზები</b> — გზების ჩაკეტვა და მოძრაობის აღდგენა:
/road გუდაური

<b>საშიში ამინდი</b> — მეტეოსამსახურის გაფრთხილებები (შტორმი, ძლიერი წვიმა, ღვარცოფი, მეწყერი) თავად მოგივათ, თუ ამ მუნიციპალიტეტში ქუჩა ან ქალაქი გაქვთ გამოწერილი.

/list — გამოწერები და მათი წაშლა
/types — წყალი, შუქი, გაზი
/now — რა არის გათიშული ახლა
/report — შეგვატყობინეთ, რომ წყალი, შუქი ან გაზი არ გაქვთ: როცა რამდენიმე მეზობელი იგივეს იტყვის, ბოტი დანარჩენებს გააფრთხილებს
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
  sendLocation: "📍 მდებარეობის გაგზავნა",
  locationHint: "ან გამოგზავნეთ მდებარეობა 📍 ან რუკის ბმული — ქუჩას OpenStreetMap იპოვის, თავად წერტილს ბოტი არ ინახავს.",
  locationOutside: "ეს წერტილი საქართველოში არ არის — გამოგზავნეთ სხვა ან დაწერეთ მისამართი.",
  locationUnknown: "ამ წერტილზე ქუჩა ვერ ვიპოვე — დაწერეთ მისამართი სიტყვებით.",
  linkUnreadable: "ამ ბმულიდან წერტილი ვერ წავიკითხე — გამოგზავნეთ მდებარეობა 📍 ან დაწერეთ მისამართი.",
  geoFailed: "რუკის სერვისი ახლა არ პასუხობს — სცადეთ ცოტა მოგვიანებით ან დაწერეთ მისამართი.",
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
  chooseTitle: (t) => `„${t}“ რამდენიმე ადგილს შეიძლება ნიშნავდეს. რომელია თქვენი?`,
  chooseHint: "რიცხვი — რამდენჯერ ჩანდა ეს მისამართი ბოლო თვის გათიშვებში.",
  chooseAll: "ყველა",
  chooseCity: (c) => `🏙 ${c} — მთელი ქალაქი`,
  chooseOther: "✏️ სხვა — დავაზუსტებ",
  notThis: "✏️ ეს არ არის",
  choiceExpired: "ეს არჩევანი მოძველდა — გამოგზავნეთ მისამართი თავიდან: /add",
  retype: "გამოწერა მოვხსენი. დაწერეთ მისამართი უფრო ზუსტად — მაგალითად, ქალაქით ან რაიონით.",
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

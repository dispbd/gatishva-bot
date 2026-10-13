// The command menu in each language, apart from the bot so
// scripts/setup-telegram.mjs can import it under plain Node — bot.ts reaches the
// Durable Object, which only exists inside the Workers runtime.
//
// Telegram picks the menu by the user's own app language, which is not always
// the chat's language: these are hints, the bot answers in the chat's language.
// Russian is also the default, for every app language without a menu of its own.
type Command = { command: string; description: string };

export const BOT_COMMANDS: Record<"ru" | "en" | "ka", Command[]> = {
  ru: [
    { command: "add", description: "Подписаться на улицу" },
    { command: "city", description: "Подписаться на весь город" },
    { command: "road", description: "Перекрытия дорог" },
    { command: "list", description: "Мои подписки" },
    { command: "now", description: "Что отключено сейчас по моим адресам" },
    { command: "report", description: "Сообщить: у меня нет воды, света или газа" },
    { command: "types", description: "Вода, свет, газ — что присылать" },
    { command: "lang", description: "Язык" },
    { command: "help", description: "Как это работает" },
  ],
  en: [
    { command: "add", description: "Follow a street" },
    { command: "city", description: "Follow a whole city" },
    { command: "road", description: "Road closures" },
    { command: "list", description: "My subscriptions" },
    { command: "now", description: "What's off at my addresses now" },
    { command: "report", description: "Report: no water, power or gas here" },
    { command: "types", description: "Water, power, gas — what to send" },
    { command: "lang", description: "Language" },
    { command: "help", description: "How it works" },
  ],
  ka: [
    { command: "add", description: "ქუჩის გამოწერა" },
    { command: "city", description: "მთელი ქალაქის გამოწერა" },
    { command: "road", description: "გზების ჩაკეტვა" },
    { command: "list", description: "ჩემი გამოწერები" },
    { command: "now", description: "რა არის გათიშული ჩემს მისამართებზე" },
    { command: "report", description: "შეტყობინება: წყალი, შუქი ან გაზი არ მაქვს" },
    { command: "types", description: "წყალი, შუქი, გაზი — რა გამოვგზავნო" },
    { command: "lang", description: "ენა" },
    { command: "help", description: "როგორ მუშაობს" },
  ],
};

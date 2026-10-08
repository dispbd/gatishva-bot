// The command menu, apart from the bot so scripts/setup-telegram.mjs can import
// it under plain Node — bot.ts reaches the Durable Object, which only exists
// inside the Workers runtime.
export const BOT_COMMANDS = [
  { command: "add", description: "Подписаться на улицу" },
  { command: "city", description: "Подписаться на весь город" },
  { command: "list", description: "Мои подписки" },
  { command: "now", description: "Что отключено сейчас по моим адресам" },
  { command: "types", description: "Вода, свет, газ — что присылать" },
  { command: "help", description: "Как это работает" },
];

// Conversations: commands, buttons and the "type a street" prompt.
//
// Works the same in a private chat, a group and a channel. In a group the bot
// keeps Telegram's privacy mode on, so it is sent only commands and replies to
// its own messages — which is why the street prompt is a force-reply, and why
// "/add Руставели" works in one line. Only a group's admins may change what the
// group is subscribed to; anyone may look.
import { hub } from "./hub-do.ts";
import type { ChatInfo, AddResult } from "./hub-do.ts";
import { tg, describe, escapeHtml } from "./telegram.ts";
import type { TgUpdate, TgMessage, TgCallbackQuery, TgUser } from "./telegram.ts";
import { splitCityStreet, resolveCity, cityRu } from "./cities.ts";
import { DEFAULT_CITY } from "./match.ts";
import type { Sub } from "./match.ts";
import { UTILITY_ICON, UTILITY_NAME } from "./render.ts";
import { UTILITIES } from "./types.ts";
import type { Utility } from "./types.ts";

/** The prompts are recognised by their first words when someone replies to them. */
const PROMPT_STREET = "📍 Какую улицу добавить?";
const PROMPT_CITY = "🏙 Какой город?";

const HELP = `Я присылаю отключения <b>воды 💧, света 💡 и газа 🔥</b> в Грузии — как только поставщик их опубликует. Ваша улица в сообщении выделена <b>жирным</b>, полный список адресов и текст поставщика спрятаны под спойлер.

<b>Подписаться на улицу</b> (Тбилиси):
/add Политковская
— можно по-русски, латиницей или по-грузински; сколько угодно улиц.

<b>В другом городе:</b>
/add Батуми, Руставели

<b>На весь город:</b>
/city Кутаиси

/list — подписки и удаление
/types — выбрать воду, свет, газ
/now — что отключено прямо сейчас

<b>В группе</b> подписки меняют только админы, а приходят сообщения всем.

Источники: GWP (вода, Тбилиси), Telasi (свет, Тбилиси), Tbilisi Energy (газ, Тбилиси), Energo-Pro (свет, регионы), SOCAR (газ, регионы), water.gov.ge (вода, регионы).`;

function chatOf(m: TgMessage): ChatInfo {
  return { id: m.chat.id, type: m.chat.type, title: m.chat.title };
}

function botId(env: Env): number {
  return Number(env.TELEGRAM_BOT_TOKEN.split(":")[0]);
}

async function send(env: Env, chatId: number, text: string, extra: Record<string, unknown> = {}): Promise<void> {
  await tg(env, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...extra,
  });
}

/** May this sender change the chat's subscriptions? */
async function mayEdit(env: Env, m: { chat: { id: number; type: string }; from?: TgUser; sender_chat?: { id: number } }): Promise<boolean> {
  if (m.chat.type === "private" || m.chat.type === "channel") return true;
  // An anonymous admin posts as the group itself.
  if (m.sender_chat?.id === m.chat.id) return true;
  if (!m.from) return false;
  try {
    const member = await tg<{ status: string }>(env, "getChatMember", { chat_id: m.chat.id, user_id: m.from.id });
    return member.status === "creator" || member.status === "administrator";
  } catch (e) {
    console.warn(`getChatMember failed: ${describe(e)}`);
    return false;
  }
}

const NOT_ADMIN = "В группе подписки меняют только админы.";

export async function handleUpdate(env: Env, update: TgUpdate): Promise<void> {
  if (update.callback_query) return await onButton(env, update.callback_query);
  const m = update.message ?? update.channel_post;
  if (m?.text) await onText(env, m);
}

function menu(): Record<string, unknown> {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: "📍 Добавить улицу", callback_data: "m:add" }, { text: "🏙 Весь город", callback_data: "m:city" }],
        [{ text: "📋 Подписки", callback_data: "m:list" }, { text: "⚙️ Вода/свет/газ", callback_data: "m:types" }],
        [{ text: "🔎 Что отключено сейчас", callback_data: "m:now" }],
      ],
    },
  };
}

async function onText(env: Env, m: TgMessage): Promise<void> {
  const text = m.text!.trim();
  const chat = chatOf(m);

  // An answer to one of our prompts.
  const prompt = m.reply_to_message;
  if (prompt?.from?.id === botId(env) && prompt.text) {
    if (prompt.text.startsWith(PROMPT_STREET)) return await addStreet(env, m, text);
    if (prompt.text.startsWith(PROMPT_CITY)) return await addCity(env, m, text);
  }

  const cmd = /^\/([a-z_]+)(?:@(\w+))?(?:\s+([\s\S]*))?$/i.exec(text);
  if (!cmd) {
    // In private, a bare street name is the obvious intent.
    if (chat.type === "private") {
      const known = await hub(env).knownCities();
      if (resolveCity(text, known) && !/[,:]/.test(text)) return await addCity(env, m, text);
      return await addStreet(env, m, text);
    }
    return;
  }
  const [, name, mention, arg = ""] = cmd;
  if (mention && mention.toLowerCase() !== env.BOT_USERNAME.toLowerCase()) return;

  switch (name!.toLowerCase()) {
    case "start":
    case "help":
      return await send(env, chat.id, HELP, menu());
    case "add":
      return arg.trim() ? await addStreet(env, m, arg) : await askStreet(env, chat.id, m.from);
    case "city":
      return arg.trim() ? await addCity(env, m, arg) : await askCity(env, chat.id, m.from);
    case "list":
      return await showList(env, chat.id);
    case "types":
      return await showTypes(env, chat.id);
    case "now":
      return await showNow(env, chat.id);
    case "status":
      if (String(chat.id) === env.TELEGRAM_ALERT_CHAT_ID) return await send(env, chat.id, await hub(env).status());
      return;
  }
}

/** Mentioning the asker is what makes a force-reply in a group theirs alone. */
function askerMention(from?: TgUser): string {
  if (!from) return "";
  return ` <a href="tg://user?id=${from.id}">${escapeHtml(from.first_name ?? "вы")}</a>`;
}

async function askStreet(env: Env, chatId: number, from?: TgUser): Promise<void> {
  await send(
    env,
    chatId,
    `${PROMPT_STREET}${askerMention(from)}\nОтветьте на это сообщение названием — по-русски, латиницей или по-грузински. Для другого города: «Батуми, Руставели».`,
    { reply_markup: { force_reply: true, selective: true, input_field_placeholder: "Политковская" } },
  );
}

async function askCity(env: Env, chatId: number, from?: TgUser): Promise<void> {
  await send(env, chatId, `${PROMPT_CITY}${askerMention(from)}\nОтветьте на это сообщение: например, «Батуми».`, {
    reply_markup: { force_reply: true, selective: true, input_field_placeholder: "Батуми" },
  });
}

async function addStreet(env: Env, m: TgMessage, text: string): Promise<void> {
  if (!(await mayEdit(env, m))) return await send(env, m.chat.id, NOT_ADMIN);
  const h = hub(env);
  const { city, street } = splitCityStreet(text, await h.knownCities());
  const r = await h.addStreet(chatOf(m), street, city ?? DEFAULT_CITY);
  await send(env, m.chat.id, confirmation(r, city ?? DEFAULT_CITY));
}

async function addCity(env: Env, m: TgMessage, text: string): Promise<void> {
  if (!(await mayEdit(env, m))) return await send(env, m.chat.id, NOT_ADMIN);
  const h = hub(env);
  const city = resolveCity(text, await h.knownCities());
  if (!city) {
    return await send(env, m.chat.id, `Не знаю города «${escapeHtml(text)}». Проверьте написание — например, «Батуми» или «Кутаиси».`);
  }
  const r = await h.addCity(chatOf(m), city);
  await send(env, m.chat.id, confirmation(r, city));
}

function confirmation(r: AddResult, city: string): string {
  if (!r.ok || !r.sub) return `❌ ${r.error}`;
  const what = r.sub.kind === "city" ? `весь город <b>${escapeHtml(cityRu(city))}</b>` : `<b>${escapeHtml(r.sub.label)}</b> (${escapeHtml(cityRu(city))})`;
  const lines = [`✅ Подписка: ${what}.`];
  if (r.examples.length) {
    lines.push(`Уже встречалась в отключениях как: ${r.examples.map((e) => `<i>${escapeHtml(e)}</i>`).join(", ")}.`);
  } else if (r.sub.kind === "street") {
    lines.push("В недавних отключениях её не было — пришлю, как только появится.");
  }
  if (r.current) lines.push(`Сейчас по ней ${r.current} ${plural(r.current, "отключение", "отключения", "отключений")} — присылаю.`);
  return lines.join("\n");
}

function plural(n: number, one: string, few: string, many: string): string {
  const d = n % 10;
  const dd = n % 100;
  if (d === 1 && dd !== 11) return one;
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return few;
  return many;
}

function subLabel(s: Sub): string {
  return s.kind === "city" ? `🏙 ${cityRu(s.label)}` : `📍 ${s.label}`;
}

async function showList(env: Env, chatId: number, editMessageId?: number): Promise<void> {
  const subs = await hub(env).subsOf(chatId);
  const text = subs.length
    ? `<b>Подписки (${subs.length})</b> — нажмите, чтобы удалить:`
    : "Подписок пока нет. Добавьте улицу: /add Политковская";
  const keyboard = subs.map((s) => [{ text: `❌ ${subLabel(s)}`.slice(0, 60), callback_data: `del:${s.id}` }]);
  const payload = { chat_id: chatId, text, parse_mode: "HTML", reply_markup: { inline_keyboard: keyboard } };
  if (editMessageId) await tg(env, "editMessageText", { ...payload, message_id: editMessageId });
  else await tg(env, "sendMessage", payload);
}

function typesKeyboard(on: Utility[]) {
  return {
    inline_keyboard: [
      UTILITIES.map((u) => ({
        text: `${on.includes(u) ? "✅" : "▫️"} ${UTILITY_ICON[u]} ${UTILITY_NAME[u]}`,
        callback_data: `tog:${u}`,
      })),
    ],
  };
}

async function showTypes(env: Env, chatId: number): Promise<void> {
  const on = await hub(env).utilities(chatId);
  await send(env, chatId, "Что присылать в этот чат:", { reply_markup: typesKeyboard(on) });
}

async function showNow(env: Env, chatId: number): Promise<void> {
  const n = await hub(env).current(chatId);
  await send(env, chatId, n ? `🔎 Сейчас по вашим адресам: ${n}. Присылаю.` : "✅ Сейчас по вашим адресам отключений нет.");
}

async function onButton(env: Env, q: TgCallbackQuery): Promise<void> {
  const data = q.data ?? "";
  const msg = q.message;
  const answer = (text?: string) =>
    tg(env, "answerCallbackQuery", { callback_query_id: q.id, ...(text ? { text } : {}) }).catch(() => {});
  if (!msg) return void (await answer());
  const chatId = msg.chat.id;
  const ctx = { chat: msg.chat, from: q.from };

  if (data === "m:list") return void (await Promise.all([answer(), showList(env, chatId)]));
  if (data === "m:types") return void (await Promise.all([answer(), showTypes(env, chatId)]));
  if (data === "m:now") return void (await Promise.all([answer(), showNow(env, chatId)]));

  // Everything below changes the chat's settings.
  if (!(await mayEdit(env, ctx))) return void (await answer(NOT_ADMIN));

  if (data === "m:add") return void (await Promise.all([answer(), askStreet(env, chatId, q.from)]));
  if (data === "m:city") return void (await Promise.all([answer(), askCity(env, chatId, q.from)]));

  const del = /^del:(\d+)$/.exec(data);
  if (del) {
    const removed = await hub(env).removeSub(chatId, Number(del[1]));
    await answer(removed ? "Удалено" : "Уже удалено");
    return await showList(env, chatId, msg.message_id);
  }

  const tog = /^tog:(water|power|gas)$/.exec(data);
  if (tog) {
    const on = await hub(env).toggleUtility(chatId, tog[1] as Utility);
    await answer();
    await tg(env, "editMessageReplyMarkup", {
      chat_id: chatId,
      message_id: msg.message_id,
      reply_markup: typesKeyboard(on),
    }).catch(() => {});
    return;
  }
  await answer();
}

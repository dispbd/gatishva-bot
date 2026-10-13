// Conversations: commands, buttons and the "type a street" prompt.
//
// Works the same in a private chat, a group and a channel. In a group the bot
// keeps Telegram's privacy mode on, so it is sent only commands and replies to
// its own messages — which is why the street prompt is a force-reply, and why
// "/add Руставели" works in one line. Only a group's admins may change what the
// group is subscribed to; anyone may look.
//
// Everything is said in the chat's language (see src/i18n.ts), which every
// update looks up first: a new chat takes its first user's Telegram language.
import { hub } from "./hub-do.ts";
import type { ChatInfo, AddResult } from "./hub-do.ts";
import { tg, describe, escapeHtml } from "./telegram.ts";
import type { TgUpdate, TgMessage, TgCallbackQuery, TgUser } from "./telegram.ts";
import { splitCityStreet, splitStreetDistrict, resolveCity } from "./cities.ts";
import { translit, addressLocal } from "./georgian.ts";
import { DEFAULT_CITY } from "./match.ts";
import type { Sub } from "./match.ts";
import { UTILITY_ICON } from "./render.ts";
import { UTILITIES } from "./types.ts";
import type { Utility } from "./types.ts";
import { t, inEveryLang, langFromTelegram, isLang, LANGS, LANG_NAME } from "./i18n.ts";
import type { Lang } from "./i18n.ts";

function chatOf(chat: { id: number; type: string; title?: string }): ChatInfo {
  return { id: chat.id, type: chat.type, title: chat.title };
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

export async function handleUpdate(env: Env, update: TgUpdate): Promise<void> {
  if (update.callback_query) return await onButton(env, update.callback_query);
  const m = update.message ?? update.channel_post;
  if (m?.text) await onText(env, m);
}

function menu(lang: Lang): Record<string, unknown> {
  const M = t(lang).menu;
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: M.street, callback_data: "m:add" }, { text: M.city, callback_data: "m:city" }],
        [{ text: M.subs, callback_data: "m:list" }, { text: M.types, callback_data: "m:types" }],
        [{ text: M.now, callback_data: "m:now" }, { text: M.lang, callback_data: "m:lang" }],
      ],
    },
  };
}

async function onText(env: Env, m: TgMessage): Promise<void> {
  const text = m.text!.trim();
  const chat = chatOf(m.chat);
  const lang = await hub(env).chatLang(chat, langFromTelegram(m.from?.language_code));

  // An answer to one of our prompts — in whatever language it was asked.
  const prompt = m.reply_to_message;
  if (prompt?.from?.id === botId(env) && prompt.text) {
    if (inEveryLang((s) => s.promptStreet).some((p) => prompt.text!.startsWith(p))) return await addStreet(env, m, text, lang);
    if (inEveryLang((s) => s.promptCity).some((p) => prompt.text!.startsWith(p))) return await addCity(env, m, text, lang);
  }

  const cmd = /^\/([a-z_]+)(?:@(\w+))?(?:\s+([\s\S]*))?$/i.exec(text);
  if (!cmd) {
    // In private, a bare street name is the obvious intent.
    if (chat.type === "private") {
      const known = await hub(env).knownCities();
      if (resolveCity(text, known) && !/[,:]/.test(text)) return await addCity(env, m, text, lang);
      return await addStreet(env, m, text, lang);
    }
    return;
  }
  const [, name, mention, arg = ""] = cmd;
  if (mention && mention.toLowerCase() !== env.BOT_USERNAME.toLowerCase()) return;

  switch (name!.toLowerCase()) {
    case "start":
    case "help":
      return await send(env, chat.id, t(lang).help, menu(lang));
    case "add":
      return arg.trim() ? await addStreet(env, m, arg, lang) : await askStreet(env, chat.id, lang, m.from);
    case "city":
      return arg.trim() ? await addCity(env, m, arg, lang) : await askCity(env, chat.id, lang, m.from);
    case "list":
      return await showList(env, chat.id, lang);
    case "types":
      return await showTypes(env, chat.id, lang);
    case "now":
      return await showNow(env, chat.id, lang);
    case "lang":
      return await showLangs(env, chat.id, lang);
    case "status":
      if (String(chat.id) === env.TELEGRAM_ALERT_CHAT_ID) return await send(env, chat.id, await hub(env).status());
      return;
  }
}

/** Mentioning the asker is what makes a force-reply in a group theirs alone. */
function askerMention(lang: Lang, from?: TgUser): string {
  if (!from) return "";
  return ` <a href="tg://user?id=${from.id}">${escapeHtml(from.first_name ?? t(lang).you)}</a>`;
}

async function askStreet(env: Env, chatId: number, lang: Lang, from?: TgUser): Promise<void> {
  const S = t(lang);
  await send(env, chatId, `${S.promptStreet}${askerMention(lang, from)}\n${S.promptStreetHint}`, {
    reply_markup: { force_reply: true, selective: true, input_field_placeholder: S.streetExample },
  });
}

async function askCity(env: Env, chatId: number, lang: Lang, from?: TgUser): Promise<void> {
  const S = t(lang);
  await send(env, chatId, `${S.promptCity}${askerMention(lang, from)}\n${S.promptCityHint}`, {
    reply_markup: { force_reply: true, selective: true, input_field_placeholder: S.cityExample },
  });
}

async function addStreet(env: Env, m: TgMessage, text: string, lang: Lang): Promise<void> {
  if (!(await mayEdit(env, m))) return await send(env, m.chat.id, t(lang).notAdmin);
  const h = hub(env);
  const { city, street } = splitCityStreet(text, await h.knownCities());
  // "Политковская, Мтацминда": districts are only known for Tbilisi.
  const { street: name, district } = city ? { street, district: undefined } : splitStreetDistrict(street);
  const r = await h.addStreet(chatOf(m.chat), name, city ?? DEFAULT_CITY, district);
  await send(env, m.chat.id, confirmation(r, city ?? DEFAULT_CITY, lang));
}

async function addCity(env: Env, m: TgMessage, text: string, lang: Lang): Promise<void> {
  if (!(await mayEdit(env, m))) return await send(env, m.chat.id, t(lang).notAdmin);
  const h = hub(env);
  const city = resolveCity(text, await h.knownCities());
  if (!city) return await send(env, m.chat.id, t(lang).unknownCity(escapeHtml(text)));
  const r = await h.addCity(chatOf(m.chat), city);
  await send(env, m.chat.id, confirmation(r, city, lang));
}

function confirmation(r: AddResult, city: string, lang: Lang): string {
  const S = t(lang);
  if (!r.ok || !r.sub) return `❌ ${r.error === "too_many" ? S.tooMany(r.count ?? 0) : S.tooShort}`;
  const place = escapeHtml(translit(city, lang));
  const lines = [r.sub.kind === "city" ? S.followingCity(place) : S.followingStreet(escapeHtml(r.sub.label), place)];
  if (r.examples.length) {
    lines.push(S.seenAs(r.examples.map((e) => `<i>${escapeHtml(addressLocal(e, lang))}</i>`).join(", ")));
  } else if (r.sub.kind === "street") {
    lines.push(S.notSeenYet);
  }
  if (r.sub.kind === "street" && city === DEFAULT_CITY) {
    // A fault that cuts a whole district names no streets; the district is
    // how such a notice finds this subscription, so say whether it is known.
    lines.push(
      r.districts.length
        ? S.districtKnown(escapeHtml(r.districts.map((d) => translit(d, lang)).join(", ")))
        : S.districtUnknown(escapeHtml(r.sub.label)),
    );
  }
  if (r.current) lines.push(S.currentNow(r.current));
  return lines.join("\n");
}

function subLabel(s: Sub, lang: Lang): string {
  if (s.kind === "city") return `🏙 ${translit(s.label, lang)}`;
  const where = s.districts?.length ? ` · ${s.districts.map((d) => translit(d, lang)).join(", ")}` : "";
  return `📍 ${s.label}${where}`;
}

async function showList(env: Env, chatId: number, lang: Lang, editMessageId?: number): Promise<void> {
  const S = t(lang);
  const subs = await hub(env).subsOf(chatId);
  const text = subs.length ? S.listTitle(subs.length) : S.listEmpty;
  const keyboard = subs.map((s) => [{ text: `❌ ${subLabel(s, lang)}`.slice(0, 60), callback_data: `del:${s.id}` }]);
  const payload = { chat_id: chatId, text, parse_mode: "HTML", reply_markup: { inline_keyboard: keyboard } };
  if (editMessageId) await tg(env, "editMessageText", { ...payload, message_id: editMessageId });
  else await tg(env, "sendMessage", payload);
}

function typesKeyboard(on: Utility[], lang: Lang) {
  return {
    inline_keyboard: [
      UTILITIES.map((u) => ({
        text: `${on.includes(u) ? "✅" : "▫️"} ${UTILITY_ICON[u]} ${t(lang).utility[u]}`,
        callback_data: `tog:${u}`,
      })),
    ],
  };
}

async function showTypes(env: Env, chatId: number, lang: Lang): Promise<void> {
  const on = await hub(env).utilities(chatId);
  await send(env, chatId, t(lang).typesTitle, { reply_markup: typesKeyboard(on, lang) });
}

async function showNow(env: Env, chatId: number, lang: Lang): Promise<void> {
  const n = await hub(env).current(chatId);
  await send(env, chatId, n ? t(lang).nowSome(n) : t(lang).nowNone);
}

function langKeyboard(current: Lang) {
  return {
    inline_keyboard: [
      LANGS.map((l) => ({ text: `${l === current ? "✅ " : ""}${LANG_NAME[l]}`, callback_data: `lang:${l}` })),
    ],
  };
}

async function showLangs(env: Env, chatId: number, lang: Lang): Promise<void> {
  await send(env, chatId, t(lang).langTitle, { reply_markup: langKeyboard(lang) });
}

async function onButton(env: Env, q: TgCallbackQuery): Promise<void> {
  const data = q.data ?? "";
  const msg = q.message;
  const answer = (text?: string) =>
    tg(env, "answerCallbackQuery", { callback_query_id: q.id, ...(text ? { text } : {}) }).catch(() => {});
  if (!msg) return void (await answer());
  const chatId = msg.chat.id;
  const ctx = { chat: msg.chat, from: q.from };
  const lang = await hub(env).chatLang(chatOf(msg.chat), langFromTelegram(q.from.language_code));

  if (data === "m:list") return void (await Promise.all([answer(), showList(env, chatId, lang)]));
  if (data === "m:types") return void (await Promise.all([answer(), showTypes(env, chatId, lang)]));
  if (data === "m:now") return void (await Promise.all([answer(), showNow(env, chatId, lang)]));
  if (data === "m:lang") return void (await Promise.all([answer(), showLangs(env, chatId, lang)]));

  // Everything below changes the chat's settings.
  if (!(await mayEdit(env, ctx))) return void (await answer(t(lang).notAdmin));

  if (data === "m:add") return void (await Promise.all([answer(), askStreet(env, chatId, lang, q.from)]));
  if (data === "m:city") return void (await Promise.all([answer(), askCity(env, chatId, lang, q.from)]));

  const del = /^del:(\d+)$/.exec(data);
  if (del) {
    const removed = await hub(env).removeSub(chatId, Number(del[1]));
    await answer(removed ? t(lang).removed : t(lang).alreadyRemoved);
    return await showList(env, chatId, lang, msg.message_id);
  }

  const tog = /^tog:(water|power|gas)$/.exec(data);
  if (tog) {
    const on = await hub(env).toggleUtility(chatId, tog[1] as Utility);
    await answer();
    await tg(env, "editMessageReplyMarkup", {
      chat_id: chatId,
      message_id: msg.message_id,
      reply_markup: typesKeyboard(on, lang),
    }).catch(() => {});
    return;
  }

  const pick = /^lang:(\w+)$/.exec(data);
  if (pick && isLang(pick[1])) {
    const chosen = pick[1];
    await hub(env).setLang(chatId, chosen);
    await answer(t(chosen).langSet);
    // Say it in the new language, with the menu that speaks it.
    await tg(env, "editMessageText", {
      chat_id: chatId,
      message_id: msg.message_id,
      text: t(chosen).langTitle,
      reply_markup: langKeyboard(chosen),
    }).catch(() => {});
    await send(env, chatId, t(chosen).help, menu(chosen));
    return;
  }
  await answer();
}

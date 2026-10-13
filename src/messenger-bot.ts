// The Messenger conversation: a street in, what is off there now out.
// See src/messenger.ts for why that is all Messenger can do here.
import { hub } from "./hub-do.ts";
import { messengerConfig, verifyHandshake, signatureValid, incoming, langOfText, reply } from "./messenger.ts";
import type { Incoming, MessengerConfig } from "./messenger.ts";
import { toPlain } from "./facebook.ts";
import { renderOutage } from "./render.ts";
import { splitCityStreet } from "./cities.ts";
import { DEFAULT_CITY, streetSub } from "./match.ts";
import { t } from "./i18n.ts";

/** How many outages one answer shows; more would bury the first. */
const SHOWN = 3;

export async function messengerWebhook(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const cfg = messengerConfig(env);
  if (!cfg) return new Response("not found\n", { status: 404 });

  if (request.method === "GET") {
    const challenge = verifyHandshake(new URL(request.url), cfg);
    return challenge ? new Response(challenge) : new Response("forbidden\n", { status: 403 });
  }

  const body = await request.text();
  if (!(await signatureValid(body, request.headers.get("x-hub-signature-256"), cfg.appSecret))) {
    return new Response("forbidden\n", { status: 403 });
  }
  let messages: Incoming[];
  try {
    messages = incoming(JSON.parse(body));
  } catch {
    return new Response("bad request\n", { status: 400 });
  }
  // Meta wants its 200 quickly and redelivers otherwise; answer afterwards.
  for (const m of messages) ctx.waitUntil(answer(env, cfg, m).catch((e) => console.error(`messenger: ${e}`)));
  return new Response("ok\n");
}

const HELP_WORDS = /^\/?(start|help|hi|hello|помощь|старт|привет|начать|დახმარება|გამარჯობა|დაწყება)$/i;

async function answer(env: Env, cfg: MessengerConfig, m: Incoming): Promise<void> {
  const lang = langOfText(m.text);
  const S = t(lang);
  const bot = `https://t.me/${env.BOT_USERNAME}`;
  if (HELP_WORDS.test(m.text)) return await reply(cfg, m.psid, S.messengerHelp(bot));

  const h = hub(env);
  const { city, street } = splitCityStreet(m.text, await h.knownCities());
  const sub = { id: -1, chatId: -1, ...streetSub(street, city ?? DEFAULT_CITY) };
  if (sub.keys.length === 0) return await reply(cfg, m.psid, S.tooShort);

  const found = await h.currentFor(street, city ?? DEFAULT_CITY);
  if (found.length === 0) return await reply(cfg, m.psid, S.messengerNone(street, bot));
  for (const o of found.slice(0, SHOWN)) {
    await reply(cfg, m.psid, toPlain(renderOutage(o, [sub], { lang })));
  }
  await reply(cfg, m.psid, S.messengerMore(found.length - SHOWN, bot));
}

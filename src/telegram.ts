// Only the slices of the Bot API's objects this bot actually reads. Typing the
// whole API would be a library; typing what we touch is what catches mistakes.
export interface TgUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
  /** The user's Telegram language, "ru" or "en-GB"; seeds a new chat's language. */
  language_code?: string;
}

export interface TgChat {
  id: number;
  type: string;
  title?: string;
}

export interface TgMessage {
  message_id: number;
  from?: TgUser;
  /**
   * Set when a message is sent on behalf of a chat: an anonymous group admin
   * posts as the group itself, and that is how we recognise them.
   */
  sender_chat?: TgChat;
  chat: TgChat;
  text?: string;
  /**
   * The message this one replies to. In a group with privacy mode on, a reply to
   * the bot's own message is one of the few things Telegram delivers at all —
   * which is why the "type a street" prompt is a force-reply.
   */
  reply_to_message?: TgMessage;
  /**
   * A service message in a group that has just become a supergroup: the
   * group's new id (see src/chat-move.ts).
   */
  migrate_to_chat_id?: number;
}

export interface TgCallbackQuery {
  id: string;
  from: TgUser;
  message?: { message_id: number; chat: TgChat };
  data?: string;
}

export interface TgUpdate {
  message?: TgMessage;
  /** A post in a channel. It is a different update type from a group message. */
  channel_post?: TgMessage;
  callback_query?: TgCallbackQuery;
}

/**
 * The update types the webhook subscribes to. Anything left out is never sent at
 * all — channels, for one, only work because `channel_post` is here.
 */
export const ALLOWED_UPDATES = ["message", "channel_post", "callback_query"];

/** What the Bot API answers with; `result` is method-specific. */
interface TgResponse<T> {
  ok: boolean;
  result: T;
  description?: string;
  error_code?: number;
  parameters?: { retry_after?: number; migrate_to_chat_id?: number };
}

/**
 * A failed Bot API call. Callers branch on `description` — "message is not
 * modified", "bot was blocked by the user" — and on `retryAfter` when Telegram
 * says to slow down, so these are real fields rather than text in a message.
 */
export class TelegramError extends Error {
  readonly description: string;
  readonly errorCode: number | undefined;
  /** Seconds Telegram asked us to wait (HTTP 429). */
  readonly retryAfter: number | undefined;
  /** The group became a supergroup, and this is its new id. */
  readonly migrateTo: number | undefined;

  constructor(method: string, description: string, errorCode?: number, retryAfter?: number, migrateTo?: number) {
    super(`Telegram ${method} failed: ${description}`);
    this.name = "TelegramError";
    this.description = description;
    this.errorCode = errorCode;
    this.retryAfter = retryAfter;
    this.migrateTo = migrateTo;
  }
}

/** Minimal Telegram Bot API client. */
export async function tg<T = any>(
  env: Env,
  method: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await r.json()) as TgResponse<T>;
  if (!data.ok) {
    throw new TelegramError(
      method,
      data.description ?? String(r.status),
      data.error_code,
      data.parameters?.retry_after,
      data.parameters?.migrate_to_chat_id,
    );
  }
  return data.result;
}

/**
 * The chat is gone for good as far as we are concerned: the user blocked the
 * bot, deleted their account, or the bot was removed from the group. Retrying
 * cannot help, so the caller drops the chat's subscriptions. A group that became
 * a supergroup is not gone: see `migrateTo`.
 */
export function isChatGone(e: unknown): boolean {
  if (!(e instanceof TelegramError)) return false;
  if (e.errorCode === 403) return true;
  return /chat not found|user is deactivated|group chat was deleted/i.test(e.description);
}

/** Editing to identical text is an error in Telegram, but a no-op for us. */
export function isNotModified(e: unknown): boolean {
  return /not modified/i.test(describe(e));
}

/** The description of a failed call, whatever kind of error object it arrived in. */
export function describe(e: unknown): string {
  if (e instanceof TelegramError) return e.description;
  if (e instanceof Error) return e.message;
  return String(e ?? "");
}

export function escapeHtml(s: unknown): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

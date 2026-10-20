// A group that becomes a supergroup keeps its subscriptions under the new id.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { moveChat } from "../src/chat-move.ts";
import { tg, isChatGone } from "../src/telegram.ts";

const OLD = -5570692192;
const NEW = -1003697966099;

/** The chat-owned tables, with the same keys as in src/hub-do.ts. */
function db() {
  const d = new DatabaseSync(":memory:");
  d.exec(`
    CREATE TABLE chats (id INTEGER PRIMARY KEY, type TEXT, title TEXT, utilities TEXT, lang TEXT);
    CREATE TABLE subs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id INTEGER NOT NULL, kind TEXT NOT NULL,
      city TEXT NOT NULL, label TEXT NOT NULL, keys TEXT NOT NULL, UNIQUE (chat_id, kind, city, keys));
    CREATE TABLE sub_districts (sub_id INTEGER NOT NULL, district TEXT NOT NULL, PRIMARY KEY (sub_id, district));
    CREATE TABLE sent (key TEXT NOT NULL, chat_id INTEGER NOT NULL, message_id INTEGER NOT NULL, PRIMARY KEY (key, chat_id));
    CREATE TABLE outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id INTEGER NOT NULL, key TEXT NOT NULL, op TEXT NOT NULL,
      UNIQUE (chat_id, key, op));
    CREATE TABLE reports (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, chat_id INTEGER NOT NULL);
  `);
  const exec = (q, ...b) => d.prepare(q).run(...b);
  const all = (q, ...b) => d.prepare(q).all(...b).map((r) => ({ ...r }));
  return { exec, all };
}

test("everything the group had moves to its new id", () => {
  const { exec, all } = db();
  exec(`INSERT INTO chats VALUES (?, 'group', 'Test', 'water,gas', 'en')`, OLD);
  exec(`INSERT INTO subs (chat_id, kind, city, label, keys) VALUES (?, 'street', 'tbilisi', 'Жвания', 'zhvani')`, OLD);
  exec(`INSERT INTO sub_districts VALUES (1, 'მთაწმინდა')`);
  exec(`INSERT INTO sent VALUES ('gwp:1', ?, 77)`, OLD);
  exec(`INSERT INTO outbox (chat_id, key, op) VALUES (?, 'gwp:1', 'edit')`, OLD);
  exec(`INSERT INTO chats VALUES (42, 'private', NULL, 'water', 'ru')`);
  exec(`INSERT INTO subs (chat_id, kind, city, label, keys) VALUES (42, 'street', 'tbilisi', 'Жвания', 'zhvani')`);

  moveChat(exec, OLD, NEW);

  assert.deepEqual(all(`SELECT id, type, utilities, lang FROM chats ORDER BY id`), [
    { id: NEW, type: "supergroup", utilities: "water,gas", lang: "en" },
    { id: 42, type: "private", utilities: "water", lang: "ru" },
  ]);
  assert.deepEqual(all(`SELECT id, chat_id FROM subs ORDER BY id`), [{ id: 1, chat_id: NEW }, { id: 2, chat_id: 42 }]);
  assert.deepEqual(all(`SELECT sub_id FROM sub_districts`), [{ sub_id: 1 }]);
  assert.deepEqual(all(`SELECT chat_id, message_id FROM sent`), [{ chat_id: NEW, message_id: 77 }]);
  assert.deepEqual(all(`SELECT chat_id, op FROM outbox`), [{ chat_id: NEW, op: "edit" }]);
});

test("if the supergroup already used the bot, nothing is doubled and the old settings win", () => {
  const { exec, all } = db();
  exec(`INSERT INTO chats VALUES (?, 'group', 'Test', 'power', 'ka')`, OLD);
  exec(`INSERT INTO chats VALUES (?, 'supergroup', 'Test', 'water,power,gas', 'ru')`, NEW);
  exec(`INSERT INTO subs (chat_id, kind, city, label, keys) VALUES (?, 'street', 'tbilisi', 'Жвания', 'zhvani')`, OLD);
  exec(`INSERT INTO subs (chat_id, kind, city, label, keys) VALUES (?, 'city', 'batumi', 'Батуми', 'batumi')`, OLD);
  exec(`INSERT INTO subs (chat_id, kind, city, label, keys) VALUES (?, 'street', 'tbilisi', 'Zhvania', 'zhvani')`, NEW);
  exec(`INSERT INTO sub_districts VALUES (1, 'მთაწმინდა')`);
  exec(`INSERT INTO outbox (chat_id, key, op) VALUES (?, 'gwp:1', 'new')`, OLD);
  exec(`INSERT INTO outbox (chat_id, key, op) VALUES (?, 'gwp:1', 'new')`, NEW);

  moveChat(exec, OLD, NEW);

  assert.deepEqual(all(`SELECT id, utilities, lang FROM chats`), [{ id: NEW, utilities: "power", lang: "ka" }]);
  assert.deepEqual(all(`SELECT chat_id, label FROM subs ORDER BY id`), [
    { chat_id: NEW, label: "Батуми" },
    { chat_id: NEW, label: "Zhvania" },
  ]);
  assert.deepEqual(all(`SELECT * FROM sub_districts`), []); // its street was the duplicate
  assert.equal(all(`SELECT * FROM outbox`).length, 1);
});

test("Telegram's 'upgraded' answer carries the new id and is not a chat gone", async (t) => {
  mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({
    ok: false,
    error_code: 400,
    description: "Bad Request: group chat was upgraded to a supergroup chat",
    parameters: { migrate_to_chat_id: NEW },
  })));
  t.after(() => mock.restoreAll());
  const e = await tg({ TELEGRAM_BOT_TOKEN: "1:x" }, "sendMessage", { chat_id: OLD, text: "hi" }).catch((e) => e);
  assert.equal(e.migrateTo, NEW);
  assert.equal(isChatGone(e), false);
});

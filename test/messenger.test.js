import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  messengerConfig, verifyHandshake, signatureValid, incoming, langOfText, clip, reply, MESSENGER_LIMIT,
} from "../src/messenger.ts";

const cfg = messengerConfig({ FB_PAGE_TOKEN: "tok", FB_APP_SECRET: "secret", FB_VERIFY_TOKEN: "verify" });

test("Messenger stays off until all three settings are there", () => {
  assert.equal(messengerConfig({}), undefined);
  assert.equal(messengerConfig({ FB_PAGE_TOKEN: "t", FB_APP_SECRET: "s" }), undefined);
  assert.ok(cfg);
});

test("Meta's handshake is answered only with the right verify token", () => {
  const url = (token) => new URL(`https://bot.example/fb?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=42`);
  assert.equal(verifyHandshake(url("verify"), cfg), "42");
  assert.equal(verifyHandshake(url("wrong"), cfg), undefined);
});

test("only bodies signed with the app secret are accepted", async () => {
  const body = JSON.stringify({ object: "page", entry: [] });
  const good = `sha256=${createHmac("sha256", "secret").update(body).digest("hex")}`;
  assert.equal(await signatureValid(body, good, "secret"), true);
  assert.equal(await signatureValid(body + " ", good, "secret"), false);
  assert.equal(await signatureValid(body, good, "other"), false);
  assert.equal(await signatureValid(body, null, "secret"), false);
});

test("the messages to answer: people's text, not the Page's own echoes", () => {
  const body = {
    object: "page",
    entry: [{
      messaging: [
        { sender: { id: "1" }, message: { text: " Жвания " } },
        { sender: { id: "page" }, message: { text: "our reply", is_echo: true } },
        { sender: { id: "2" }, postback: { payload: "GET_STARTED", title: "Get Started" } },
        { sender: { id: "3" }, message: { attachments: [] } },
      ],
    }],
  };
  assert.deepEqual(incoming(body), [{ psid: "1", text: "Жвания" }, { psid: "2", text: "/start" }]);
  assert.deepEqual(incoming({ object: "instagram", entry: body.entry }), []);
});

test("the answer comes in the script the question was written in", () => {
  assert.equal(langOfText("პოლიტკოვსკაია"), "ka");
  assert.equal(langOfText("Жвания"), "ru");
  assert.equal(langOfText("Rustaveli"), "en");
});

test("an answer is sent as a free RESPONSE, clipped to Messenger's limit", async (t) => {
  const calls = [];
  mock.method(globalThis, "fetch", async (url, init) => (calls.push({ url: String(url), body: JSON.parse(init.body) }), new Response("{}")));
  t.after(() => mock.restoreAll());
  await reply(cfg, "1", "x".repeat(MESSENGER_LIMIT + 50));
  assert.match(calls[0].url, /\/me\/messages\?access_token=tok$/);
  assert.equal(calls[0].body.messaging_type, "RESPONSE");
  assert.deepEqual(calls[0].body.recipient, { id: "1" });
  assert.equal(calls[0].body.message.text.length, MESSENGER_LIMIT);
  assert.equal(clip("short"), "short");
});

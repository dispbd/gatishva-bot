// A Telegram group that becomes a supergroup gets a new chat id, and the old
// one answers every send with "group chat was upgraded to a supergroup chat"
// and the new id. Telegram does this on its own — when history is made visible
// to new members, when the group is made public, past 200 members — so the
// admins never asked to be unsubscribed: what the chat had moves to the new id.
type Exec = (query: string, ...binds: (string | number | null)[]) => unknown;

/**
 * Move everything a chat owns from `from` to `to`. If the new id already has
 * the same subscription (someone used the bot in the supergroup first), the
 * duplicate is dropped; the old chat's settings win, since its admins chose them.
 */
export function moveChat(exec: Exec, from: number, to: number): void {
  if (from === to) return;
  exec(`DELETE FROM chats WHERE id = ? AND EXISTS (SELECT 1 FROM chats WHERE id = ?)`, to, from);
  exec(`UPDATE chats SET id = ?, type = 'supergroup' WHERE id = ?`, to, from);

  exec(`UPDATE OR IGNORE subs SET chat_id = ? WHERE chat_id = ?`, to, from);
  exec(`DELETE FROM sub_districts WHERE sub_id IN (SELECT id FROM subs WHERE chat_id = ?)`, from);
  exec(`DELETE FROM subs WHERE chat_id = ?`, from);

  // The messages already sent: edits and "it's over" replies still find them,
  // or, if the ids did not survive the move, quietly do without (see deliver).
  exec(`UPDATE OR IGNORE sent SET chat_id = ? WHERE chat_id = ?`, to, from);
  exec(`DELETE FROM sent WHERE chat_id = ?`, from);
  exec(`UPDATE OR IGNORE outbox SET chat_id = ? WHERE chat_id = ?`, to, from);
  exec(`DELETE FROM outbox WHERE chat_id = ?`, from);
  exec(`UPDATE reports SET chat_id = ? WHERE chat_id = ?`, to, from);
}

// Secret names, declared here rather than discovered: `wrangler types` only sees
// secrets listed in the gitignored .dev.vars, so without this file the type of
// `env` would depend on an untracked local file and CI would fail where a laptop
// passes. TypeScript merges these into the generated `interface Env`.
interface Env {
  TELEGRAM_BOT_TOKEN: string;
  TG_WEBHOOK_SECRET: string;
  /** Optional: the operator's own chat, for "a source is broken" alerts and /status. */
  TELEGRAM_ALERT_CHAT_ID?: string;
}

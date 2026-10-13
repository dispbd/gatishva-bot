// Secret names, declared here rather than discovered: `wrangler types` only sees
// secrets listed in the gitignored .dev.vars, so without this file the type of
// `env` would depend on an untracked local file and CI would fail where a laptop
// passes. TypeScript merges these into the generated `interface Env`.
interface Env {
  TELEGRAM_BOT_TOKEN: string;
  TG_WEBHOOK_SECRET: string;
  /** Optional: the operator's own chat, for "a source is broken" alerts and /status. */
  TELEGRAM_ALERT_CHAT_ID?: string;
  /**
   * The Facebook Page (docs/facebook.md). Off while either of the first two is
   * missing. FB_PAGE_TOKEN is a secret; the rest are plain vars.
   */
  FB_PAGE_ID?: string;
  FB_PAGE_TOKEN?: string;
  /** Comma-separated Georgian city names the Page follows; Tbilisi if unset. */
  FB_PAGE_CITIES?: string;
  /** ka, ru or en; Georgian if unset. */
  FB_PAGE_LANG?: string;
  FB_GRAPH_VERSION?: string;
}

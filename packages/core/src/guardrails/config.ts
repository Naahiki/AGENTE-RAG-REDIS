// packages/core/guardrails/config.ts
import * as dotenv from "dotenv";
dotenv.config();

function bool(v: any, def = false) {
  if (v == null) return def;
  const s = String(v).trim().toLowerCase();
  return ["1", "true", "yes", "y", "on"].includes(s);
}
function int(v: any, def: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

export type GuardMode = "off" | "log" | "enforce";

// packages/core/guardrails/config.ts
export const GUARD_cfg = {
  enabled: (process.env.GUARDRAILS_ENABLED || "0") === "1",
  mode: (process.env.GUARD_MODE || "enforce") as "off" | "log" | "enforce",

  // Heurísticas pre
  ragMinDocs: parseInt(process.env.GUARD_RAG_MIN_DOCS || "1", 10),
  minQueryTokens: parseInt(process.env.GUARD_MIN_QUERY_TOKENS || "3", 10),
  greetingRegex: new RegExp(process.env.GUARD_GREETING_REGEX || "^(hola|buenas|buenos dias|buenas tardes|buenas noches|hello|hi)\\b", "i"),
  denylistRegex: process.env.GUARD_DENYLIST_REGEX ? new RegExp(process.env.GUARD_DENYLIST_REGEX, "i") : null,

  // Embed gate
  useEmbedGate: (process.env.GUARD_USE_EMBED_GATE || "1") === "1",
  embedModel: process.env.GUARD_EMBED_MODEL || "text-embedding-3-small",
  embedThreshold: parseFloat(process.env.GUARD_EMBED_THRESHOLD || "0.18"),

  // Post-LLM
  requireUrlWhitelist: (process.env.GUARD_REQUIRE_URL_WHITELIST || "1") === "1",
  postScopeCheckEnabled: (process.env.GUARD_POST_SCOPE_ENABLED || "1") === "1",
  postUseEmbedGate: (process.env.GUARD_POST_USE_EMBED_GATE || "0") === "1",
};


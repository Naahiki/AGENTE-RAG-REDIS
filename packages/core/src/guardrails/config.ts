import * as dotenv from "dotenv";
dotenv.config();

function toBool(v: string | undefined, def = false) {
  if (v == null) return def;
  return ["1", "true", "on", "yes"].includes(v.toLowerCase());
}

export const GUARD_cfg = {
  enabled: toBool(process.env.GUARDRAILS_ENABLED, true),
  ragMinDocs: parseInt(process.env.GUARD_RAG_MIN_DOCS || "1", 10),
  minQueryTokens: parseInt(process.env.GUARD_MIN_QUERY_TOKENS || "3", 10),
  outOfScopeRegex: process.env.GUARD_OUT_OF_SCOPE_REGEX
    ? new RegExp(process.env.GUARD_OUT_OF_SCOPE_REGEX, "i")
    : null,
  requireUrlWhitelist: toBool(process.env.GUARD_REQUIRE_URL_WHITELIST, true),
  // 👇 nuevo: saludo configurable
  greetingRegex: new RegExp(
    process.env.GUARD_GREETING_REGEX ||
      // hola, buenas, qué tal, hello, hi, etc.
      "\\b(hola+|buenas+|buenos dias|buenas tardes|buenas noches|qué tal|que tal|hello|hi)\\b",
    "i"
  ),
};

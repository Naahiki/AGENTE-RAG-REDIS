import { GUARD_cfg } from "./config";
import type { GuardrailType } from "./types";

function tokenCount(s: string) {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

export function detectPreLLM(query: string, docs: any[]): GuardrailType[] {
  if (!GUARD_cfg.enabled) return [];
  const out: GuardrailType[] = [];

  const docsLen = docs?.length || 0;

  // 1) OUT_OF_SCOPE por denylist
  if (GUARD_cfg.outOfScopeRegex && GUARD_cfg.outOfScopeRegex.test(query)) {
    out.push("OUT_OF_SCOPE");
  }

  // 2) OUT_OF_SCOPE por allowlist (si activado y sin soporte RAG)
  if (
    GUARD_cfg.useAllowlist &&
    GUARD_cfg.allowlistRegex &&
    docsLen < GUARD_cfg.ragMinDocs &&
    !GUARD_cfg.allowlistRegex.test(query)
  ) {
    out.push("OUT_OF_SCOPE");
  }

  // 3) RAG vacío
  if (docsLen < GUARD_cfg.ragMinDocs) {
    out.push("RAG_EMPTY");
  }

  // 4) Query ambigua
  if (tokenCount(query) < GUARD_cfg.minQueryTokens) {
    out.push("VAGUE_QUERY");
  }

  return out;
}

import { GUARD_cfg } from "./config";
import type { GuardrailType } from "./types";

function tokenCount(s: string) {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function isGreeting(query: string) {
  return GUARD_cfg.greetingRegex?.test(query || "") ?? false;
}

export function detectPreLLM(query: string, docs: any[]): GuardrailType[] {
  if (!GUARD_cfg.enabled) return [];
  const out: GuardrailType[] = [];

  // 👇 prioridad absoluta: saludo
  if (isGreeting(query)) {
    out.push("GREETING");
    return out; // corta aquí, no queremos OUT_OF_SCOPE para un saludo
  }

  if ((docs?.length || 0) < GUARD_cfg.ragMinDocs) {
    out.push("RAG_EMPTY");
  }

  if (tokenCount(query) < GUARD_cfg.minQueryTokens) {
    out.push("VAGUE_QUERY");
  }

  if (GUARD_cfg.outOfScopeRegex && GUARD_cfg.outOfScopeRegex.test(query)) {
    out.push("OUT_OF_SCOPE");
  }

  return out;
}

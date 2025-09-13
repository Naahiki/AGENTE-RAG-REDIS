// packages/core/src/guardrails/apply.ts
import { GUARD_cfg } from "./config";
import { guardrailMsgs } from "./messages";
import type { PostProcessOutcome } from "./types";

function normalizeUrl(u: string) {
  return u.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

// ✅ NUEVO: normalizador de texto para checks de ámbito
function normText(s: string) {
  return (s || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** ✅ NUEVO: post-LLM scope guard. Si huele a fuera de ámbito -> sustituye la respuesta. */
export function enforceScopeAfterLLM(
  userText: string,
  content: string
): { content: string; overridden: boolean } {
  if (!GUARD_cfg.enabled) return { content, overridden: false };

  // Si no hay regex configurado, no forzamos nada
  if (!GUARD_cfg.outOfScopeRegex) return { content, overridden: false };

  const u = normText(userText);
  const c = normText(content);

  if (GUARD_cfg.outOfScopeRegex.test(u) || GUARD_cfg.outOfScopeRegex.test(c)) {
    return { content: guardrailMsgs.OUT_OF_SCOPE, overridden: true };
  }
  return { content, overridden: false };
}

export function enforceUrlWhitelist(
  content: string,
  allowed: string[]
): PostProcessOutcome {
  if (!GUARD_cfg.enabled || !GUARD_cfg.requireUrlWhitelist) {
    return { content, strippedUrls: [] };
  }

  const allowedNorm = new Set(allowed.map(normalizeUrl));
  const urlRegex = /\bhttps?:\/\/[^\s)\]]+/gi;

  const stripped: string[] = [];
  const out = content.replace(urlRegex, (match) => {
    const ok = allowed.includes(match) || allowedNorm.has(normalizeUrl(match));
    if (!ok) {
      stripped.push(match);
      return ""; // elimina la URL no permitida
    }
    return match;
  });

  return { content: out, strippedUrls: stripped };
}

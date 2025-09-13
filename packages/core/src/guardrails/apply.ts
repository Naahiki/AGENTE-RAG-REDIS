import { GUARD_cfg } from "./config";
import type { PostProcessOutcome } from "./types";

function normalize(u: string) {
  return u.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export function enforceUrlWhitelist(content: string, allowed: string[]): PostProcessOutcome {
  if (!GUARD_cfg.enabled || !GUARD_cfg.requireUrlWhitelist) {
    return { content, strippedUrls: [] };
  }
  const allowedNorm = new Set(allowed.map(normalize));
  const urlRegex = /\bhttps?:\/\/[^\s)\]]+/gi;
  const stripped: string[] = [];
  const out = content.replace(urlRegex, (match) => {
    const ok = allowed.includes(match) || allowedNorm.has(normalize(match));
    if (!ok) {
      stripped.push(match);
      return "";
    }
    return match;
  });
  return { content: out, strippedUrls: stripped };
}

// NEW: refuerzo post-LLM (sobre contenido)
export function enforceScopeAfterLLM(
  userQuery: string,
  content: string,
  docsLen: number
): { content: string; overridden: boolean } {
  if (!GUARD_cfg.enabled) return { content, overridden: false };

  // Si el query ya cae en denylist, override
  if (GUARD_cfg.outOfScopeRegex && GUARD_cfg.outOfScopeRegex.test(userQuery)) {
    return {
      content:
        "Puedo ayudarte con ayudas del Gobierno de Navarra. Si buscas algo distinto, dime y te indico por dónde seguir.",
      overridden: true,
    };
  }

  // Si el contenido “huele” a fuera de ámbito (p. ej., recetas) => override
  if (GUARD_cfg.outOfScopeRegex && GUARD_cfg.outOfScopeRegex.test(content)) {
    return {
      content:
        "Puedo ayudarte con ayudas del Gobierno de Navarra. Si buscas algo distinto, dime y te indico por dónde seguir.",
      overridden: true,
    };
  }

  // Si usamos allowlist: sin RAG y query no coincide con allowlist => override
//   if (
//     GUARD_cfg.useAllowlist &&
//     GUARD_cfg.allowlistRegex &&
//     docsLen < (GUARD_cfg.ragMinDocs || 1) &&
//     !GUARD_cfg.allowlistRegex.test(userQuery)
//   ) {
//     return {
//       content:
//         "Puedo ayudarte con ayudas del Gobierno de Navarra. Para afinar, dime tamaño de empresa, sector y objetivo (contratar / invertir / digitalizar / energía / internacionalizar).",
//       overridden: true,
//     };
//   }

  return { content, overridden: false };
}

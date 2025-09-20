// packages/core/src/onboarding/extractor.ts
import { UserProfile } from "./types";

/**
 * Extrae un patch parcial del perfil desde el mensaje del usuario.
 * - Soporta extracción contextual (si se esperaba un campo concreto).
 * - Incluye fallbacks "siempre activos" para company_size y sector/objective
 *   para evitar bucles si, por cualquier motivo, no se detecta `expecting`.
 */
export function extractPatch(
  msg: string,
  expecting?: keyof UserProfile | null
): Partial<UserProfile> {
  const patch: Partial<UserProfile> = {};
  const text = (msg || "").trim();

  // ===== Helpers =====
  const captureCompanySize = (): string | null => {
    // 15 empleados | 15 emp. | somos 15 | facturamos ~3M
    const m1 = text.match(/\b(\d{1,4})\s*(emplead[oa]s?|emp\.?)\b/i);
    const m2 = text.match(/\bsomos\s+(\d{1,4})\b/i);
    const m3 = text.match(/\bfactur(a|amos)\s+~?\s*([\d.,]+)\s*m\b/i);
    if (m1) return `${m1[1]}`;
    if (m2) return `${m2[1]}`;
    if (m3) return `~${m3[2]}M€`;
    return null;
  };

  const looksShortText = (s: string, max = 80) =>
    s.length <= max && /\p{L}/u.test(s); // contiene letras y es corto

  const looksLikeIntentVerb = /\b(contratar|internacionaliz|automatiz|digitaliz|expandir|entrar|exportar|innovar|mejorar|vender)\w*/i;

  // ===== (0) Extracción contextual por expecting =====
  if (expecting === "company_size") {
    const val = captureCompanySize();
    if (val) patch.company_size = val;
  } else if (expecting === "sector") {
    // Acepta respuestas cortas tipo "metal", "sector del metal", "software B2B"
    if (looksShortText(text)) patch.sector = text;
  } else if (expecting === "objective") {
    // Acepta objetivos razonables y breves
    if (text && text.length <= 140) patch.objective = text;
  }

  // ===== (1) Fallback clave:valor (company_size|tamaño|sector|objective|objetivo: xxxx) =====
  const rx = /\b(company_size|tamaño|tamano|sector|objective|objetivo)\s*[:=]\s*([^\n,.;]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(text)) !== null) {
    const keyRaw = m[1].toLowerCase();
    const val = (m[2] || "").trim();
    const key =
      keyRaw === "tamaño" || keyRaw === "tamano"
        ? "company_size"
        : keyRaw === "objetivo"
        ? "objective"
        : keyRaw;

    if (["company_size", "sector", "objective"].includes(key) && val) {
      (patch as any)[key] = val.slice(0, 200);
    }
  }

  // ===== (2) Fallback SIEMPRE para company_size (aunque no hubiera expecting) =====
  if (!patch.company_size) {
    const val = captureCompanySize();
    if (val) patch.company_size = val;
  }

  // ===== (3) Fallback SIEMPRE para sector si no hay expecting ni sector todavía =====
  // Regla práctica: si el texto es corto, con letras y NO parece un verbo de intención → trátalo como sector.
  if (!patch.sector && !expecting) {
    if (looksShortText(text) && !looksLikeIntentVerb.test(text)) {
      patch.sector = text;
    }
  }

  // ===== (4) Fallback opcional para objective si no hay expecting ni objective todavía =====
  // Regla práctica: si hay verbo de intención, probablemente es un objetivo.
  if (!patch.objective && !expecting) {
    if (looksLikeIntentVerb.test(text)) {
      patch.objective = text.slice(0, 140);
    }
  }

  return patch;
}

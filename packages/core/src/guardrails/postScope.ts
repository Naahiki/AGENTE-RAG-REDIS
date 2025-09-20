import { GuardrailResult } from "./types";

// Si quieres gobernar el modo desde CFG, inyecta aquí tu CFG.GUARDRAILS.MODE
const MODE: "block" | "warn" = (process.env.GUARDRAILS_MODE as any) || "block";

// ===== Helpers de texto =====
function norm(s: string) {
  return (s || "").normalize("NFKC").trim();
}
function hasUrl(s: string) {
  return /(https?:\/\/[^\s)]+|www\.[^\s)]+)/i.test(s);
}
function getUrls(s: string): string[] {
  return (s.match(/https?:\/\/[^\s)]+/gi) || []).map(u => u.trim());
}
function isOfficialNavarraUrl(u: string) {
  try {
    const url = new URL(u);
    return /(^|\.)navarra\.es$/i.test(url.hostname);
  } catch { return false; }
}

// Smalltalk / ruido / genérico
const RX_SMALLTALK = /^\s*(hola|hello|hey|buenas|qué tal|que tal|buenos días|buenas tardes|buenas noches)\b/i;
const RX_NOISE = /^[\s\.\,\-\_\!\?]+$/;

// In-scope (ligero, ampliable)
const RX_IN_SCOPE = [
  /\b(ayuda|ayudas|subvenci(o|ó)nes?)\b/i,
  /\b(convocatoria|bases|resoluci(o|ó)n|plazo|beneficiari[oa]s|requisitos)\b/i,
  /\b(trámite|tramite|trámites|solicitud|procedimiento)\b/i,
  /\b(navarra|gobierno de navarra)\b/i,
  /\b(sic|sinai|i\+d\+i|innovaci[oó]n|industria|agroalimentaria|comercio exterior)\b/i,
  /\b(bonos|bono)\b/i,
];

// Out-of-scope (ejemplos comunes fuera del dominio)
const RX_OUT_OF_SCOPE = [
  /\b(recetas?|cocina|f[úu]tbol|futbol|baloncesto|narnia|netflix|instagram|tiktok|meme)\b/i,
  /\b(m[óo]vil|smartphone|ordenador|port[aá]til|playstation|xbox)\b/i,
  /\b(cripto|bitcoin|ethereum)\b/i,
  /\b(impuestos personales fuera de ayudas|renta.*personal)\b/i,
];

// Ambigüedad típica: “bonos impulsa”, “ayuda para internacionalizar”, etc.
const RX_AMBIGUOUS = [
  /\b(bonos?\s+impulsa)\b/i,
  /\b(ayuda|subvenci[oó]n)\b.*\b(internacionalizaci[oó]n|contratar|automatizar|innovaci[oó]n)\b/i,
  /\b(programa|bono|línea|linea)\b.*\b(pymes?)\b/i,
];

function isSmalltalk(q: string) { return RX_SMALLTALK.test(q); }
function isNoise(q: string) { return RX_NOISE.test(q); }
function looksInScope(q: string) { return RX_IN_SCOPE.some(rx => rx.test(q)); }
function looksOutOfScope(q: string) { return RX_OUT_OF_SCOPE.some(rx => rx.test(q)); }
function looksAmbiguous(q: string) { return RX_AMBIGUOUS.some(rx => rx.test(q)); }

export type PostScopeDecision =
  | { action: "none" }
  | { action: "ask_for_name_or_link"; reply: string }
  | { action: "soft_redirect"; reply: string };

export function applyPostScope(opts: {
  query: string;
  ragDocCount: number;
  // opcionales para afinar sin recompilar
  officialHostRegex?: RegExp; // por defecto navarra.es
  askTemplate?: (ctx: { urls: string[] }) => string;
  redirectTemplate?: () => string;
}): PostScopeDecision {
  const q = norm(opts.query);
  const officialHost = opts.officialHostRegex ?? /(^|\.)navarra\.es$/i;

  // 0) Smalltalk / ruido: no molestamos
  if (!q || isNoise(q) || isSmalltalk(q)) return { action: "none" };

  // 1) Si RAG está vacío → pedimos nombre o enlace oficial salvo que:
  //    - ya traiga un enlace oficial
  //    - o se vea claramente in-scope y no ambiguo (deja LLM intentar)
  const urls = getUrls(q);
  const hasOfficial = urls.some(u => {
    try { return officialHost.test(new URL(u).hostname); } catch { return false; }
  });

  if (opts.ragDocCount === 0) {
    if (hasOfficial) return { action: "none" }; // ya nos dieron enlace bueno

    const ambiguous = looksAmbiguous(q) || !looksInScope(q);
    if (ambiguous || !hasUrl(q)) {
      const reply = (opts.askTemplate?.({ urls })) ?? (
        "No he encontrado resultados en el catálogo con esa consulta. " +
        "¿Tienes el **nombre exacto** de la ayuda o el **enlace oficial** en navarra.es?\n\n" +
        "Ejemplos:\n" +
        "• «Bonos Impulsa de internacionalización 2025»\n" +
        "• Enlace oficial: https://www.navarra.es/…"
      );
      // En modo warn, podrías dejar pasar, pero lo normal aquí es pedir precisión
      if (MODE === "warn") return { action: "none" };
      return { action: "ask_for_name_or_link", reply };
    }
    // Trae URLs pero no oficiales → sugiere el oficial
    if (urls.length && !hasOfficial) {
      const reply = (opts.askTemplate?.({ urls })) ?? (
        "He visto enlaces, pero necesito el **enlace oficial de navarra.es** o el **nombre exacto** de la ayuda para continuar."
      );
      if (MODE === "warn") return { action: "none" };
      return { action: "ask_for_name_or_link", reply };
    }
  }

  // 2) Out-of-scope (con docs o sin docs)
  //    Si huele a fuera de ámbito (y no es smalltalk), redirige suavemente.
  if (looksOutOfScope(q) && !looksInScope(q)) {
    const reply = (opts.redirectTemplate?.()) ?? (
      "Mi ámbito es **ayudas, subvenciones y trámites del Gobierno de Navarra**. " +
      "Si me dices el **nombre exacto** de la ayuda o compartes su **enlace oficial**, te preparo la ficha."
    );
    if (MODE === "warn") return { action: "none" };
    return { action: "soft_redirect", reply };
  }

  // 3) Todo OK → deja pasar al LLM
  return { action: "none" };
}

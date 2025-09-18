// packages/core/src/guardrails/messages.ts
import type { GuardrailType } from "./types";

export const URL_STRIPPED_SUFFIX =
  "\n\n_(He ocultado enlaces no verificados por seguridad. Pega el **enlace oficial** si quieres que lo revise.)_";

export function guardMessage(
  types: GuardrailType[],
  opts?: { reason?: string; embedScore?: number | null }
) {
  const t = new Set(types);

  if (t.has("GREET_ONLY")) {
    return "¡Hola! Soy el asistente de **Ayudas del Gobierno de Navarra**. Dime el nombre de una ayuda o tu caso (p. ej. “Bonos Impulsa”, “contratar personal para internacionalización”, “ayudas eficiencia energética”).";
  }

  if (t.has("VAGUE_QUERY") && t.has("RAG_EMPTY")) {
    return "¿Puedes darme un poco más de detalle o el **nombre exacto** de la ayuda? Ejemplos: “Bonos Impulsa de internacionalización 2025”, “subvenciones agricultura para riego”. También vale **pegar el enlace oficial**.";
  }

  if (t.has("RAG_EMPTY")) {
    return "No he encontrado resultados en el catálogo con esa consulta. ¿Tienes el **nombre exacto** o el **enlace oficial** de la ayuda?";
  }

  if (t.has("OUT_OF_SCOPE")) {
    const score =
      typeof opts?.embedScore === "number"
        ? ` (similitud ~${opts.embedScore.toFixed(2)})`
        : "";
    return `Puedo ayudarte con **ayudas, subvenciones y trámites del Gobierno de Navarra**. Tu consulta parece fuera de este ámbito${score}. Si buscas una ayuda concreta, dime su nombre o pega el enlace oficial.`;
  }

  if (t.has("URL_OUT_OF_WHITELIST")) {
    return "Para tu seguridad, solo puedo citar enlaces que te haya mostrado en esta conversación. Si tienes un **enlace oficial**, pégalo y lo reviso.";
  }

  return "¿Puedes reformular la consulta en relación con **ayudas, subvenciones o trámites** del Gobierno de Navarra?";
}

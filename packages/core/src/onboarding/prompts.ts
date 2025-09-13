import type { OnboardingCheckResult } from "./types";

export function promptFor(field: string): OnboardingCheckResult {
  switch (field) {
    case "company_size":
      return {
        shouldAsk: true,
        missingField: "company_size",
        prompt: "Para afinar, ¿qué tamaño tiene tu empresa?",
        hint: "Responde en tus palabras (p. ej., «somos 40 personas» o «facturamos ~3M»).",
      };
    case "sector":
      return {
        shouldAsk: true,
        missingField: "sector",
        prompt: "¿En qué sector operas?",
        hint: "Describe tu sector con tus palabras (p. ej., «agroalimentario», «software B2B»…).",
      };
    case "objective":
      return {
        shouldAsk: true,
        missingField: "objective",
        prompt: "¿Cuál es tu objetivo principal respecto a las ayudas?",
        hint: "Dilo libremente (p. ej., «contratar equipo comercial», «entrar en Alemania», «automatizar procesos»).",
      };
    default:
      return { shouldAsk: false };
  }
}

// packages/core/src/onboarding/prompts.ts
import type { UserProfile } from "./types";

export function promptFor(field: keyof UserProfile) {
  switch (field) {
    case "company_size":
      return {
        field,
        text: "Para empezar, ¿qué tamaño tiene tu empresa?",
        hint: "Responde libremente (p. ej., «somos 40 personas» o «facturamos ~3M»).",
      };
    case "sector":
      return {
        field,
        text: "¿En qué sector operas?",
        hint: "Describe tu sector (p. ej., «agroalimentario», «software B2B»…).",
      };
    case "objective":
      return {
        field,
        text: "¿Cuál es tu objetivo principal respecto a las ayudas?",
        hint: "Ej.: «contratar equipo comercial», «entrar en Alemania», «automatizar procesos».",
      };
  }
}

// apps/api/src/intro.ts
import * as dotenv from "dotenv";
dotenv.config();

import { getProfile, appendTurn, ensureChatSession } from "@agent-rag/memory";

/** Flags .env */
const INTRO_GUIDE_ENABLED = (process.env.INTRO_GUIDE_ENABLED || "0") === "1";
const INTRO_GUIDE_REQUIRED = (
  process.env.INTRO_GUIDE_REQUIRED || "company_size,sector,objective"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function promptFor(
  field: string
):
  | { shouldAsk: false }
  | { shouldAsk: true; missingField: string; prompt: string; hint?: string } {
  switch (field) {
    case "company_size":
      return {
        shouldAsk: true,
        missingField: "company_size",
        prompt: "Para empezar, ¿qué tamaño tiene tu empresa?",
        hint: "Responde libremente (p. ej., «somos 40 personas»).",
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

export async function buildIntroMessage(
  chatId: string
): Promise<{ content: string; sources?: string[] }> {
  if (INTRO_GUIDE_ENABLED) {
    // Asegura sesión y lee perfil
    await ensureChatSession(chatId, null, undefined).catch(() => {});
    const profile = await getProfile(chatId).catch(() => null);

    const answered = INTRO_GUIDE_REQUIRED.filter(
      (k) => (profile as any)?.[k] && String((profile as any)[k]).trim() !== ""
    );
    const missing = INTRO_GUIDE_REQUIRED.filter((k) => !answered.includes(k));

    if (missing.length) {
      const q = promptFor(missing[0]);
      if (q.shouldAsk) {
        const content = q.hint ? `${q.prompt}\n\n_${q.hint}_` : q.prompt;

        // GUARDAMOS la pregunta en memoria con meta para que handleTurn
        // detecte que el próximo mensaje es respuesta de onboarding
        await appendTurn(chatId, "", content, {
          model: "guided-intro",
          meta: {
            
            guidedIntro: {
              lastAsked: q.missingField,
              missing,
              profileSnapshot: profile || {},
            },
          },
        });

        return { content };
      }
    }
  }

  // Fallback a saludo neutro
  return {
    content:
      "¡Hola! Soy el asistente de Ayudas del Gobierno de Navarra. Dime una ayuda concreta o tu caso (p. ej. **“Bonos Impulsa”**, *contratar personal para internacionalización*).",
  };
}

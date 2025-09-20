// packages/core/src/guardrails/preSafety.ts
import { GuardrailResult } from "./types";

// Opcional: puedes leer esto de CFG.GUARDRAILS.MODE si lo inyectas aquí
const MODE: "block" | "warn" = (process.env.GUARDRAILS_MODE as any) || "block";

type Rule = {
  id: string;
  test: (q: string) => boolean;
  reply?: string;
  severity: "high" | "medium";
};

// Utilidades PII
const emailRx = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const esPhoneRx = /\b(\+34\s?)?([679]\d{2}|\d{3})([-\s.]?\d{2}){3}\b/;
const esNifNieRx = /\b([XYZxyz]?\d{7,8}[A-Za-z])\b/; // básico
const ibanRx = /\b([A-Z]{2}\d{2}[A-Z0-9]{10,30})\b/; // incluye ES
const cc16Rx = /\b(?:\d[ -]*?){13,19}\b/;

// Luhn simple para tarjetas
function looksLikeCreditCard(text: string): boolean {
  const digits = text.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = parseInt(digits[i], 10);
    if (dbl) { d *= 2; if (d > 9) d -= 9; }
    sum += d; dbl = !dbl;
  }
  return sum % 10 === 0;
}

// Heurísticas varias
const smalltalkRx = /^\s*(hola|hello|hey|buenas|qué tal|que tal)\b/i;
const malwareRx = /\b(ransomware|keylogger|stealer|zero[-\s]?day|exploit\s+kit|botnet)\b/i;
const violenceRx = /\b(matar|asesinar|bomba|fabricar explosivos|dañar a|violencia extrema)\b/i;
const minorsSexualRx = /\b(niñ[oa]s?|menor(es)?).{0,30}(sexual|porno|desnudo|explícit[oa])\b/i;
const selfHarmRx = /\b(suicid|autolesi|hacerme daño|quitarme la vida)\b/i;

// Reglas de **safety** (no scope)
const RULES: Rule[] = [
  {
    id: "SMALLTALK_ALLOW",
    test: (q) => smalltalkRx.test(q),
    severity: "medium",
  },
  {
    id: "PII_EMAIL",
    test: (q) => emailRx.test(q),
    severity: "medium",
    reply: "Por seguridad, evita compartir correos personales. Puedes redactar la consulta sin datos sensibles.",
  },
  {
    id: "PII_PHONE",
    test: (q) => esPhoneRx.test(q),
    severity: "medium",
    reply: "Por seguridad, evita compartir teléfonos personales. Describe tu caso sin datos sensibles.",
  },
  {
    id: "PII_NIF_NIE",
    test: (q) => esNifNieRx.test(q),
    severity: "high",
    reply: "No puedo procesar identificadores personales (NIF/NIE). Describe tu caso sin datos sensibles.",
  },
  {
    id: "PII_IBAN",
    test: (q) => ibanRx.test(q),
    severity: "high",
    reply: "No compartas IBAN ni cuentas bancarias. Cuenta tu caso sin datos financieros sensibles.",
  },
  {
    id: "PII_CREDIT_CARD",
    test: (q) => cc16Rx.test(q) && looksLikeCreditCard(q),
    severity: "high",
    reply: "No compartas números de tarjeta. Describe tu consulta sin datos financieros sensibles.",
  },
  {
    id: "MALWARE",
    test: (q) => malwareRx.test(q),
    severity: "high",
    reply: "No puedo ayudar con software malicioso o su distribución.",
  },
  {
    id: "VIOLENCE_SEVERE",
    test: (q) => violenceRx.test(q),
    severity: "high",
    reply: "No puedo ayudar con contenido violento o instrucciones dañinas.",
  },
  {
    id: "SEXUAL_MINORS",
    test: (q) => minorsSexualRx.test(q),
    severity: "high",
    reply: "No puedo ayudar con ese contenido.",
  },
  {
    id: "SELF_HARM",
    test: (q) => selfHarmRx.test(q),
    severity: "high",
    reply: "Lo siento, no puedo ayudar con eso. Si te sientes en riesgo, busca ayuda profesional o de emergencia.",
  },
];

export async function applyPreSafety(query: string): Promise<GuardrailResult> {
  const q = (query || "").trim();

  // Permite smalltalk explícitamente
  if (RULES.find(r => r.id === "SMALLTALK_ALLOW")!.test(q)) {
    return { blocked: false, types: [] };
  }

  const hits = RULES.filter(r => r.id !== "SMALLTALK_ALLOW" && r.test(q));
  if (!hits.length) return { blocked: false, types: [] };

  const high = hits.find(h => h.severity === "high");
  const reply = (high || hits[0]).reply || "Tu consulta no se puede procesar por motivos de seguridad.";

  // Modo warn permite pasar (para telemetría o soft rollout)
  if (MODE === "warn") {
    return { blocked: false, types: hits.map(h => h.id) };
  }
  return { blocked: true, types: hits.map(h => h.id), reply };
}

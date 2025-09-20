// Capa de config runtime (con overlay modificable)
export type RuntimeFlags = {
  INTRO_GUIDE_ENABLED: boolean;
  INTRO_GUIDE_REQUIRED: string[];
  INTRO_GUIDE_MIN_TURNS: number;
  ONBOARDING_MIN_ANSWERS: number;
  ONBOARDING_MAX_QUESTIONS: number;
  ONBOARDING_ONLY_IN_SCOPE: boolean;
  GUARDRAILS_SAFETY_ENABLED: boolean;
  GUARDRAILS_SCOPE_ENABLED: boolean;
};

const envBool = (v?: string, def=false) => (v ?? (def ? "1" : "0")) === "1";
const envInt = (v?: string, def=0) => (v ? parseInt(v, 10) : def);

const defaults: RuntimeFlags = {
  INTRO_GUIDE_ENABLED: envBool(process.env.INTRO_GUIDE_ENABLED, false),
  INTRO_GUIDE_REQUIRED: (process.env.INTRO_GUIDE_REQUIRED || "company_size,sector,objective")
    .split(",").map(s => s.trim()).filter(Boolean),
  INTRO_GUIDE_MIN_TURNS: envInt(process.env.INTRO_GUIDE_MIN_TURNS, 2),
  ONBOARDING_MIN_ANSWERS: envInt(process.env.ONBOARDING_MIN_ANSWERS, 3),
  ONBOARDING_MAX_QUESTIONS: envInt(process.env.ONBOARDING_MAX_QUESTIONS, 3),
  ONBOARDING_ONLY_IN_SCOPE: envBool(process.env.ONBOARDING_ONLY_IN_SCOPE, true),
  GUARDRAILS_SAFETY_ENABLED: envBool(process.env.GUARDRAILS_SAFETY_ENABLED, true),
  GUARDRAILS_SCOPE_ENABLED: envBool(process.env.GUARDRAILS_SCOPE_ENABLED, true),
};

let overlay: Partial<RuntimeFlags> = {};

export function getRuntimeFlags(): RuntimeFlags {
  return { ...defaults, ...overlay };
}
export function setRuntimeFlags(patch: Partial<RuntimeFlags>) {
  overlay = { ...overlay, ...patch };
}

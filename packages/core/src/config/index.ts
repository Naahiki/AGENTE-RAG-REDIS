// packages/core/src/config/index.ts
const toBool = (v: any, d=false) => {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return d;
  if (["1","true","yes","y","on"].includes(s)) return true;
  if (["0","false","no","n","off"].includes(s)) return false;
  return d;
};
const toInt  = (v:any, d:number) => {
  const n = parseInt(String(v ?? ""),10); return Number.isFinite(n)?n:d;
};
const toList = (v:any, d:string[]=[]) =>
  String(v ?? "").split(",").map(s=>s.trim()).filter(Boolean) || d;

export const CFG = {
  VERBOSE: toBool(process.env.CORE_VERBOSE, false),

  // Onboarding
  INTRO: {
    ENABLED: toBool(process.env.INTRO_GUIDE_ENABLED, true),
    REQUIRED: toList(process.env.INTRO_GUIDE_REQUIRED ?? "company_size,sector,objective"),
    MIN_ANSWERS: toInt(process.env.ONBOARDING_MIN_ANSWERS, 3),
    MAX_QUESTIONS: toInt(process.env.ONBOARDING_MAX_QUESTIONS, 3),
    ONLY_IN_SCOPE: toBool(process.env.ONBOARDING_ONLY_IN_SCOPE, false),
  },

  // Guardrails
  GUARDRAILS: {
    SAFETY_ENABLED: toBool(process.env.GUARDRAILS_SAFETY_ENABLED, true),
    SCOPE_ENABLED:  toBool(process.env.GUARDRAILS_SCOPE_ENABLED,  true),
    MODE: (process.env.GUARDRAILS_MODE as "block"|"warn") || "block",
  },

  // RAG / LLM
  RAG: {
    SKIP: toBool(process.env.CORE_SKIP_RETRIEVER, false),
    TOP_K: toInt(process.env.RETRIEVER_TOP_K, 5),
    TIMEOUT_MS: toInt(process.env.CORE_RETRIEVER_TIMEOUT_MS, 12000),
  },
  LLM: {
    TIMEOUT_MS: toInt(process.env.CORE_LLM_TIMEOUT_MS, 20000),
  },
  SUMMARY_EVERY: toInt(process.env.UPDATE_SHORT_SUMMARY_EVERY_TURNS, 4),
};

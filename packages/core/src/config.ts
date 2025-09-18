import * as dotenv from "dotenv";
dotenv.config();

/** Verbose core logs */
export const CORE_VERBOSE = process.env.CORE_VERBOSE === "1";

/** Retriever */
export const RETRIEVER_TOP_K = parseInt(process.env.RETRIEVER_TOP_K || "5", 10);
export const CORE_RETRIEVER_TIMEOUT_MS = parseInt(process.env.CORE_RETRIEVER_TIMEOUT_MS || "12000", 10);

/** LLM */
export const CORE_LLM_TIMEOUT_MS = parseInt(process.env.CORE_LLM_TIMEOUT_MS || "20000", 10);
export const UPDATE_SHORT_SUMMARY_EVERY_TURNS = parseInt(process.env.UPDATE_SHORT_SUMMARY_EVERY_TURNS || "6", 10);

/** Intro guiada (onboarding) – todo controlado por .env */
export const INTRO_GUIDE_ENABLED = (process.env.INTRO_GUIDE_ENABLED || "0") === "1";
export const INTRO_GUIDE_MIN_TURNS = parseInt(process.env.INTRO_GUIDE_MIN_TURNS || "2", 10);
export const INTRO_GUIDE_REQUIRED = (process.env.INTRO_GUIDE_REQUIRED || "company_size,sector,objective")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/** Guardarraíles: el paquete guardrails ya lee su propia .env, pero
 * desde core mostramos el flag (para logs/decisiones de UI) */
export const GUARDRAILS_ENABLED = (process.env.GUARDRAILS_ENABLED || "0") === "1";

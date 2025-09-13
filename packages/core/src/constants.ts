import * as dotenv from "dotenv";
dotenv.config();

export const RETRIEVER_TOP_K = parseInt(process.env.RETRIEVER_TOP_K || "5", 10);
export const UPDATE_SHORT_SUMMARY_EVERY_TURNS = parseInt(process.env.UPDATE_SHORT_SUMMARY_EVERY_TURNS || "6", 10);
export const CORE_RETRIEVER_TIMEOUT_MS = parseInt(process.env.CORE_RETRIEVER_TIMEOUT_MS || "12000", 10);
export const CORE_LLM_TIMEOUT_MS = parseInt(process.env.CORE_LLM_TIMEOUT_MS || "20000", 10);

console.log("[cfg] CORE_LLM_TIMEOUT_MS =", CORE_LLM_TIMEOUT_MS);
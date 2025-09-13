// packages/llm/src/index.ts
import * as dotenv from "dotenv";
dotenv.config(); // 👈 carga env ANTES de cualquier import que pueda usarlos

export { loadSystemPromptFromLLM } from "./system";

import OpenAI from "openai";
import { buildMessages } from "./prompt";
import { getLongSummary, upsertLongSummary, getMemoryAsMessages } from "../../memory/src/index"; // TEMP local

const CHAT_MODEL = process.env.CHAT_MODEL || "gpt-4o-mini";
const DISTILL_EVERY_TURNS = parseInt(process.env.DISTILL_EVERY_TURNS || "12", 10);

// 👇 nuevos knobs
const LLM_TRIM_HISTORY_TURNS = parseInt(process.env.LLM_TRIM_HISTORY_TURNS || "12", 10);
const LLM_MAX_CHUNKS        = parseInt(process.env.LLM_MAX_CHUNKS || "5", 10);
const LLM_MAX_DESC_CHARS    = parseInt(process.env.LLM_MAX_DESC_CHARS || "1200", 10);
const LLM_MAX_TOKENS        = parseInt(process.env.LLM_MAX_TOKENS || "900", 10);
const LLM_TEMPERATURE       = parseFloat(process.env.LLM_TEMPERATURE || "0.2");
const VERBOSE               = process.env.CORE_VERBOSE === "1" || process.env.LLM_VERBOSE === "1";

export type CompletionInput = {
  chatId: string;
  systemPrompt: string;
  history: { role: "user" | "assistant"; content: string }[];
  shortSummary?: string | null;
  chunks: { titulo?: string; descripcion?: string; url?: string }[];
  user: string;
};

export type CompletionOutput = {
  content: string;
  model: string;
  sources?: string[];
};

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

function truncate(s: string | undefined, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

export async function getCompletion(input: CompletionInput): Promise<CompletionOutput> {
  // si no hay historial, traemos resumen largo desde Neon
  const long = input.history.length ? null : await getLongSummary(input.chatId);

  // 🔪 poda de historial y chunks
  const trimmedHistory = input.history.slice(-LLM_TRIM_HISTORY_TURNS);
  const compactChunks = (input.chunks || [])
    .slice(0, LLM_MAX_CHUNKS)
    .map((c) => ({
      ...c,
      descripcion: truncate(c.descripcion, LLM_MAX_DESC_CHARS),
    }));

  const messages = buildMessages({
    system: input.systemPrompt,
    longSummary: long,
    shortSummary: input.shortSummary,
    history: trimmedHistory,
    chunks: compactChunks,
    user: input.user
  });

  // 👀 logs útiles
  if (VERBOSE) {
    console.log("[llm] history msgs:", trimmedHistory.length, "chunks:", compactChunks.length);
    try {
      const preview = JSON.stringify(messages, null, 2);
      console.log(
        "[llm] preview ctx (first 4k):\n",
        preview.length > 4000 ? preview.slice(0, 4000) + "…[truncated]" : preview
      );
    } catch {}
  }

  const res = await openai.chat.completions.create({
    model: CHAT_MODEL,
    messages,
    max_tokens: LLM_MAX_TOKENS,
    temperature: LLM_TEMPERATURE
  });

  const content = res.choices[0]?.message?.content ?? "";
  return { content, model: CHAT_MODEL };
}

/** Destilado de memoria larga cada N turnos */
export async function maybeDistillAndPersist(chatId: string, systemPrompt: string) {
  const turns = await getMemoryAsMessages(chatId, 999);
  if (turns.length < DISTILL_EVERY_TURNS * 2) return;

  const res = await openai.chat.completions.create({
    model: CHAT_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "system", content: "Resume de forma concisa (5-8 bullets) los puntos relevantes y decisiones del usuario. No inventes nada." },
      ...turns,
      { role: "user", content: "Genera el resumen ahora." }
    ],
    max_tokens: Math.min(LLM_MAX_TOKENS, 600),
    temperature: 0.1
  });

  const distilled = res.choices[0]?.message?.content?.trim();
  if (distilled) await upsertLongSummary(chatId, distilled);
}

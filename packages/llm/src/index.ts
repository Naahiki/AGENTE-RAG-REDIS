// packages/llm/src/index.ts
import * as dotenv from "dotenv";
dotenv.config(); // carga .env antes de usarlo

export { loadSystemPromptFromLLM } from "./system";

import OpenAI from "openai";
import { buildMessages } from "./prompt";
import {
  getLongSummary,
  upsertLongSummary,
  getRecentTurns,
} from "../../memory/src";

/* =========================
   Config (.env con defaults)
========================= */
const CHAT_MODEL = process.env.CHAT_MODEL || "gpt-4o-mini";

// Memoria larga / destilado (opcional)
const LLM_DISTILL_ENABLED =
  process.env.LLM_DISTILL_ENABLED === "1" || false;
const DISTILL_EVERY_TURNS = parseInt(
  process.env.DISTILL_EVERY_TURNS || "12",
  10
);

// Poda de historial y contexto RAG
const LLM_TRIM_HISTORY_TURNS = parseInt(
  process.env.LLM_TRIM_HISTORY_TURNS || "10",
  10
);
const LLM_MAX_CHUNKS = parseInt(process.env.LLM_MAX_CHUNKS || "4", 10);

// Recortes agresivos de campos para evitar >8k tokens
const LLM_MAX_DESC_CHARS = parseInt(
  process.env.LLM_MAX_DESC_CHARS || "800",
  10
);
const LLM_MAX_DOCS_CHARS = parseInt(
  process.env.LLM_MAX_DOCS_CHARS || "600",
  10
);
const LLM_MAX_NORM_CHARS = parseInt(
  process.env.LLM_MAX_NORM_CHARS || "500",
  10
);
const LLM_MAX_OTROS_CHARS = parseInt(
  process.env.LLM_MAX_OTROS_CHARS || "500",
  10
);

// Respuesta
const LLM_MAX_TOKENS = parseInt(process.env.LLM_MAX_TOKENS || "700", 10);
const LLM_TEMPERATURE = parseFloat(process.env.LLM_TEMPERATURE || "0.2");

// Logs
const VERBOSE =
  process.env.CORE_VERBOSE === "1" || process.env.LLM_VERBOSE === "1";

/* =========================
   Tipos
========================= */
export type CompletionInput = {
  chatId: string;
  systemPrompt: string;
  history: { role: "user" | "assistant"; content: string }[];
  shortSummary?: string | null;
  chunks: {
    titulo?: string;
    descripcion?: string;
    url?: string;
    documentacion?: string;
    normativa?: string;
    otros?: string;
    estado_tramite?: string;
    tipo_tramite?: string;
    tema_subtema?: string;
    dirigido_a?: string;
    servicio?: string;
    resultados?: string;
  }[];
  user: string;
  urlWhitelist?: string[];            // URLs que el LLM puede citar
  ragEmptyBehavior?: "none" | "ask_for_name_or_link"; // conducta si no hay contexto RAG
};

export type CompletionOutput = {
  content: string;
  model: string;
  sources?: string[];
};

/* =========================
   Cliente OpenAI
========================= */
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

/* =========================
   Utils
========================= */
function truncate(s: string | undefined, n: number): string {
  if (!s) return "";
  const t = s.trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
}

function compactChunk(c: any) {
  return {
    ...c,
    descripcion: truncate(c.descripcion, LLM_MAX_DESC_CHARS),
    documentacion: truncate(c.documentacion, LLM_MAX_DOCS_CHARS),
    normativa: truncate(c.normativa, LLM_MAX_NORM_CHARS),
    otros: truncate(c.otros, LLM_MAX_OTROS_CHARS),
  };
}

/* =========================
   getCompletion
========================= */
export async function getCompletion(input: CompletionInput): Promise<CompletionOutput> {
  // Si no hay historial todavía, intenta cargar resumen largo
  const long = input.history.length ? null : await getLongSummary(input.chatId);

  // 🔪 poda de historial y compactado de chunks
  const trimmedHistory = input.history.slice(-LLM_TRIM_HISTORY_TURNS);
  const compactChunks = (input.chunks || [])
    .slice(0, LLM_MAX_CHUNKS)
    .map((c) => ({
      ...c,
      descripcion: truncate(c.descripcion, LLM_MAX_DESC_CHARS),
    }));

  // Deriva whitelist de URLs si no se pasa explícita
  const derivedWhitelist = compactChunks
    .map((c) => c.url)
    .filter((u): u is string => !!u);
  const urlWhitelist =
    input.urlWhitelist && input.urlWhitelist.length
      ? input.urlWhitelist
      : Array.from(new Set(derivedWhitelist)); // de-dup

  // Si no hay contexto, fuerza la conducta de pedir nombre/enlace
  const ragEmptyBehavior =
    input.ragEmptyBehavior ?? (compactChunks.length ? "none" : "ask_for_name_or_link");

  // Construye mensajes
  const messages = buildMessages({
    system: input.systemPrompt,
    longSummary: long,
    shortSummary: input.shortSummary,
    history: trimmedHistory,
    chunks: compactChunks,
    user: input.user,
    urlWhitelist,
    ragEmptyBehavior,
  });

  // ======== LOGS ÚTILES ========
  if (VERBOSE) {
    console.log("[llm] model:", CHAT_MODEL);
    console.log("[llm] history msgs:", trimmedHistory.length);
    console.log("[llm] chunks:", compactChunks.length);
    console.log("[llm] urlWhitelist:", urlWhitelist.length);
    console.log("[llm] ragEmptyBehavior:", ragEmptyBehavior);

    // títulos de chunks para debug rápido
    const titles = compactChunks.map((c, i) => `#${i + 1} ${c.titulo || "(sin título)"}`);
    if (titles.length) console.log("[llm] chunk titles:", titles.join(" | "));

    // Vista previa del payload (truncada)
    try {
      const preview = JSON.stringify(messages, null, 2);
      console.log(
        "[llm] messages preview (≤4k chars):\n",
        preview.length > 4000 ? preview.slice(0, 4000) + "…[truncated]" : preview
      );
    } catch {
      /* noop */
    }
  }
  // =============================

  const res = await openai.chat.completions.create({
    model: CHAT_MODEL,
    messages,
    max_tokens: LLM_MAX_TOKENS,
    temperature: LLM_TEMPERATURE,
  });

  const content = res.choices[0]?.message?.content ?? "";
  return { content, model: CHAT_MODEL };
}

/* =========================
   maybeDistillAndPersist (opcional)
========================= */
export async function maybeDistillAndPersist(
  chatId: string,
  systemPrompt: string
) {
  if (!LLM_DISTILL_ENABLED) return; // desactivado por flag

  // 1) Turnos recientes (con meta para saber qué fuentes se mostraron)
  const turns = await getRecentTurns(chatId, 999);
  if (turns.length < DISTILL_EVERY_TURNS * 2) return;

  // 2) Whitelist de fuentes realmente mostradas al usuario
  const shown = new Set<string>();
  for (const t of turns) {
    const arr = t.meta?.shownSources as string[] | undefined;
    if (Array.isArray(arr)) {
      for (const u of arr) if (u) shown.add(u);
    }
  }
  const shownList = Array.from(shown);

  // 3) Resumen previo (si existe)
  const previous = await getLongSummary(chatId).catch(() => null);

  // 4) Construcción de prompt de destilado
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    {
      role: "system",
      content: [
        "Eres un destilador de memoria larga.",
        "Reglas:",
        "• Usa únicamente lo que el USUARIO dijo y lo que el ASISTENTE respondió (texto visible).",
        "• No utilices información del contexto recuperado que no se haya mostrado.",
        "• Si mencionas fuentes/URLs, usa EXCLUSIVAMENTE las listadas en 'Fuentes mostradas'.",
        "• No inventes nada.",
        "• Guarda solo datos estables del usuario: preferencias, requisitos, decisiones y restricciones.",
        "• Devuelve 5–8 bullets, concisos y accionables.",
      ].join("\n"),
    },
  ];

  if (previous) {
    messages.push({
      role: "system",
      content: `Resumen previo (para continuidad, no lo repitas tal cual):\n${previous}`,
    });
  }

  if (shownList.length) {
    messages.push({
      role: "system",
      content:
        "Fuentes mostradas (whitelist):\n" +
        shownList.map((u) => `- ${u}`).join("\n"),
    });
  }

  // Conversación visible (solo texto)
  for (const t of turns) {
    messages.push({ role: "user", content: t.user });
    messages.push({ role: "assistant", content: t.assistant });
  }
  messages.push({ role: "user", content: "Genera el resumen ahora." });

  // 5) Llamada al modelo
  const res = await openai.chat.completions.create({
    model: CHAT_MODEL,
    messages,
    max_tokens: Math.min(LLM_MAX_TOKENS, 600),
    temperature: 0.1,
  });

  const distilled = res.choices[0]?.message?.content?.trim();
  if (distilled) {
    await upsertLongSummary(chatId, distilled);
  }
}

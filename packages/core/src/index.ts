// packages/core/src/index.ts
import * as dotenv from "dotenv";
dotenv.config();

import {
  RETRIEVER_TOP_K,
  UPDATE_SHORT_SUMMARY_EVERY_TURNS,
  CORE_RETRIEVER_TIMEOUT_MS,
  CORE_LLM_TIMEOUT_MS,
} from "./constants";
import { HandleTurnInput, HandleTurnOutput } from "./types";

// Paquetes internos
import { getCachedAnswer, cacheAnswer } from "../../cache/src/index";
import { retrieveRelevantDocs } from "../../retriever/src/index";
import {
  getMemoryAsMessages,
  getShortSummary,
  getLongSummary, // usado indirectamente por LLM si no hay history
  setShortSummary,
  appendTurn,
  ensureChatSession, // sesión en Neon
  touchChatSession, // marca actividad
  MEMORY_AUDIT_TO_NEON_ENABLED,
  MEMORY_AUDIT_MESSAGE_SOURCES_ENABLED,
  RetrievalRecord,
} from "../../memory/src/index";
import {
  getCompletion,
  maybeDistillAndPersist,
  loadSystemPromptFromLLM,
} from "../../llm/src/index";

const VERBOSE = process.env.CORE_VERBOSE === "1";
if (VERBOSE) {
  console.log(
    `[core] audit->neon: ${MEMORY_AUDIT_TO_NEON_ENABLED ? "ON" : "OFF"}`
  );
  console.log(
    `[core] message_sources: ${
      MEMORY_AUDIT_MESSAGE_SOURCES_ENABLED ? "ON" : "OFF"
    }`
  );
}

/** Envuelve una promesa con timeout y etiqueta para logs */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let t: NodeJS.Timeout;
  const timeout = new Promise<never>(
    (_, rej) =>
      (t = setTimeout(() => rej(new Error(`Timeout ${ms}ms en ${label}`)), ms))
  );
  return Promise.race([p, timeout]).finally(() =>
    clearTimeout(t!)
  ) as Promise<T>;
}

export async function handleTurn(
  input: HandleTurnInput
): Promise<HandleTurnOutput> {
  const { chatId, message } = input;

  if (VERBOSE) console.time(`[core] total`);
  try {
    if (VERBOSE) console.log(`[core] chatId=${chatId}`);

    // 0) Asegura sesión en Neon (best-effort, no bloqueante)
    ensureChatSession(chatId, null /* userId */, undefined).catch((e) => {
      if (VERBOSE) console.warn(`[core] ensureSession warn:`, e?.message || e);
    });

    // 1) Cache exacta
    if (VERBOSE) console.time(`[core] cache:get`);
    const cached = await withTimeout(
      getCachedAnswer(message),
      3000,
      "cache:get"
    );
    if (VERBOSE) console.timeEnd(`[core] cache:get`);
    if (cached) {
      if (VERBOSE) console.log(`[core] HIT cache`);
      await appendTurn(chatId, message, cached.answer, {
        sources: cached.sources,
        hitCache: true,
      });
      touchChatSession(chatId).catch(() => {});
      return {
        type: "cached",
        content: cached.answer,
        sources: cached.sources,
        model: cached.model,
      };
    }

    // 2) Memoria (secuencial)
    if (VERBOSE) console.time(`[core] memory:get`);
    const history = await withTimeout(
      getMemoryAsMessages(chatId),
      4000,
      "memory:getHistory"
    );
    const shortSummary = await withTimeout(
      getShortSummary(chatId),
      2000,
      "memory:getShortSummary"
    );
    if (VERBOSE) console.timeEnd(`[core] memory:get`);

    // 3) Retriever (opcional)
    const skipRetriever = process.env.CORE_SKIP_RETRIEVER === "1";
    let docs: any[] = [];
    if (!skipRetriever) {
      if (VERBOSE) console.time(`[core] retriever`);
      docs = await withTimeout(
        retrieveRelevantDocs(message, RETRIEVER_TOP_K),
        CORE_RETRIEVER_TIMEOUT_MS,
        "retriever"
      );
      if (VERBOSE) console.timeEnd(`[core] retriever`);
    }

    // --- Fuentes ricas para auditoría ---
    // a) URLs únicas "planas" para la UI
    const sourceUrls = Array.from(
      new Set(
        (docs || []).map((d: any) => d.url ?? d.url_oficial).filter(Boolean)
      )
    );

    // b) Registros ricos por fuente (para Neon.message_sources)
    const retrievalRecords: RetrievalRecord[] = (docs || []).map(
      (d: any, i: number) => ({
        url: (d.url ?? d.url_oficial ?? "") as string,
        rank: i + 1,
        score: (d._score ?? d.score ?? null) as number | null,
        raw_chunk: d ? (d as Record<string, any>) : null,
      })
    );

    // c) IDs ligeros para compatibilidad con el tipo antiguo { topK, ids }
    const retrievalIds: Array<string | number> = (docs || [])
      .map((d: any) => d.id ?? d.doc_id ?? d.docId ?? d.key ?? null)
      .filter(Boolean);

    // d) Chunks compactos que sí se pasan al LLM
    const chunks = (docs || []).map((d: any) => ({
      titulo: d.titulo ?? d.nombre ?? null,
      descripcion: d.descripcion ?? null,
      url: d.url ?? d.url_oficial ?? null,
      estado_tramite: d.estado_tramite ?? null,
      tipo_tramite: d.tipo_tramite ?? null,
      tema_subtema: d.tema_subtema ?? null,
      dirigido_a: d.dirigido_a ?? null,
      normativa: d.normativa ?? null,
      documentacion: d.documentacion ?? null,
      resultados: d.resultados ?? null,
      otros: d.otros ?? null,
      servicio: d.servicio ?? null,
    }));

    // 4) LLM con fallback
    if (VERBOSE) console.time(`[core] llm`);
    const systemPrompt = loadSystemPromptFromLLM();

    function fallbackFromChunks() {
      if (!chunks.length)
        return "No he podido generar con el modelo y no hay contexto recuperado.";
      const lines: string[] = [
        "No he podido completar la generación con el modelo. Te dejo la información del contexto recuperado:",
      ];
      for (const c of chunks) {
        const t = c.titulo ?? "Sin título";
        const u = c.url ?? "-";
        const d = c.descripcion ?? "";
        lines.push(`- ${t}${u !== "-" ? ` — ${u}` : ""}${d ? `\n  ${d}` : ""}`);
      }
      lines.push("\n### Fichas completas");
      for (const c of chunks) {
        const nombre = c.titulo ?? "N/D";
        lines.push(`#### ${nombre}`);
        lines.push(`- Estado del trámite: ${c.estado_tramite ?? "N/D"}`);
        lines.push(`- Tipo de trámite: ${c.tipo_tramite ?? "N/D"}`);
        lines.push(`- Tema y subtema: ${c.tema_subtema ?? "N/D"}`);
        lines.push(`- Dirigido a / destinatarios: ${c.dirigido_a ?? "N/D"}`);
        lines.push(`- Breve descripción: ${c.descripcion ?? "N/D"}`);
        lines.push(`- Normativa relacionada: ${c.normativa ?? "N/D"}`);
        lines.push(`- Documentación a presentar: ${c.documentacion ?? "N/D"}`);
        lines.push(`- Resultados: ${c.resultados ?? "N/D"}`);
        lines.push(`- Otros campos: ${c.otros ?? "N/D"}`);
        lines.push(`- Servicio: ${c.servicio ?? "N/D"}`);
        lines.push(`- Enlace oficial: ${c.url ?? "N/D"}`);
        if (c.url) lines.push(`Fuente: ${c.url}`);
        lines.push("");
      }
      lines.push("\n_(Respuesta de respaldo sin LLM)_");
      return lines.join("\n");
    }

    let content = "";
    let model = "fallback";
    try {
      const out = await withTimeout(
        getCompletion({
          chatId,
          systemPrompt,
          history,
          shortSummary,
          chunks,
          user: message,
        }),
        CORE_LLM_TIMEOUT_MS,
        "llm:getCompletion"
      );
      content = out.content;
      model = out.model;
      if (VERBOSE) console.timeEnd(`[core] llm`);
    } catch (e: any) {
      if (VERBOSE) {
        console.warn(`[core] llm error/fallback:`, e?.message || e);
        console.timeEnd(`[core] llm`);
      }
      content = fallbackFromChunks();
    }

    // a.1) Detecta cuáles salieron realmente en la respuesta
    const norm = (u: string) =>
      u.replace(/^https?:\/\//, "").replace(/\/$/, "");
    const shownSourcesRaw = sourceUrls.filter((u) => {
      const clean = norm(u);
      return content.includes(u) || content.includes(clean);
    });
    // si no detectamos ninguna pero sí hubo recuperadas, opcionalmente usa todas
    const shownSources = shownSourcesRaw.length ? shownSourcesRaw : sourceUrls;

    // 5) Persistencias
    if (VERBOSE) console.time(`[core] persist`);

    // Redis (y auditoría opcional a Neon desde memory.appendTurn)
    await appendTurn(chatId, message, content, {
      // Para UI:
      sources: sourceUrls,
      shownSources,
      // Para tipos antiguos (evita el error TS 2559):
      retrieval: { topK: RETRIEVER_TOP_K, ids: retrievalIds },
      // Para auditoría rica (message_sources):
      retrievalRecords,
      // Extra útil:
      retrieverTopK: RETRIEVER_TOP_K,
      usedRetriever: !skipRetriever,
      model,
    });

    // Resumen breve (cada N turnos)
    if (
      !shortSummary ||
      history.length % UPDATE_SHORT_SUMMARY_EVERY_TURNS === 0
    ) {
      const compact =
        message.length > 120 ? message.slice(0, 117) + "..." : message;
      await setShortSummary(chatId, `Tema reciente: ${compact}`);
    }

    // Cache semántica
    await cacheAnswer(message, content, { model, sources: sourceUrls });

    // Memoria larga destilada (best-effort)
    maybeDistillAndPersist(chatId, systemPrompt).catch((e) => {
      if (VERBOSE) console.warn(`[core] distill warn:`, e?.message || e);
    });

    // Marca actividad de la sesión (best-effort)
    touchChatSession(chatId).catch(() => {});

    if (VERBOSE) console.timeEnd(`[core] persist`);

    return { type: "generated", content, sources: sourceUrls, model };
  } finally {
    if (VERBOSE) console.timeEnd(`[core] total`);
  }
}

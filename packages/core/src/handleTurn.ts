// packages/core/src/handleTurn.ts
import {
  CORE_VERBOSE,
  RETRIEVER_TOP_K,
  UPDATE_SHORT_SUMMARY_EVERY_TURNS,
  CORE_RETRIEVER_TIMEOUT_MS,
  CORE_LLM_TIMEOUT_MS,
  INTRO_GUIDE_ENABLED,
  INTRO_GUIDE_MIN_TURNS,
} from "./config";
import { withTimeout } from "./time";
import {
  extractProfilePatchFromMessage,
  missingProfileFields,
  augmentQueryWithProfile,
  renderGuidedIntro,
} from "./profile";
import { makeFallbackFromChunks } from "./fallback";

/** cache + retriever + memory */
import { getCachedAnswer, cacheAnswer } from "../../cache/src";
import { retrieveRelevantDocs } from "../../retriever/src";
import {
  getMemoryAsMessages,
  getShortSummary,
  setShortSummary,
  appendTurn,
  ensureChatSession,
  touchChatSession,
  getProfile,
  saveProfilePatch,
  type RetrievalRecord,
} from "../../memory/src";

/** LLM */
import { getCompletion, loadSystemPromptFromLLM } from "../../llm/src";

/** Guardarraíles (tus archivos subidos) */
import { applyGuardrailsPreLLM } from "./guardrails";

export type HandleTurnInput = {
  chatId: string;
  userId?: string | null;
  message: string;
};
export type HandleTurnOutput = {
  type: "cached" | "generated";
  content: string;
  sources?: string[];
  model?: string;
};

export async function handleTurn(input: HandleTurnInput): Promise<HandleTurnOutput> {
  const { chatId, message } = input;

  if (CORE_VERBOSE) console.time(`[core] total`);
  try {
    if (CORE_VERBOSE) console.log(`[core] chatId=${chatId}`);

    // 0) Sesión (best-effort)
    ensureChatSession(chatId, null, undefined).catch(() => {});

    // 1) Cache exacta
    if (CORE_VERBOSE) console.time(`[core] cache:get`);
    const cached = await withTimeout(getCachedAnswer(message), 3000, "cache:get");
    if (CORE_VERBOSE) console.timeEnd(`[core] cache:get`);
    if (cached) {
      if (CORE_VERBOSE) console.log(`[core] HIT cache`);
      await appendTurn(chatId, message, cached.answer, {
        sources: cached.sources,
        hitCache: true,
        model: cached.model,
      });
      touchChatSession(chatId).catch(() => {});
      return {
        type: "cached",
        content: cached.answer,
        sources: cached.sources,
        model: cached.model,
      };
    }

    // 2) Memoria y perfil
    if (CORE_VERBOSE) console.time(`[core] memory:get`);
    const history = await withTimeout(getMemoryAsMessages(chatId), 4000, "memory:getHistory");
    const shortSummary = await withTimeout(getShortSummary(chatId), 2000, "memory:getShortSummary");
    if (CORE_VERBOSE) console.timeEnd(`[core] memory:get`);

    let profile = await getProfile(chatId);
    const patch = extractProfilePatchFromMessage(message);
    if (Object.keys(patch).length) {
      await saveProfilePatch(chatId, patch);
      profile = await getProfile(chatId);
    }

    // 3) Retriever
    const skipRetriever = process.env.CORE_SKIP_RETRIEVER === "1";
    const retrieverQuery = INTRO_GUIDE_ENABLED ? augmentQueryWithProfile(message, profile) : message;

    let docs: any[] = [];
    if (!skipRetriever) {
      if (CORE_VERBOSE) console.time(`[core] retriever`);
      docs = await withTimeout(
        retrieveRelevantDocs(retrieverQuery, RETRIEVER_TOP_K),
        CORE_RETRIEVER_TIMEOUT_MS,
        "retriever"
      );
      if (CORE_VERBOSE) console.timeEnd(`[core] retriever`);
    }

    // --- Fuentes/ids/chunks para UI y LLM
    const sourceUrls = Array.from(
      new Set((docs || []).map((d: any) => d.url ?? d.url_oficial).filter(Boolean))
    );

    const retrievalRecords: RetrievalRecord[] = (docs || []).map((d: any, i: number) => ({
      url: (d.url ?? d.url_oficial ?? "") as string,
      rank: i + 1,
      score: (d._score ?? d.score ?? null) as number | null,
      raw_chunk: d ? (d as Record<string, any>) : null,
    }));

    const retrievalIds: Array<string | number> = (docs || [])
      .map((d: any) => d.id ?? d.doc_id ?? d.docId ?? d.key ?? null)
      .filter(Boolean);

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

    // 3.5) Guardarraíles PRE-LLM: un único punto de entrada
    const pre = await applyGuardrailsPreLLM({
      query: message,
      ragDocCount: docs?.length ?? 0,
    });

    if (pre.blocked) {
      const content = pre.reply || "Tu consulta no se puede procesar ahora mismo.";
      await appendTurn(chatId, message, content, {
        sources: sourceUrls,
        retrieval: { topK: RETRIEVER_TOP_K, ids: retrievalIds },
        retrievalRecords,
        retrieverTopK: RETRIEVER_TOP_K,
        usedRetriever: !skipRetriever,
        model: "guardrail",
        guardrails: pre.types,
      });
      if (!shortSummary || history.length % UPDATE_SHORT_SUMMARY_EVERY_TURNS === 0) {
        const compact = message.length > 120 ? message.slice(0, 117) + "..." : message;
        await setShortSummary(chatId, `Tema reciente: ${compact}`);
      }
      await cacheAnswer(message, content, { model: "guardrail", sources: sourceUrls });
      return { type: "generated", content, sources: sourceUrls, model: "guardrail" };
    }

    // 4) Intro guiada (si procede)
    if (INTRO_GUIDE_ENABLED) {
      const turnsSoFar = history.length;
      const missing = missingProfileFields(profile);
      const isBeginning = turnsSoFar < INTRO_GUIDE_MIN_TURNS;

      if (missing.length && isBeginning) {
        const content = renderGuidedIntro(missing);
        await appendTurn(chatId, message, content, {
          model: "guided-intro",
          guidedIntro: { missing, profileSnapshot: profile },
          retrieverTopK: RETRIEVER_TOP_K,
          usedRetriever: !skipRetriever,
        });
        if (!shortSummary || history.length % UPDATE_SHORT_SUMMARY_EVERY_TURNS === 0) {
          const compact = message.length > 120 ? message.slice(0, 117) + "..." : message;
          await setShortSummary(chatId, `Tema reciente: ${compact}`);
        }
        return { type: "generated", content, model: "guided-intro" };
      }
    }

    // 5) LLM
    if (CORE_VERBOSE) console.time(`[core] llm`);
    const systemPrompt = loadSystemPromptFromLLM();
    const urlWhitelist = sourceUrls; // whitelist para el prompt
    const ragEmptyBehavior = (!docs || docs.length === 0) ? "ask_for_name_or_link" : "none";

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
          // ⬇️ nuevos campos que tu prompt soporta
          urlWhitelist,
          ragEmptyBehavior,
        } as any),
        CORE_LLM_TIMEOUT_MS,
        "llm:getCompletion"
      );
      content = out.content;
      model = out.model || "llm";
      if (CORE_VERBOSE) console.timeEnd(`[core] llm`);
    } catch (e: any) {
      if (CORE_VERBOSE) {
        console.warn(`[core] llm error/fallback:`, e?.message || e);
        console.timeEnd(`[core] llm`);
      }
      content = makeFallbackFromChunks(chunks);
    }

    // 6) Persistencias
    if (CORE_VERBOSE) console.time(`[core] persist`);
    await appendTurn(chatId, message, content, {
      sources: sourceUrls,
      shownSources: sourceUrls, // ahora las URLs ya van controladas en el prompt
      retrieval: { topK: RETRIEVER_TOP_K, ids: retrievalIds },
      retrievalRecords,
      retrieverTopK: RETRIEVER_TOP_K,
      usedRetriever: !skipRetriever,
      model,
    });

    if (!shortSummary || history.length % UPDATE_SHORT_SUMMARY_EVERY_TURNS === 0) {
      const compact = message.length > 120 ? message.slice(0, 117) + "..." : message;
      await setShortSummary(chatId, `Tema reciente: ${compact}`);
    }

    await cacheAnswer(message, content, { model, sources: sourceUrls });
    touchChatSession(chatId).catch(() => {});
    if (CORE_VERBOSE) console.timeEnd(`[core] persist`);

    return { type: "generated", content, sources: sourceUrls, model };
  } finally {
    if (CORE_VERBOSE) console.timeEnd(`[core] total`);
  }
}

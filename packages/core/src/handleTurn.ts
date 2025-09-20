// packages/core/src/handleTurn.ts
import {
  CORE_VERBOSE,
  RETRIEVER_TOP_K,
  UPDATE_SHORT_SUMMARY_EVERY_TURNS,
  CORE_RETRIEVER_TIMEOUT_MS,
  CORE_LLM_TIMEOUT_MS,
  INTRO_GUIDE_ENABLED,
  INTRO_GUIDE_MIN_TURNS, // (si lo usas en otro punto, aquí queda a mano)
  CORE_SKIP_RETRIEVER,
  ONBOARDING_ONLY_IN_SCOPE,
  ONBOARDING_MIN_ANSWERS,
  ONBOARDING_MAX_QUESTIONS,
  INTRO_GUIDE_REQUIRED,
} from "./config";

import { withTimeout } from "./time";
import { makeFallbackFromChunks } from "./fallback";

/** perfil + onboarding **/
import { augmentQueryWithProfile } from "./profile";
import { extractProfilePatchFromMessage, type UserProfile } from "./onboarding/extract";
import { promptFor } from "./onboarding/prompts";
import { buildOnboardingQuery } from "./onboarding/query";
import { getLastAskedField, pickNextField } from "./onboarding/state";

/** cache + retriever + memory **/
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

/** LLM **/
import { getCompletion, loadSystemPromptFromLLM } from "../../llm/src";

/** Guardarraíles **/
import { applyGuardrailsPreLLM } from "./guardrails";

export type HandleTurnInput = { chatId: string; userId?: string | null; message: string };
export type HandleTurnOutput = { type: "cached" | "generated"; content: string; sources?: string[]; model?: string };

// Utilidad de logging con prefijo uniforme
function dbg(...args: any[]) {
  if (CORE_VERBOSE) console.log("[core]", ...args);
}

export async function handleTurn(input: HandleTurnInput): Promise<HandleTurnOutput> {
  const { chatId, message } = input;

  if (CORE_VERBOSE) console.time(`[core] total`);
  try {
    dbg(`chatId=${chatId}`);

    // Dump de flags críticos al inicio de cada turno
    dbg(
      "config:",
      JSON.stringify(
        {
          INTRO_GUIDE_ENABLED,
          INTRO_GUIDE_MIN_TURNS,
          INTRO_GUIDE_REQUIRED,
          ONBOARDING_MIN_ANSWERS,
          ONBOARDING_MAX_QUESTIONS,
          ONBOARDING_ONLY_IN_SCOPE,
          CORE_SKIP_RETRIEVER,
          RETRIEVER_TOP_K,
          CORE_RETRIEVER_TIMEOUT_MS,
          CORE_LLM_TIMEOUT_MS,
        },
        null,
        2
      )
    );

    // 0) Sesión (best-effort)
    ensureChatSession(chatId, null, undefined).catch(() => {});

    // 1) Cache exacta
    if (CORE_VERBOSE) console.time(`[core] cache:get`);
    const cached = await withTimeout(getCachedAnswer(message), 3000, "cache:get");
    if (CORE_VERBOSE) console.timeEnd(`[core] cache:get`);
    if (cached) {
      dbg(`HIT cache → model=${cached.model} | sources=${(cached.sources || []).length}`);
      await appendTurn(chatId, message, cached.answer, {
        sources: cached.sources,
        hitCache: true,
        model: cached.model,
      });
      touchChatSession(chatId).catch(() => {});
      return { type: "cached", content: cached.answer, sources: cached.sources, model: cached.model };
    }

    // 2) Memoria y perfil (con patch usando el campo esperado, si lo hay)
    if (CORE_VERBOSE) console.time(`[core] memory:get`);
    const history = await withTimeout(getMemoryAsMessages(chatId), 4000, "memory:getHistory");
    const shortSummary = await withTimeout(getShortSummary(chatId), 2000, "memory:getShortSummary");
    if (CORE_VERBOSE) console.timeEnd(`[core] memory:get`);

    // ¿El assistant preguntó algo de onboarding en el turno previo?
    const expecting = INTRO_GUIDE_ENABLED ? getLastAskedField(history as any) : null;
    const isOnboardingReply = !!expecting;
    dbg(`onboarding: enabled=${!!INTRO_GUIDE_ENABLED} | isReply=${isOnboardingReply} | expecting=${expecting || "-"}`);

    // Patch contextual (si hay expecting, el extractor sabe interpretarlo)
    const userPatch = extractProfilePatchFromMessage(message, isOnboardingReply ? { expecting } : undefined);
    if (Object.keys(userPatch).length) {
      dbg("onboarding: patch →", userPatch);
      await saveProfilePatch(chatId, userPatch);
    }

    // Perfil saneado (snapshot tras patch)
    let profile = ((await getProfile(chatId)) || {}) as Partial<UserProfile>;
    dbg("profile snapshot:", profile);

    /* ==========================================================
       3) Onboarding (mini-entrevista: 1 pregunta por turno) — AHORA ANTES QUE GUARDARRAÍLES
       ========================================================== */
    if (INTRO_GUIDE_ENABLED) {
      const p = profile || {};

      // ¿Qué campos ya tenemos y cuáles faltan?
      const answered = INTRO_GUIDE_REQUIRED.filter((k) => (p as any)[k] && String((p as any)[k]).trim() !== "");
      const missing = INTRO_GUIDE_REQUIRED.filter((k) => !answered.includes(k)) as (keyof UserProfile)[];

      // Lógica de continuidad
      const continueInterview = isOnboardingReply || answered.length < ONBOARDING_MIN_ANSWERS;

      // Por ahora, si ONBOARDING_ONLY_IN_SCOPE está activo, solo seguimos si es respuesta de onboarding.
      // (Más adelante podemos afinar para permitir onboarding fuera de scope con heurísticas).
      const inScopeOk = !ONBOARDING_ONLY_IN_SCOPE || isOnboardingReply;

      // Heurística de “demasiadas preguntas”
      const askedRecently = history.filter(
        (m: any) => m.role === "assistant" && /tamañ|tamano|sector|objetiv/i.test(m.content) && /[¿\?]/.test(m.content)
      ).length;
      const underQuestionCap = askedRecently < ONBOARDING_MAX_QUESTIONS;

      dbg(
        "onboarding: answered=%d missing=%d continue=%s inScope=%s askedRecently=%d capOK=%s",
        answered.length,
        missing.length,
        continueInterview,
        inScopeOk,
        askedRecently,
        underQuestionCap
      );

      if (inScopeOk && continueInterview && missing.length > 0 && underQuestionCap) {
        const nextField = pickNextField(p) || (missing[0] as keyof UserProfile);
        const q = promptFor(nextField);

        if (q.shouldAsk) {
          const content = q.hint ? `${q.prompt}\n\n_${q.hint}_` : q.prompt;
          dbg("onboarding: asking field =", q.missingField);

          await appendTurn(chatId, message, content, {
            model: "guided-intro",
            guidedIntro: {
              lastAsked: q.missingField,
              missing,
              profileSnapshot: p,
            },
          });

          if (!shortSummary || history.length % UPDATE_SHORT_SUMMARY_EVERY_TURNS === 0) {
            const compact = message.length > 120 ? message.slice(0, 117) + "..." : message;
            await setShortSummary(chatId, `Tema reciente: ${compact}`);
          }

          return { type: "generated", content, model: "guided-intro" };
        }
        // Si promptFor devolviera {shouldAsk:false}, seguimos flujo normal (guardrails → RAG → LLM).
      }
    }

    /* ==========================================================
       4) Guardarraíles PRE-LLM (solo si NO hubo pregunta de onboarding)
       ========================================================== */
    dbg("guardrails: calling pre-LLM… (runs AFTER onboarding decision)");
    const pre = await applyGuardrailsPreLLM({ query: message, ragDocCount: 0 });
    dbg("guardrails: result =", {
      blocked: pre?.blocked ?? false,
      types: pre?.types ?? [],
      hasReply: !!pre?.reply,
    });

    if (pre.blocked) {
      const content = pre.reply || "Tu consulta no se puede procesar ahora mismo.";
      dbg("guardrails: BLOCKED → short-circuiting with guardrail reply");
      await appendTurn(chatId, message, content, { model: "guardrail", guardrails: pre.types });
      if (!shortSummary || history.length % UPDATE_SHORT_SUMMARY_EVERY_TURNS === 0) {
        const compact = message.length > 120 ? message.slice(0, 117) + "..." : message;
        await setShortSummary(chatId, `Tema reciente: ${compact}`);
      }
      await cacheAnswer(message, content, { model: "guardrail", sources: [] });
      return { type: "generated", content, model: "guardrail", sources: [] };
    }

    // 5) RAG — construir query con onboarding si ya hay respuestas suficientes
    const skipRetriever = CORE_SKIP_RETRIEVER;
    const p2 = (profile || {}) as Partial<UserProfile>;
    const answeredNow = INTRO_GUIDE_ENABLED
      ? INTRO_GUIDE_REQUIRED.filter((k) => (p2 as any)[k] && String((p2 as any)[k]).trim() !== "")
      : [];
    const useOnboardingQuery = INTRO_GUIDE_ENABLED && answeredNow.length >= ONBOARDING_MIN_ANSWERS;

    const retrieverQuery = useOnboardingQuery
      ? buildOnboardingQuery(p2, message)
      : (INTRO_GUIDE_ENABLED ? augmentQueryWithProfile(message, p2) : message);

    dbg("retriever: skip=%s topK=%d useOnboardingQuery=%s", skipRetriever, RETRIEVER_TOP_K, useOnboardingQuery);
    dbg("retriever: query=\n" + retrieverQuery);

    let docs: any[] = [];
    if (!skipRetriever) {
      if (CORE_VERBOSE) console.time(`[core] retriever`);
      docs = await withTimeout(
        retrieveRelevantDocs(retrieverQuery, RETRIEVER_TOP_K),
        CORE_RETRIEVER_TIMEOUT_MS,
        "retriever"
      );
      if (CORE_VERBOSE) console.timeEnd(`[core] retriever`);
    } else {
      dbg("retriever: SKIPPED");
    }

    // --- Fuentes/ids/chunks para UI/LLM
    const sourceUrls = Array.from(new Set((docs || []).map((d: any) => d.url ?? d.url_oficial).filter(Boolean)));
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

    dbg(`retriever: docs=${docs?.length || 0} sources=${sourceUrls.length}`);

    // 6) LLM
    if (CORE_VERBOSE) console.time(`[core] llm`);
    const systemPrompt = loadSystemPromptFromLLM();
    const urlWhitelist = sourceUrls; // el prompt del LLM ya respeta esta whitelist
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
          urlWhitelist,
          ragEmptyBehavior,
        } as any),
        CORE_LLM_TIMEOUT_MS,
        "llm:getCompletion"
      );
      content = out.content;
      model = out.model || "llm";
      if (CORE_VERBOSE) console.timeEnd(`[core] llm`);
      dbg("llm: model=%s | content.len=%d", model, content?.length || 0);
    } catch (e: any) {
      if (CORE_VERBOSE) {
        console.warn(`[core] llm error/fallback:`, e?.message || e);
        console.timeEnd(`[core] llm`);
      }
      content = makeFallbackFromChunks(chunks);
      dbg("llm: FALLBACK from chunks");
    }

    // 7) Persistencias
    if (CORE_VERBOSE) console.time(`[core] persist`);
    await appendTurn(chatId, message, content, {
      sources: sourceUrls,
      shownSources: sourceUrls,
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

    dbg("return: type=generated model=%s sources=%d", model, sourceUrls.length);
    return { type: "generated", content, sources: sourceUrls, model };
  } finally {
    if (CORE_VERBOSE) console.timeEnd(`[core] total`);
  }
}

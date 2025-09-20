// packages/core/src/handleTurn.ts
import { CFG } from "./config";
import { withTimeout } from "./time";
import { makeFallbackFromChunks } from "./fallback";

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

import { getCompletion, loadSystemPromptFromLLM } from "../../llm/src";

import {
  buildOnboardingQuery,
  augmentQueryWithProfile,
} from "./rag/buildQuery";
import { getStatus } from "./onboarding/fsm";
import { extractPatch } from "./onboarding/extractor";
import type { UserProfile } from "./onboarding/types";

import { applyPreSafety } from "./guardrails/preSafety";
import { applyPostScope } from "./guardrails/postScope";
import { promptFor } from "./onboarding/prompts";

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

const dbg = (...a: any[]) => {
  if (CFG.VERBOSE) console.log("[core]", ...a);
};

export async function handleTurn(
  input: HandleTurnInput
): Promise<HandleTurnOutput> {
  const { chatId, message } = input;
  if (CFG.VERBOSE) console.time("[core] total");
  try {
    dbg("config", CFG);

    // 0) Sesión
    ensureChatSession(chatId, null, undefined).catch(() => {});

    // 1) Cache exacta
    const cached = await withTimeout(
      getCachedAnswer(message),
      3000,
      "cache:get"
    );
    if (cached) {
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

    // 2) Memoria + perfil
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

    // Detectar última pregunta de onboarding (meta nueva/legacy o por texto)
    const expecting = detectLastAskedField(history);
    dbg("onboarding: expecting=%s", expecting || "-");

    // Extraer patch si procede y guardar
    const patch = CFG.INTRO.ENABLED
      ? extractPatch(message, expecting as any)
      : {};
    const wasAnsweredThisTurn = Object.keys(patch).length > 0;
    dbg("onboarding: patch=", patch);
    if (wasAnsweredThisTurn) await saveProfilePatch(chatId, patch);

    // Snapshot de perfil tras patch
    const profile = ((await getProfile(chatId)) || {}) as Partial<UserProfile>;
    dbg("onboarding: profile snapshot=", profile);

    // 3) FSM Onboarding — GATE: no avanzamos hasta MIN_ANSWERS
    // 3) FSM Onboarding — GATE: no avanzamos hasta MIN_ANSWERS
    // 3) FSM Onboarding — HARD GATE: no avanzamos hasta MIN_ANSWERS
    if (CFG.INTRO.ENABLED) {
      // nº de preguntas de intro vistas recientemente (por meta O por texto)
      const askedRecently = countRecentOnboardingQuestions(history);

      // qué campos están contestados y cuáles faltan
      const required = CFG.INTRO.REQUIRED as (keyof UserProfile)[];
      const answeredKeys = required.filter(
        (k) => (profile as any)[k] && String((profile as any)[k]).trim() !== ""
      );
      const missingKeys = required.filter((k) => !answeredKeys.includes(k));
      const answeredCount = answeredKeys.length;

      // ✅ HARD-GATE: mientras falten mínimas, NO pasamos a guardrails/RAG
      if (answeredCount < CFG.INTRO.MIN_ANSWERS && missingKeys.length > 0) {
        // Anti-repeat: si justo se contestó el expecting en este turno, evítalo
        const avoid = wasAnsweredThisTurn ? expecting : null;
        // Prioridad fija: company_size → sector → objective
        const nextField = pickNextFieldSafe(profile, missingKeys, avoid);
        dbg(
          "onboarding(HARD): answered=%d/%d missing=%j nextField=%s askedRecently=%d",
          answeredCount,
          CFG.INTRO.MIN_ANSWERS,
          missingKeys,
          nextField,
          askedRecently
        );

        const p = promptFor(nextField);
        const content = p.hint ? `${p.text}\n\n_${p.hint}_` : p.text;

        // Guarda meta en formato nuevo y legacy (compatibilidad)
        await appendTurn(chatId, message, content, {
          model: "guided-intro",
          meta: {
            guidedIntro: {
              lastAsked: nextField,
              missing: missingKeys,
              profileSnapshot: profile,
            },
          },
          guidedIntro: {
            lastAsked: nextField,
            missing: missingKeys,
            profileSnapshot: profile,
          },
        });

        if (!shortSummary || history.length % CFG.SUMMARY_EVERY === 0) {
          const compact =
            message.length > 120 ? message.slice(0, 117) + "..." : message;
          await setShortSummary(chatId, `Tema reciente: ${compact}`);
        }
        return { type: "generated", content, model: "guided-intro" };
      }

      // 🔁 (Opcional) Una vez alcanzadas las mínimas, ya puedes delegar en la FSM “blanda”
      // para seguir preguntando campos restantes sin bloquear RAG (si quieres):
      const status = getStatus({
        profile,
        required,
        minAnswers: CFG.INTRO.MIN_ANSWERS,
        maxQuestions: CFG.INTRO.MAX_QUESTIONS,
        askedRecentlyCount: askedRecently,
        expecting: expecting as any,
        // Ya no relajamos scope aquí: respetamos ONLY_IN_SCOPE a partir de ahora
        onlyInScope: CFG.INTRO.ONLY_IN_SCOPE,
        inScope: true, // si tienes intent-classifier
      });
      dbg("onboarding(SOFT): status=", status);

      if (status.state === "ask") {
        const avoid = wasAnsweredThisTurn ? expecting : null;
        const nextField = pickNextFieldSafe(
          profile,
          status.missing as any,
          avoid
        );
        dbg("onboarding(SOFT): nextField=", nextField);

        const p = promptFor(nextField);
        const content = p.hint ? `${p.text}\n\n_${p.hint}_` : p.text;

        await appendTurn(chatId, message, content, {
          model: "guided-intro",
          meta: {
            guidedIntro: {
              lastAsked: nextField,
              missing: status.missing,
              profileSnapshot: profile,
            },
          },
          guidedIntro: {
            lastAsked: nextField,
            missing: status.missing,
            profileSnapshot: profile,
          },
        });

        if (!shortSummary || history.length % CFG.SUMMARY_EVERY === 0) {
          const compact =
            message.length > 120 ? message.slice(0, 117) + "..." : message;
          await setShortSummary(chatId, `Tema reciente: ${compact}`);
        }
        return { type: "generated", content, model: "guided-intro" };
      }
    }

    // 4) Guardarraíles PRE-LLM (solo safety)
    if (CFG.GUARDRAILS.SAFETY_ENABLED) {
      const pre = await applyPreSafety(message);
      if (pre.blocked) {
        const content =
          pre.reply || "Tu consulta no se puede procesar ahora mismo.";
        await appendTurn(chatId, message, content, {
          model: "guardrail:safety",
          guardrails: pre.types,
        });
        await cacheAnswer(message, content, {
          model: "guardrail:safety",
          sources: [],
        });
        return {
          type: "generated",
          content,
          model: "guardrail:safety",
          sources: [],
        };
      }
    }

    // 5) RAG
    const skipRetriever = CFG.RAG.SKIP;
    const answeredNow = CFG.INTRO.ENABLED
      ? (CFG.INTRO.REQUIRED as string[]).filter(
          (k) =>
            (profile as any)[k] && String((profile as any)[k]).trim() !== ""
        )
      : [];
    const useOnboardingQuery =
      CFG.INTRO.ENABLED && answeredNow.length >= CFG.INTRO.MIN_ANSWERS;

    const retrieverQuery = useOnboardingQuery
      ? buildOnboardingQuery(profile, message)
      : CFG.INTRO.ENABLED
      ? augmentQueryWithProfile(message, profile)
      : message;

    let docs: any[] = [];
    if (!skipRetriever) {
      docs = await withTimeout(
        retrieveRelevantDocs(retrieverQuery, CFG.RAG.TOP_K),
        CFG.RAG.TIMEOUT_MS,
        "retriever"
      );
    }

    // 6) Guardarraíles POST-Retriever (scope & calidad)
    if (CFG.GUARDRAILS.SCOPE_ENABLED) {
      const post = applyPostScope({ query: message, ragDocCount: docs.length });
      if (
        post.action === "ask_for_name_or_link" ||
        post.action === "soft_redirect"
      ) {
        const content = post.reply;
        await appendTurn(chatId, message, content, {
          model: "guardrail:scope",
        });
        return {
          type: "generated",
          content,
          model: "guardrail:scope",
          sources: [],
        };
      }
    }

    // 7) LLM
    const sourceUrls = Array.from(
      new Set(
        (docs || []).map((d: any) => d.url ?? d.url_oficial).filter(Boolean)
      )
    );
    const retrievalRecords: RetrievalRecord[] = (docs || []).map(
      (d: any, i: number) => ({
        url: (d.url ?? d.url_oficial ?? "") as string,
        rank: i + 1,
        score: (d._score ?? d.score ?? null) as number | null,
        raw_chunk: d ? (d as Record<string, any>) : null,
      })
    );
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

    const systemPrompt = loadSystemPromptFromLLM();
    const ragEmptyBehavior =
      !docs || docs.length === 0 ? "ask_for_name_or_link" : "none";

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
          urlWhitelist: sourceUrls,
          ragEmptyBehavior,
        } as any),
        CFG.LLM.TIMEOUT_MS,
        "llm:getCompletion"
      );
      content = out.content;
      model = out.model || "llm";
    } catch (_) {
      content = makeFallbackFromChunks(chunks);
    }

    // 8) Persist
    await appendTurn(chatId, message, content, {
      sources: sourceUrls,
      shownSources: sourceUrls,
      retrieval: { topK: CFG.RAG.TOP_K, ids: retrievalIds },
      retrievalRecords,
      retrieverTopK: CFG.RAG.TOP_K,
      usedRetriever: !skipRetriever,
      model,
    });
    if (!shortSummary || history.length % CFG.SUMMARY_EVERY === 0) {
      const compact =
        message.length > 120 ? message.slice(0, 117) + "..." : message;
      await setShortSummary(chatId, `Tema reciente: ${compact}`);
    }
    await cacheAnswer(message, content, { model, sources: sourceUrls });
    touchChatSession(chatId).catch(() => {});

    return { type: "generated", content, sources: sourceUrls, model };
  } finally {
    if (CFG.VERBOSE) console.timeEnd("[core] total");
  }
}

/* ===================== Helpers robustos ===================== */

// Detecta la última pregunta de onboarding:
// 1) meta.guidedIntro.lastAsked
// 2) guidedIntro.lastAsked (legacy)
// 3) contenido de la última pregunta (regex)
function detectLastAskedField(history: any[]): string | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m?.role !== "assistant") continue;
    if (m?.meta?.guidedIntro?.lastAsked)
      return String(m.meta.guidedIntro.lastAsked);
    if (m?.guidedIntro?.lastAsked) return String(m.guidedIntro.lastAsked); // legacy
    const c = (m?.content || "") as string;
    // Fallback por texto:
    if (
      /\b(tamañ|tamano)\b.*empresa|\bsomos\b.*personas|\bfacturamos\b/i.test(c)
    )
      return "company_size";
    if (/\b(en qué sector|en que sector|sector operas?)\b/i.test(c))
      return "sector";
    if (/\bobjetivo principal\b|\brespecto a las ayudas\b/i.test(c))
      return "objective";
  }
  return null;
}

// Cuenta preguntas recientes de onboarding por meta o por texto
function countRecentOnboardingQuestions(history: any[]): number {
  let n = 0;
  for (let i = Math.max(0, history.length - 10); i < history.length; i++) {
    const m = history[i];
    if (m?.role !== "assistant") continue;
    if (m?.meta?.guidedIntro?.lastAsked || m?.guidedIntro?.lastAsked) {
      n++;
      continue;
    }
    const c = (m?.content || "") as string;
    if (
      /\b(tamañ|tamano)\b.*empresa|\b(en qué sector|en que sector)\b|\bobjetivo principal\b/i.test(
        c
      )
    )
      n++;
  }
  return n;
}

// Evita repetir el campo recién contestado
function pickNextFieldSafe(
  profile: Partial<UserProfile>,
  missing: (keyof UserProfile)[],
  avoid?: string | null
) {
  const candidates = avoid ? missing.filter((m) => m !== avoid) : missing;
  // prioridad simple: company_size → sector → objective
  const order: (keyof UserProfile)[] = ["company_size", "sector", "objective"];
  const sorted = candidates.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return (sorted[0] || candidates[0] || missing[0]) as keyof UserProfile;
}

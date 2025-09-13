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
  setShortSummary,
  appendTurn,
  ensureChatSession,             // sesión en Neon
  touchChatSession,              // marca actividad
  MEMORY_AUDIT_TO_NEON_ENABLED,
  MEMORY_AUDIT_MESSAGE_SOURCES_ENABLED,
  type RetrievalRecord,          // tipo exportado desde memory (para TS)
  // Perfil
  saveProfilePatch,
  getProfile,
} from "../../memory/src/index";
import {
  getCompletion,
  maybeDistillAndPersist,
  loadSystemPromptFromLLM,
} from "../../llm/src/index";

// Guardarraíles
import {
  GUARD_cfg,
  detectPreLLM,
  enforceUrlWhitelist,
  guardrailMsgs,
  enforceScopeAfterLLM,          // post-LLM scope (solo si enabled)
} from "./guardrails";

const VERBOSE = process.env.CORE_VERBOSE === "1";
if (VERBOSE) {
  console.log(`[core] audit->neon: ${MEMORY_AUDIT_TO_NEON_ENABLED ? "ON" : "OFF"}`);
  console.log(`[core] message_sources: ${MEMORY_AUDIT_MESSAGE_SOURCES_ENABLED ? "ON" : "OFF"}`);
  console.log(`[core] guardrails: ${GUARD_cfg.enabled ? "ON" : "OFF"}`);
}

// ⬇️⬇️⬇️ FALTA EN TU ARCHIVO: util de timeout
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let t: NodeJS.Timeout;
  const timeout = new Promise<never>((_, rej) =>
    (t = setTimeout(() => rej(new Error(`Timeout ${ms}ms en ${label}`)), ms))
  );
  return Promise.race([p, timeout]).finally(() => clearTimeout(t!)) as Promise<T>;
}

// Env: Intro guiada (desacoplada por .env)
const INTRO_GUIDE_ENABLED = (process.env.INTRO_GUIDE_ENABLED || "1") === "1";
const INTRO_GUIDE_MIN_TURNS = parseInt(process.env.INTRO_GUIDE_MIN_TURNS || "2", 10);
const INTRO_GUIDE_REQUIRED = (process.env.INTRO_GUIDE_REQUIRED || "company_size,sector,objective")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Parse simple “clave: valor” o “clave=valor”
function extractProfilePatchFromMessage(msg: string) {
  const patch: Record<string, string> = {};
  const rx = /\b(company_size|tamaño|sector|objective|objetivo)\s*[:=]\s*([^\n,.;]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(msg)) !== null) {
    const kRaw = m[1].toLowerCase().trim();
    const v = m[2].trim();
    const k =
      kRaw === "tamaño" ? "company_size" :
      kRaw === "objetivo" ? "objective" :
      kRaw;
    if (["company_size", "sector", "objective"].includes(k) && v) {
      patch[k] = v;
    }
  }
  return patch as Partial<{ company_size: string; sector: string; objective: string }>;
}

function missingProfileFields(profile: any | null) {
  const p = profile || {};
  return INTRO_GUIDE_REQUIRED.filter((k) => !p[k] || String(p[k]).trim() === "");
}

// Enriquecer query del retriever con el perfil (texto libre)
function augmentQueryWithProfile(userQuery: string, profile: any | null) {
  if (!profile) return userQuery;
  const parts: string[] = [];
  if (profile.company_size) parts.push(`tamaño=${profile.company_size}`);
  if (profile.sector) parts.push(`sector=${profile.sector}`);
  if (profile.objective) parts.push(`objetivo=${profile.objective}`);
  if (!parts.length) return userQuery;
  return `${userQuery}\n\n[perfil] ${parts.join(" | ")}`;
}

// Mensaje guiado dinámico
function renderGuidedIntro(missing: string[]) {
  const labels: Record<string,string> = {
    company_size: "tamaño de la empresa",
    sector: "sector",
    objective: "objetivo",
  };
  const pedir = missing.map((k) => labels[k] || k).join(", ");
  return `Hola. Para afinar la búsqueda, ¿me indicas: ${pedir}?
Ejemplos:
- tamaño: 20 empleados
- sector: agroalimentario
- objetivo: internacionalizar`;
}

// Fallback basado en chunks (para timeouts del LLM)
function makeFallbackFromChunks(chunks: any[]) {
  if (!chunks.length) return "No he podido generar con el modelo y no hay contexto recuperado.";
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

export async function handleTurn(input: HandleTurnInput): Promise<HandleTurnOutput> {
  const { chatId, message } = input;

  if (VERBOSE) console.time(`[core] total`);
  try {
    if (VERBOSE) console.log(`[core] chatId=${chatId}`);

    // 0) Sesión en Neon (best-effort)
    ensureChatSession(chatId, null /* userId */, undefined).catch((e) => {
      if (VERBOSE) console.warn(`[core] ensureSession warn:`, e?.message || e);
    });

    // 1) Cache exacta
    if (VERBOSE) console.time(`[core] cache:get`);
    const cached = await withTimeout(getCachedAnswer(message), 3000, "cache:get");
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

    // 2) Memoria
    if (VERBOSE) console.time(`[core] memory:get`);
    const history = await withTimeout(getMemoryAsMessages(chatId), 4000, "memory:getHistory");
    const shortSummary = await withTimeout(getShortSummary(chatId), 2000, "memory:getShortSummary");
    if (VERBOSE) console.timeEnd(`[core] memory:get`);

    // 2.5) Perfil: patch + snapshot
    let profile = await getProfile(chatId);
    const patch = extractProfilePatchFromMessage(message);
    if (Object.keys(patch).length) {
      await saveProfilePatch(chatId, patch);
      profile = await getProfile(chatId);
    }

    // 3) Retriever
    const skipRetriever = process.env.CORE_SKIP_RETRIEVER === "1";
    let docs: any[] = [];

    const retrieverQuery = INTRO_GUIDE_ENABLED ? augmentQueryWithProfile(message, profile) : message;

    if (!skipRetriever) {
      if (VERBOSE) console.time(`[core] retriever`);
      docs = await withTimeout(
        retrieveRelevantDocs(retrieverQuery, RETRIEVER_TOP_K),
        CORE_RETRIEVER_TIMEOUT_MS,
        "retriever"
      );
      if (VERBOSE) console.timeEnd(`[core] retriever`);
    }

    // Intro guiada antes del LLM (si falta info clave)
    const turnsSoFar = history.length;
    const missing = INTRO_GUIDE_ENABLED ? missingProfileFields(profile) : [];
    const isVague = GUARD_cfg.enabled && detectPreLLM(message, docs).includes("VAGUE_QUERY");
    if (INTRO_GUIDE_ENABLED && missing.length && (turnsSoFar < INTRO_GUIDE_MIN_TURNS || isVague)) {
      const content = renderGuidedIntro(missing);
      if (VERBOSE) console.time(`[core] persist`);
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
      if (VERBOSE) console.timeEnd(`[core] persist`);
      return { type: "generated", content, model: "guided-intro" };
    }

    // --- Fuentes para UI/Auditoría ---
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

    // Guardarraíles PRE-LLM (solo si enabled)
    // 3.5) Guardarraíles PRE-LLM (triage temprano)
    const preReasons = detectPreLLM(message, docs);
    if (GUARD_cfg.enabled && preReasons.length) {
      let content = "";

      if (preReasons.includes("GREETING")) {
        // Saludo conversacional (sin OUT_OF_SCOPE)
        content = guardrailMsgs.GREETING;

        // Si usas intro guiada y faltan campos, pide 1 línea extra (opcional)
        const missing = INTRO_GUIDE_ENABLED ? missingProfileFields(profile) : [];
        if (INTRO_GUIDE_ENABLED && missing.length) {
          content += `\n\nPara afinar, indícame: ${missing
            .map((k) => (k === "company_size" ? "tamaño" : k === "objective" ? "objetivo" : k))
            .join(", ")}.`;
        }

        if (VERBOSE) console.time(`[core] persist`);
        await appendTurn(chatId, message, content, {
          model: "guardrail",
          guardrails: preReasons,
        });
        if (!shortSummary || history.length % UPDATE_SHORT_SUMMARY_EVERY_TURNS === 0) {
          const compact = message.length > 120 ? message.slice(0, 117) + "..." : message;
          await setShortSummary(chatId, `Tema reciente: ${compact}`);
        }
        touchChatSession(chatId).catch(() => {});
        if (VERBOSE) console.timeEnd(`[core] persist`);
        return { type: "generated", content, model: "guardrail" };
      }

      // Prioridad para el resto: OUT_OF_SCOPE > VAGUE_QUERY > RAG_EMPTY
      const reason =
        preReasons.includes("OUT_OF_SCOPE") ? "OUT_OF_SCOPE" :
        preReasons.includes("VAGUE_QUERY")  ? "VAGUE_QUERY"  :
                                              "RAG_EMPTY";

      // Aquí NO adjuntamos fichas; solo el mensaje del guardarraíl
      content = guardrailMsgs[reason];

      if (VERBOSE) console.time(`[core] persist`);
      await appendTurn(chatId, message, content, {
        sources: sourceUrls,
        retrieval: { topK: RETRIEVER_TOP_K, ids: retrievalIds },
        retrievalRecords,
        retrieverTopK: RETRIEVER_TOP_K,
        usedRetriever: !skipRetriever,
        model: "guardrail",
        guardrails: preReasons,
      });
      if (!shortSummary || history.length % UPDATE_SHORT_SUMMARY_EVERY_TURNS === 0) {
        const compact = message.length > 120 ? message.slice(0, 117) + "..." : message;
        await setShortSummary(chatId, `Tema reciente: ${compact}`);
      }
      await cacheAnswer(message, content, { model: "guardrail", sources: sourceUrls });
      touchChatSession(chatId).catch(() => {});
      if (VERBOSE) console.timeEnd(`[core] persist`);
      return { type: "generated", content, sources: sourceUrls, model: "guardrail" };
    }


    // 4) LLM con fallback
    if (VERBOSE) console.time(`[core] llm`);
    const systemPrompt = loadSystemPromptFromLLM();
    let content = "";
    let model = "fallback";
    try {
      const out = await withTimeout(
        getCompletion({ chatId, systemPrompt, history, shortSummary, chunks, user: message }),
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
      content = makeFallbackFromChunks(chunks);
    }

    // Guardarraíl POST-LLM: scope override (solo si enabled)
    if (GUARD_cfg.enabled) {
      const scoped = enforceScopeAfterLLM(message, content, docs?.length || 0);
      content = scoped.content;
      if (scoped.overridden && VERBOSE) {
        console.warn("[guardrails] OUT_OF_SCOPE override applied");
      }
    }

    // Whitelist de URLs mostradas (solo si enabled)
    let shownSources = sourceUrls; // por defecto si guardrails OFF
    if (GUARD_cfg.enabled) {
      const norm = (u: string) => u.replace(/^https?:\/\//, "").replace(/\/$/, "");
      const shownSourcesRaw = sourceUrls.filter((u) => {
        const clean = norm(u);
        return content.includes(u) || content.includes(clean);
      });
      shownSources = shownSourcesRaw.length ? shownSourcesRaw : sourceUrls;

      const enforced = enforceUrlWhitelist(content, shownSources);
      if (enforced.strippedUrls.length && VERBOSE) {
        console.warn("[guardrails] URL_STRIPPED:", enforced.strippedUrls);
      }
      content =
        enforced.content +
        (enforced.strippedUrls.length ? guardrailMsgs.URL_STRIPPED_SUFFIX : "");
    }

    // 5) Persistencias
    if (VERBOSE) console.time(`[core] persist`);
    await appendTurn(chatId, message, content, {
      sources: sourceUrls,
      shownSources,
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
    maybeDistillAndPersist(chatId, loadSystemPromptFromLLM()).catch((e) => {
      if (VERBOSE) console.warn(`[core] distill warn:`, e?.message || e);
    });
    touchChatSession(chatId).catch(() => {});
    if (VERBOSE) console.timeEnd(`[core] persist`);

    return { type: "generated", content, sources: sourceUrls, model };
  } finally {
    if (VERBOSE) console.timeEnd(`[core] total`);
  }
}

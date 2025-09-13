// packages/memory/src/index.ts
// -------------------------------------------------------------
// Memoria corta (Redis) + Auditoría y Memoria larga (Neon/Drizzle)
// -------------------------------------------------------------

import * as dotenv from "dotenv";
dotenv.config();

import { eq, sql } from "drizzle-orm"; // 👈 añade 'sql' para expresiones JSONB
import { getRedis } from "./redisClient";
import {
  MEMORY_MAX_TURNS,
  MEMORY_TTL_SECONDS,
  MEMORY_RECENT_LIMIT,
  kMsgs,
  kSummaryShort,
} from "./constants";
import type { TurnItem, Message } from "./types";

// Conexión Drizzle/Neon y tablas principales
import {
  db,
  chatMessages,
  memorySummaries,
  messageSources,
  chatSessions,
} from "./neonClient";
// Flag para activar/desactivar auditoría persistente a Neon
const MEMORY_AUDIT_TO_NEON = process.env.MEMORY_AUDIT_TO_NEON === "1";
export const MEMORY_AUDIT_TO_NEON_ENABLED = MEMORY_AUDIT_TO_NEON;

// 🔧 NUEVO: flag específica para message_sources (por defecto ON)
const MEMORY_AUDIT_MESSAGE_SOURCES =
  process.env.MEMORY_AUDIT_MESSAGE_SOURCES !== "0";
export const MEMORY_AUDIT_MESSAGE_SOURCES_ENABLED =
  MEMORY_AUDIT_MESSAGE_SOURCES;

const VERBOSE = process.env.CORE_VERBOSE === "1";

// -------------------------------------------------------------
// Tipos
// -------------------------------------------------------------

// Tipo fuerte para auditoría a Neon (tabla chat_messages)
// Tipo fuerte para auditoría a Neon (tabla chat_messages)
export type RetrievalRecord = {
  url: string;
  rank: number;
  score?: number | null;
  raw_chunk?: Record<string, any> | null;
};

export type ChatAuditMeta = {
  sources?: string[];
  retrieval?:
    | { topK?: number; ids?: Array<string | number> }
    | RetrievalRecord[];
  retrievalRecords?: RetrievalRecord[];
  shownSources?: string[];
  retrieverTopK?: number;
  usedRetriever?: boolean;
  model?: string;
  hitCache?: boolean;
  [k: string]: any;
};

export type ChatAuditItem = {
  role: "user" | "assistant";
  content: string;
  meta?: ChatAuditMeta | null;
};

// -------------------------------------------------------------
// Memoria Corta: Redis (turnos y resumen breve)
// -------------------------------------------------------------

/**
 * Guarda un turno (user + assistant) en Redis.
 * - TTL para caducidad
 * - Poda por longitud máxima
 * - Si MEMORY_AUDIT_TO_NEON=1, replica en Neon (no bloqueante)
 */
export async function appendTurn(
  chatId: string,
  userMsg: string,
  assistantMsg: string,
  meta?: TurnItem["meta"]
) {
  // --- Redis (memoria corta) ---
  const redis = await getRedis();
  const item: TurnItem = {
    ts: Date.now(),
    user: userMsg,
    assistant: assistantMsg,
    meta,
  };
  const key = kMsgs(chatId);

  await redis.rPush(key, JSON.stringify(item));
  await redis.expire(key, MEMORY_TTL_SECONDS);

  // Poda si excede
  const len = await redis.lLen(key);
  if (len > MEMORY_MAX_TURNS) {
    const toTrimStart = len - MEMORY_MAX_TURNS;
    // Mantiene las últimas MEMORY_MAX_TURNS entradas
    await redis.lTrim(key, toTrimStart, -1);
  }

  // --- Neon (auditoría persistente) ---
  if (MEMORY_AUDIT_TO_NEON) {
    appendAuditToNeon(chatId, [
      {
        role: "user",
        content: userMsg,
        meta: (meta ?? null) as Record<string, any> | null,
      },
      {
        role: "assistant",
        content: assistantMsg,
        meta: (meta ?? null) as Record<string, any> | null,
      },
    ]).catch((e) => {
      if (process.env.CORE_VERBOSE === "1") {
        console.warn("[memory] audit->neon warn:", e?.message || e);
      }
    });
  }
}

/** Recupera los últimos N turnos (objetos TurnItem) desde Redis */
export async function getRecentTurns(
  chatId: string,
  limit = MEMORY_RECENT_LIMIT
): Promise<TurnItem[]> {
  const redis = await getRedis();
  const key = kMsgs(chatId);
  const len = await redis.lLen(key);
  if (len === 0) return [];
  const start = Math.max(0, len - limit);
  const raw = await redis.lRange(key, start, -1);
  return raw.map((s) => JSON.parse(s) as TurnItem);
}

/** Convierte los turnos recientes a mensajes {role, content} listos para LLM */
export async function getMemoryAsMessages(
  chatId: string,
  limit = MEMORY_RECENT_LIMIT
): Promise<Message[]> {
  const turns = await getRecentTurns(chatId, limit);
  const messages: Message[] = [];
  for (const t of turns) {
    messages.push({ role: "user", content: t.user });
    messages.push({ role: "assistant", content: t.assistant });
  }
  return messages;
}

/** Lee el resumen breve (TTL) desde Redis */
export async function getShortSummary(chatId: string): Promise<string | null> {
  const redis = await getRedis();
  return redis.get(kSummaryShort(chatId));
}

/** Guarda/renueva el resumen breve en Redis (con TTL) */
export async function setShortSummary(chatId: string, text: string) {
  const redis = await getRedis();
  await redis.set(kSummaryShort(chatId), text, { EX: MEMORY_TTL_SECONDS });
}

/** Borra la memoria corta de un chat (mensajes y resumen breve) */
export async function clearChat(chatId: string) {
  const redis = await getRedis();
  await redis.del(kMsgs(chatId));
  await redis.del(kSummaryShort(chatId));
}

/** Renueva TTL de la lista de mensajes si existe */
export async function touchChat(chatId: string) {
  const redis = await getRedis();
  const key = kMsgs(chatId);
  const exists = await redis.exists(key);
  if (exists) await redis.expire(key, MEMORY_TTL_SECONDS);
}

// -------------------------------------------------------------
// Auditoría Persistente: Neon (chat_messages)
// -------------------------------------------------------------

/**
 * Inserta mensajes en chat_messages (JSONB en meta).
 * Nota: NO convertir meta a string; es un objeto JSON.
 */
export async function appendAuditToNeon(
  chatId: string,
  items: ChatAuditItem[]
) {
  if (items.length === 0) return;

  // 1) Inserta los mensajes y recupera IDs
  const inserted = await db
    .insert(chatMessages)
    .values(
      items.map((it) => ({
        chat_id: chatId,
        role: it.role,
        content: it.content,
        meta: it.meta ?? null, // JSONB (objeto)
      }))
    )
    .returning({ id: chatMessages.id, role: chatMessages.role });

  // 2) Busca el ID del mensaje del assistant
  // 2) Busca el ID del mensaje del assistant
  const assistantIdx = items.findIndex((x) => x.role === "assistant");
  if (assistantIdx === -1) return;

  const assistantRow = inserted[assistantIdx];
  if (!assistantRow?.id) return;

  // 3) Extrae las fuentes ricas (si están) — preferimos 'retrievalRecords'
  const meta = (items[assistantIdx].meta ?? {}) as {
    retrievalRecords?: RetrievalRecord[];
    retrieval?:
      | RetrievalRecord[]
      | { topK?: number; ids?: Array<string | number> };
  };

  let detailed: RetrievalRecord[] = [];
  if (Array.isArray(meta.retrievalRecords)) {
    detailed = meta.retrievalRecords;
  } else if (Array.isArray(meta.retrieval)) {
    detailed = meta.retrieval as RetrievalRecord[];
  }

  // 4) Inserta en message_sources si está habilitado y hay datos
  if (!MEMORY_AUDIT_MESSAGE_SOURCES) {
    if (VERBOSE) console.log("[memory] message_sources DISABLED by env");
  } else if (detailed.length) {
    const seen = new Set<string>();
    const rows = detailed
      .filter((r) => r.url && !seen.has(r.url) && seen.add(r.url))
      .map((r) => ({
        message_id: assistantRow.id,
        url: r.url,
        rank: r.rank ?? 0,
        score: r.score ?? null,
        raw_chunk: r.raw_chunk ?? null,
      }));

    if (rows.length) {
      await db.insert(messageSources).values(rows);
      if (VERBOSE)
        console.log(`[memory] inserted ${rows.length} message_sources`);
    }
  }
}

// -------------------------------------------------------------
// Memoria Larga: Neon (memory_summaries)
// -------------------------------------------------------------

/** Devuelve el resumen largo para un chatId (o null) */
export async function getLongSummary(chatId: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(memorySummaries)
    .where(eq(memorySummaries.chat_id, chatId));
  return rows[0]?.summary_text ?? null;
}

/** Upsert simple de resumen largo por chatId */
export async function upsertLongSummary(chatId: string, summaryText: string) {
  const rows = await db
    .select()
    .from(memorySummaries)
    .where(eq(memorySummaries.chat_id, chatId));

  if (rows.length === 0) {
    await db.insert(memorySummaries).values({
      chat_id: chatId,
      summary_text: summaryText,
    });
  } else {
    await db
      .update(memorySummaries)
      .set({ summary_text: summaryText, updated_at: new Date() })
      .where(eq(memorySummaries.chat_id, chatId));
  }
}

/** Interfaz de persistencia del destilado (utiliza upsert) */
export async function persistDistilledSummary(
  chatId: string,
  distilledText: string
) {
  await upsertLongSummary(chatId, distilledText);
}

// -------------------------------------------------------------
// Gestión de Sesiones (opcional): chat_sessions en Neon
// -------------------------------------------------------------

/**
 * Crea/asegura la sesión de chat y actualiza last_activity_at.
 * Si llega meta, lo mergea con el existente: meta = meta || <nuevo>
 */
export async function ensureChatSession(
  chatId: string,
  userId?: string | null,
  meta?: Record<string, any>
) {
  // Inserta si no existe
  await db
    .insert(chatSessions)
    .values({
      chat_id: chatId,
      user_id: userId ?? null,
      meta: meta ?? null,
    })
    .onConflictDoUpdate({
      target: chatSessions.chat_id,
      set: {
        user_id: userId ?? null,
        last_activity_at: new Date(),
        // Merge JSONB: <existente> || <nuevo>
        ...(meta
          ? {
              meta: sql`${chatSessions.meta} || ${JSON.stringify(meta)}::jsonb`,
            }
          : {}),
      },
    });
}

/** Marca actividad en la sesión de chat actualizando last_activity_at */
export async function touchChatSession(chatId: string) {
  await db
    .update(chatSessions)
    .set({ last_activity_at: new Date() })
    .where(eq(chatSessions.chat_id, chatId));
}


// -------------------------------------------------------------
// Perfil de usuario en chat_sessions.meta.profile (JSONB)
// -------------------------------------------------------------

export type UserProfile = {
  company_size?: string;  // texto libre
  sector?: string;        // texto libre
  objective?: string;     // texto libre
};

/**
 * Mergea (upsert) el patch dentro de chat_sessions.meta.profile
 * - Crea la fila si no existe
 * - No pisa claves existentes: hace profile := profile || patch
 */
export async function saveProfilePatch(
  chatId: string,
  patch: Partial<UserProfile>,
  userId?: string | null
) {
  if (!patch || Object.keys(patch).length === 0) return;

  await db
    .insert(chatSessions)
    .values({
      chat_id: chatId,
      user_id: userId ?? null,
      // si se crea por primera vez, guarda directamente { profile: patch }
      meta: { profile: patch } as any,
    })
    .onConflictDoUpdate({
      target: chatSessions.chat_id,
      set: {
        user_id: userId ?? null,
        last_activity_at: new Date(),
        // meta = jsonb_set( coalesce(meta,'{}'), '{profile}', coalesce(meta->'profile','{}') || patch, true )
        meta: sql`jsonb_set(
          coalesce(${chatSessions.meta}, '{}'::jsonb),
          '{profile}',
          coalesce(${chatSessions.meta}->'profile','{}'::jsonb) || ${JSON.stringify(patch)}::jsonb,
          true
        )`,
      },
    });
}

/** Devuelve el profile guardado o null si no existe */
export async function getProfile(chatId: string): Promise<UserProfile | null> {
  const rows = await db
    .select({ meta: chatSessions.meta })
    .from(chatSessions)
    .where(eq(chatSessions.chat_id, chatId))
    .limit(1);

  const meta = rows[0]?.meta as Record<string, any> | undefined;
  const profile = meta?.profile;
  return profile ? (profile as UserProfile) : null;
}

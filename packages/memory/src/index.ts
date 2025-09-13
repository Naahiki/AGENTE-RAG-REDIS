import * as dotenv from "dotenv";
dotenv.config();

import { eq } from "drizzle-orm";
import { getRedis } from "./redisClient";
import {
  MEMORY_MAX_TURNS,
  MEMORY_TTL_SECONDS,
  MEMORY_RECENT_LIMIT,
  kMsgs,
  kSummaryShort,
} from "./constants";
import { TurnItem, Message } from "./types";
import { db, chatMessages, memorySummaries } from "./neonClient";

/**
 * APPEND TURN (Redis)
 * - Guarda un turno (user + assistant) en la lista de mensajes del chat en Redis
 * - Aplica TTL y poda por longitud
 */
export async function appendTurn(
  chatId: string,
  userMsg: string,
  assistantMsg: string,
  meta?: TurnItem["meta"]
) {
  const redis = await getRedis();
  const item: TurnItem = { ts: Date.now(), user: userMsg, assistant: assistantMsg, meta };
  const key = kMsgs(chatId);

  await redis.rPush(key, JSON.stringify(item));
  await redis.expire(key, MEMORY_TTL_SECONDS);

  // Poda si excede
  const len = await redis.lLen(key);
  if (len > MEMORY_MAX_TURNS) {
    const toTrimStart = len - MEMORY_MAX_TURNS;
    await redis.lTrim(key, toTrimStart, -1);
  }
}

/**
 * GET RECENT TURNS (Redis)
 * - Recupera últimos N turnos como objetos TurnItem
 */
export async function getRecentTurns(chatId: string, limit = MEMORY_RECENT_LIMIT): Promise<TurnItem[]> {
  const redis = await getRedis();
  const key = kMsgs(chatId);
  const len = await redis.lLen(key);
  if (len === 0) return [];
  const start = Math.max(0, len - limit);
  const raw = await redis.lRange(key, start, -1);
  return raw.map((s) => JSON.parse(s) as TurnItem);
}

/**
 * GET MEMORY AS MESSAGES (Redis)
 * - Devuelve historial reciente como array de {role, content} listo para LLM
 */
export async function getMemoryAsMessages(chatId: string, limit = MEMORY_RECENT_LIMIT): Promise<Message[]> {
  const turns = await getRecentTurns(chatId, limit);
  const messages: Message[] = [];
  for (const t of turns) {
    messages.push({ role: "user", content: t.user });
    messages.push({ role: "assistant", content: t.assistant });
  }
  return messages;
}

/**
 * SHORT SUMMARY (Redis)
 */
export async function getShortSummary(chatId: string): Promise<string | null> {
  const redis = await getRedis();
  return redis.get(kSummaryShort(chatId));
}

export async function setShortSummary(chatId: string, text: string) {
  const redis = await getRedis();
  await redis.set(kSummaryShort(chatId), text, { EX: MEMORY_TTL_SECONDS });
}

/**
 * CLEAR CHAT (Redis)
 */
export async function clearChat(chatId: string) {
  const redis = await getRedis();
  await redis.del(kMsgs(chatId));
  await redis.del(kSummaryShort(chatId));
}

/**
 * TOUCH (Redis) - renueva TTL si existe
 */
export async function touchChat(chatId: string) {
  const redis = await getRedis();
  const key = kMsgs(chatId);
  const exists = await redis.exists(key);
  if (exists) await redis.expire(key, MEMORY_TTL_SECONDS);
}

/**
 * AUDITORÍA (Neon) - guardar mensajes completos (opcional)
 */
export async function appendAuditToNeon(
  chatId: string,
  items: { role: "user" | "assistant"; content: string; meta?: any }[]
) {
  if (items.length === 0) return;
  await db.insert(chatMessages).values(
    items.map((it) => ({
      chat_id: chatId,
      role: it.role,
      content: it.content,
      meta: it.meta ? JSON.stringify(it.meta) : null,
    }))
  );
}

/**
 * LONG SUMMARY (Neon)
 */
export async function getLongSummary(chatId: string): Promise<string | null> {
  const rows = await db.select().from(memorySummaries).where(eq(memorySummaries.chat_id, chatId));
  return rows[0]?.summary_text ?? null;
}

// Upsert simple sin unique constraint: select + insert/update
export async function upsertLongSummary(chatId: string, summaryText: string) {
  const rows = await db.select().from(memorySummaries).where(eq(memorySummaries.chat_id, chatId));
  if (rows.length === 0) {
    await db.insert(memorySummaries).values({ chat_id: chatId, summary_text: summaryText });
  } else {
    await db
      .update(memorySummaries)
      .set({ summary_text: summaryText, updated_at: new Date() })
      .where(eq(memorySummaries.chat_id, chatId));
  }
}

/**
 * DESTILADO (interfaz)
 * - De momento solo persistimos un texto ya generado (el generador vendrá en LLM fase)
 */
export async function persistDistilledSummary(chatId: string, distilledText: string) {
  await upsertLongSummary(chatId, distilledText);
}

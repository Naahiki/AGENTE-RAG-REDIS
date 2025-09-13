export const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// Memoria corta (Redis)
export const MEMORY_TTL_SECONDS = parseInt(process.env.MEMORY_TTL_SECONDS || "172800", 10); // 48h
export const MEMORY_MAX_TURNS = parseInt(process.env.MEMORY_MAX_TURNS || "20", 10);
export const MEMORY_RECENT_LIMIT = parseInt(process.env.MEMORY_RECENT_LIMIT || "12", 10);

// Helpers claves
export const kMsgs = (chatId: string) => `chat:${chatId}:messages`;
export const kSummaryShort = (chatId: string) => `chat:${chatId}:summary_short`;
export const kSearch = (chatId: string) => `chat:${chatId}:search`; // opcional (episódica)

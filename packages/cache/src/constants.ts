export const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
export const CACHE_TTL_SECONDS = parseInt(process.env.CACHE_TTL_SECONDS || "14400", 10); // 4h
export const CACHE_SCOPE = process.env.CACHE_SCOPE || "default"; // multi-tenant opcional

export const kQ2A = (hash: string) => `cache:${CACHE_SCOPE}:q2a:${hash}`;

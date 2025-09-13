import * as dotenv from "dotenv";
dotenv.config();

import { createHash } from "crypto";
import { getRedis } from "./redisClient";
import { kQ2A, CACHE_TTL_SECONDS } from "./constants";
import { CachedAnswer } from "./types";

function normalize(q: string) {
  return q
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // quita acentos
    .replace(/[^\p{L}\p{N}\s]/gu, " ") // quita puntuación
    .replace(/\s+/g, " ")
    .trim();
}

function sha1(s: string) {
  return createHash("sha1").update(s).digest("hex");
}

export function questionHash(question: string) {
  return sha1(normalize(question));
}

export async function getCachedAnswer(question: string): Promise<CachedAnswer | null> {
  const redis = await getRedis();
  const key = kQ2A(questionHash(question));
  const raw = await redis.get(key);
  return raw ? (JSON.parse(raw) as CachedAnswer) : null;
}

export async function cacheAnswer(
  question: string,
  answer: string,
  opts?: { model?: string; sources?: string[]; ttlSeconds?: number }
) {
  const redis = await getRedis();
  const key = kQ2A(questionHash(question));
  const value: CachedAnswer = {
    answer,
    createdAt: Date.now(),
    model: opts?.model,
    sources: opts?.sources,
  };
  const ttl = opts?.ttlSeconds ?? CACHE_TTL_SECONDS;
  await redis.set(key, JSON.stringify(value), { EX: ttl });
}

// scripts/ingesta-neon-redis.ts
// Ingesta inicial desde Neon -> Redis con hash canónico (text_hash) y control de tokens

import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { createClient } from "redis";
import { OpenAI } from "openai";
import * as dotenv from "dotenv";
import { ayudas } from "../packages/sources/neon/schemas/ayudas";
import { eq } from "drizzle-orm";
import crypto from "crypto";

dotenv.config();

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);
const redis = createClient({ url: process.env.REDIS_URL! });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

const INDEX_NAME = process.env.RAG_INDEX_NAME || "ayuda_idx";
const EMB_MODEL = process.env.EMBEDDING_MODEL || "text-embedding-3-small";
const DIM = 1536; // text-embedding-3-small
const EMBED_MAX_TOKENS = Number(process.env.EMBED_MAX_TOKENS || 7800); // margen <8192

const sha256 = (s: string) =>
  crypto.createHash("sha256").update(s, "utf8").digest("hex");

const j = (s?: string) => (s ?? "").toString().trim();
const preview = (s?: string, n = 80) => j(s).replace(/\s+/g, " ").slice(0, n);

// ===== Helpers de presupuesto (heurístico 4 chars/token) =====
const approxTokens = (s: string) => Math.ceil(s.length / 4);
const sliceByTokens = (s: string, maxTokens: number) =>
  s.length > maxTokens * 4 ? s.slice(0, maxTokens * 4) : s;

/** Bloques en orden de prioridad para el embedding */
function buildBlocks(a: any): string[] {
  return [
    j(a.nombre) && `Nombre: ${j(a.nombre)}`,
    j(a.estado_tramite) && `Estado: ${j(a.estado_tramite)}`,
    j(a.url_oficial) && `URL oficial: ${j(a.url_oficial)}`,
    j(a.descripcion) && `Descripción:\n${j(a.descripcion)}`,
    j(a.dirigido_a) && `Dirigido a:\n${j(a.dirigido_a)}`,
    j(a.documentacion) && `Documentación a presentar:\n${j(a.documentacion)}`,
    j(a.normativa) && `Normativa:\n${j(a.normativa)}`,
    j(a.resultados) && `Resultados:\n${j(a.resultados)}`,
    j(a.otros) && `Otros:\n${j(a.otros)}`,
  ].filter(Boolean) as string[];
}

/** Ensambla respetando presupuesto; corta el bloque que exceda */
function assembleWithBudget(blocks: string[], maxTokens: number): { text: string; clipped: boolean } {
  const pieces: string[] = [];
  let used = 0;
  let clipped = false;

  for (const b of blocks) {
    const btoks = approxTokens(b) + 2; // margen por separadores
    if (used + btoks <= maxTokens) {
      pieces.push(b);
      used += btoks;
    } else {
      const remaining = Math.max(0, maxTokens - used - 2);
      if (remaining <= 0) { clipped = true; break; }
      pieces.push(sliceByTokens(b, remaining));
      clipped = true;
      break;
    }
  }

  return { text: pieces.join("\n\n"), clipped };
}

/** Texto final para embedding con tope de tokens */
function buildEmbeddingText(a: any, maxTokens = EMBED_MAX_TOKENS) {
  return assembleWithBudget(buildBlocks(a), maxTokens);
}

async function ensureIndex() {
  console.log(`\n[redis] preparando índice FT '${INDEX_NAME}' (ON JSON PREFIX 'ayuda:')`);
  try {
    await redis.sendCommand(["FT.DROPINDEX", INDEX_NAME, "DD"]);
    console.log(`[redis] índice previo '${INDEX_NAME}' eliminado (con datos JSON)`);
  } catch {
    console.log(`[redis] no existía índice previo '${INDEX_NAME}'`);
  }
  await redis.sendCommand([
    "FT.CREATE", INDEX_NAME,
    "ON", "JSON",
    "PREFIX", "1", "ayuda:",
    "SCHEMA",
    "$.titulo", "AS", "titulo", "TEXT",
    "$.descripcion", "AS", "descripcion", "TEXT",
    "$.dirigido_a", "AS", "dirigido_a", "TEXT",
    "$.estado_tramite", "AS", "estado_tramite", "TEXT",
    "$.tipo_tramite", "AS", "tipo_tramite", "TEXT",
    "$.tema_subtema", "AS", "tema_subtema", "TEXT",
    "$.normativa", "AS", "normativa", "TEXT",
    "$.documentacion", "AS", "documentacion", "TEXT",
    "$.resultados", "AS", "resultados", "TEXT",
    "$.otros", "AS", "otros", "TEXT",
    "$.servicio", "AS", "servicio", "TEXT",
    "$.url", "AS", "url", "TEXT",
    "$.metadata", "AS", "metadata", "TEXT",
    "$.embedding", "AS", "embedding", "VECTOR", "FLAT", "6",
    "TYPE", "FLOAT32",
    "DIM", String(DIM),
    "DISTANCE_METRIC", "COSINE",
  ]);
  console.log(`[redis] índice '${INDEX_NAME}' creado ✅`);
}

async function main() {
  if (!process.env.DATABASE_URL || !process.env.REDIS_URL || !process.env.OPENAI_API_KEY) {
    throw new Error("Faltan envs: DATABASE_URL / REDIS_URL / OPENAI_API_KEY");
  }

  console.log("====================================================");
  console.log("🚀 Ingesta inicial Neon → Redis");
  console.log("====================================================");
  console.log(`[cfg] index: ${INDEX_NAME}`);
  console.log(`[cfg] model: ${EMB_MODEL} (DIM=${DIM})`);
  console.log(`[cfg] embed budget: ${EMBED_MAX_TOKENS} tokens aprox.`);
  console.log(`[cfg] db:    ${process.env.DATABASE_URL?.slice(0, 24)}…`);
  console.log(`[cfg] redis: ${process.env.REDIS_URL?.slice(0, 24)}…`);
  console.log("----------------------------------------------------");

  await redis.connect();
  const ping = await redis.ping();
  console.log(`[redis] ping: ${ping}`);

  await ensureIndex();

  const existing = await redis.keys("ayuda:*");
  if (existing.length) {
    console.log(`[redis] ⚠️ hay ${existing.length} claves 'ayuda:*' existentes (se sobrescriben con JSON.SET)`);
  } else {
    console.log("[redis] no hay claves previas 'ayuda:*'");
  }

  console.log("\n[neon] leyendo ayudas…");
  const rows = await db.select().from(ayudas);
  console.log(`[neon] ayudas encontradas: ${rows.length}`);
  if (!rows.length) {
    console.log("[neon] nada que indexar. Saliendo.");
    await redis.quit();
    return;
  }

  let ok = 0, fail = 0;
  for (const a of rows) {
    const title = preview(a.nombre || `id=${a.id}`);
    try {
      console.log("\n----------------------------------------------");
      console.log(`[row] id=${a.id} | ${title}`);

      const { text: embText, clipped } = buildEmbeddingText(a, EMBED_MAX_TOKENS);
      const embLen = embText.length;
      console.log(`[row] embText length: ${embLen}${clipped ? " (clipped)" : ""}`);
      if (!embText.trim()) {
        console.log(`[row] ⚠️ texto vacío, se omite`);
        continue;
      }

      const hash = sha256(embText);
      console.log(`[row] text_hash (canónico): ${hash}`);

      const resp = await openai.embeddings.create({
        input: embText,
        model: EMB_MODEL,
      });
      const vec = resp.data[0]?.embedding as number[] | undefined;
      if (!vec?.length) throw new Error("no embedding devuelto");
      console.log(`[row] embedding dims: ${vec.length}${vec.length !== DIM ? ` (esperado ${DIM})` : ""}`);

      // Redis JSON doc
      const key = `ayuda:${a.id}`;
      const float32 = Array.from(new Float32Array(vec));
      const doc = {
        id: a.id,
        titulo: a.nombre ?? "",
        url: a.url_oficial ?? "",
        descripcion: a.descripcion ?? "",
        estado_tramite: a.estado_tramite ?? "",
        tipo_tramite: a.tipo_tramite ?? "",
        tema_subtema: a.tema_subtema ?? "",
        dirigido_a: a.dirigido_a ?? "",
        normativa: a.normativa ?? "",
        documentacion: a.documentacion ?? "",
        resultados: a.resultados ?? "",
        otros: a.otros ?? "",
        servicio: a.servicio ?? "",
        metadata: JSON.stringify({
          version: a.content_version ?? 0,
          page_last_updated_at: a.page_last_updated_at ?? null,
          text_hash: hash,
          clipped,
          budget_tokens: EMBED_MAX_TOKENS,
          text_len: embLen,
        }),
        // alias opcional por compatibilidad: "hash": hash,
        embedding: float32, // VECTOR para RediSearch
      };

      await redis.sendCommand(["JSON.SET", key, "$", JSON.stringify(doc)]);
      const exists = await redis.sendCommand(["JSON.GET", key, "$"]);
      console.log(`[row] redis JSON.SET ok → JSON.GET bytes: ${exists ? String(exists).length : 0}`);

      // Neon: actualiza text_hash y content_version SOLO si cambió
      const newVersion =
        a.text_hash === hash
          ? (a.content_version ?? 0)
          : (a.content_version ?? 0) + 1;

      await db.update(ayudas)
        .set({
          text_hash: hash,
          content_version: newVersion,
        })
        .where(eq(ayudas.id, a.id));

      console.log(`[row] neon actualizado → text_hash=${hash} | content_version=${newVersion}`);
      ok++;
    } catch (e: any) {
      fail++;
      console.error(`[row] ❌ error en id=${a.id} | ${title}:`, e?.message || e);
      continue;
    }
  }

  console.log("\n====================================================");
  console.log(`✅ procesadas OK: ${ok}`);
  console.log(`❌ con error:     ${fail}`);
  const total = await redis.dbSize();
  console.log(`[redis] claves totales: ${total}`);
  console.log("====================================================");

  await redis.quit();
  console.log("🎉 Ingesta completa");
}

main().catch(async (e) => {
  console.error("Fallo en ingesta:", e);
  try { await redis.quit(); } catch {}
});

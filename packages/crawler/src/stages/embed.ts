// packages/crawler/src/stages/embed.ts
import { CFG } from "../config";
import { getRedis } from "../redis";
import { db, schema } from "../db";
import { OpenAI } from "openai";
import { eq } from "drizzle-orm";

const openai = new OpenAI({ apiKey: CFG.OPENAI_API_KEY });
const DRY = CFG.CRAWLER_DRY_RUN;

// ===== Helpers de texto / presupuesto =====
const j = (s?: string) => (s ?? "").toString().trim();
const approxTokens = (s: string) => Math.ceil(s.length / 4); // heurística
const sliceByTokens = (s: string, maxTokens: number) => {
  const maxChars = Math.max(0, Math.floor(maxTokens * 4));
  return s.length > maxChars ? s.slice(0, maxChars) : s;
};

/** Construye bloques en orden de prioridad (los primeros pesan más en el embedding) */
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
    j(a.page_last_updated_text) && `Última actualización (página): ${j(a.page_last_updated_text)}`,
  ].filter(Boolean) as string[];
}

/**
 * Ensambla texto respetando un presupuesto aproximado de tokens.
 * Intenta añadir bloque a bloque; si el siguiente bloque excede, lo corta.
 */
function assembleWithBudget(blocks: string[], maxTokens: number): { text: string; clipped: boolean } {
  const pieces: string[] = [];
  let used = 0;
  let clipped = false;

  for (const b of blocks) {
    const btoks = approxTokens(b) + 2; // margen por \n\n
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

  const text = pieces.join("\n\n");
  return { text, clipped };
}

/** Genera texto con presupuesto y fallback por si el modelo aún se queja */
function buildEmbeddingTextWithBudget(a: any, initialBudget = 7800) {
  const blocks = buildBlocks(a);
  return assembleWithBudget(blocks, initialBudget);
}

export async function embedOne(ayuda: any) {
  if (!ayuda?.text_hash) return { ok: false, error: "no_text_hash" };

  // Idempotencia
  if (ayuda.last_embedded_text_hash && ayuda.last_embedded_text_hash === ayuda.text_hash) {
    return { ok: true, skippedBecauseSameHash: true };
  }

  if (DRY) return { ok: true, dryRun: true };

  // Presupuesto seguro (<8192) con margen
  let budget = Number(process.env.EMBED_MAX_TOKENS || 7800);
  let lastErr: any = null;
  let vec: number[] | undefined;
  let textBuilt = "";
  let clipped = false;

  // Hasta 3 reintentos bajando el presupuesto si hiciera falta
  for (let attempt = 0; attempt < 3; attempt++) {
    const { text, clipped: c } = buildEmbeddingTextWithBudget(ayuda, budget);
    textBuilt = text;
    clipped = c;

    try {
      if (!textBuilt.trim()) return { ok: false, error: "empty_text" };

      const resp = await openai.embeddings.create({
        input: textBuilt,
        model: CFG.EMBEDDING_MODEL,
      });

      vec = resp.data?.[0]?.embedding as number[] | undefined;
      if (!vec?.length) return { ok: false, error: "no_embedding" };
      // éxito
      lastErr = null;
      break;
    } catch (e: any) {
      const msg = e?.message || String(e);
      lastErr = e;
      // Si es error por contexto, reducimos presupuesto y reintentamos
      if (/maximum context length|token/i.test(msg)) {
        budget = Math.floor(budget * 0.7); // reduce 30%
        continue;
      }
      // Otro error: salimos
      break;
    }
  }

  if (!vec) {
    return { ok: false, error: lastErr?.message || "embed_failed" };
  }

  // Upsert en Redis (JSON doc único por ayuda)
  const redis = await getRedis();
  const key = `${CFG.EMBEDDER_REDIS_PREFIX}:${ayuda.id}`;
  const float32 = Array.from(new Float32Array(vec));

  const doc = {
    id: ayuda.id,
    titulo: ayuda.nombre ?? "",
    url: ayuda.url_oficial ?? "",
    descripcion: ayuda.descripcion ?? "",
    estado_tramite: ayuda.estado_tramite ?? "",
    tipo_tramite: ayuda.tipo_tramite ?? "",
    tema_subtema: ayuda.tema_subtema ?? "",
    dirigido_a: ayuda.dirigido_a ?? "",
    normativa: ayuda.normativa ?? "",
    documentacion: ayuda.documentacion ?? "",
    resultados: ayuda.resultados ?? "",
    otros: ayuda.otros ?? "",
    servicio: ayuda.servicio ?? "",
    metadata: JSON.stringify({
      version: ayuda.content_version ?? 0,
      page_last_updated_at: ayuda.page_last_updated_at ?? null,
      text_hash: ayuda.text_hash,
      clipped,             // <- indicamos si hubo recorte
      budget_tokens: budget,
      text_len: textBuilt.length,
    }),
    hash: ayuda.text_hash, // alias
    embedding: float32,
  };

  await redis.sendCommand(["JSON.SET", key, "$", JSON.stringify(doc)]);

  await db.update(schema.ayudas).set({
    last_embedded_at: new Date(),
    last_embed_ok: true,
    last_error: null,
    last_embedded_text_hash: ayuda.text_hash,
  }).where(eq(schema.ayudas.id, ayuda.id));

  return { ok: true, dims: vec.length, clipped, budget };
}

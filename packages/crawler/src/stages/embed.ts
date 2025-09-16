// packages/crawler/src/stages/embed.ts
import { CFG } from "../config";
import { getRedis } from "../redis";
import { db, schema } from "../db";
import { OpenAI } from "openai";
import { eq } from "drizzle-orm";

/**
 * Cliente OpenAI (usa la API key desde config/env)
 */
const openai = new OpenAI({ apiKey: CFG.OPENAI_API_KEY });

/**
 * Ensambla el texto a embeber para una ayuda
 * (misma lógica que tu indexación inicial para mantener compatibilidad semántica).
 */
function buildEmbeddingText(a: any) {
  return [
    `Nombre: ${a.nombre ?? ""}`,
    `Descripción: ${a.descripcion ?? ""}`,
    `Estado del trámite: ${a.estado_tramite ?? ""}`,
    `Tipo de trámite: ${a.tipo_tramite ?? ""}`,
    `Tema y subtema: ${a.tema_subtema ?? ""}`,
    `Dirigido a: ${a.dirigido_a ?? ""}`,
    `Normativa: ${a.normativa ?? ""}`,
    `Documentación: ${a.documentacion ?? ""}`,
    `Resultados: ${a.resultados ?? ""}`,
    `Otros: ${a.otros ?? ""}`,
    `Servicio: ${a.servicio ?? ""}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Genera embedding y escribe en Redis:
 * - Histórico (ayuda:{id}:v{content_version}) si EMBEDDER_KEEP_HISTORY=1
 * - Puntero actual (ayuda:{id}) si EMBEDDER_WRITE_CURRENT_POINTER=1
 * Además, persiste auditoría embed_audit (si EMBED_AUDIT_ENABLED=1)
 * y marca la ayuda como embebida en Neon.
 */
export async function embedOne(ayuda: any) {
  try {
    if (!CFG.EMBEDDER_ENABLED) {
      await audit(ayuda.id, {
        ok: false,
        error: "disabled",
        wroteHistory: false,
        wrotePointer: false,
      });
      return { ok: false, error: "disabled" };
    }

    const text = buildEmbeddingText(ayuda);
    if (!text.trim()) {
      await audit(ayuda.id, {
        ok: false,
        error: "empty_text",
        wroteHistory: false,
        wrotePointer: false,
      });
      return { ok: false, error: "empty_text" };
    }

    // Solicita embedding
    const resp = await openai.embeddings.create({
      model: CFG.EMBEDDING_MODEL,
      input: text,
    });

    const vec = resp.data[0]?.embedding as number[] | undefined;
    if (!vec || !vec.length) {
      await audit(ayuda.id, {
        ok: false,
        error: "no_embedding",
        wroteHistory: false,
        wrotePointer: false,
      });
      return { ok: false, error: "no_embedding" };
    }

    // Asegura array float32 (para RediSearch VECTOR/JSON)
    const embedding = Array.from(new Float32Array(vec));
    const redis = await getRedis();

    const prefix = CFG.EMBEDDER_REDIS_PREFIX;
    const version = ayuda.content_version ?? 0;
    const keyCurrent = `${prefix}:${ayuda.id}`;
    const keyHist = `${prefix}:${ayuda.id}:v${version}`;

    // Guarda histórico (opcional)
    let wroteHistory = false;
    if (CFG.EMBEDDER_KEEP_HISTORY) {
      await redis.json.set(keyHist, "$", {
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
          tema: ayuda.tema_subtema ?? "",
          servicio: ayuda.servicio ?? "",
        }),
        embedding,
      });
      wroteHistory = true;
    }

    // Actualiza puntero actual (opcional)
    let wrotePointer = false;
    if (CFG.EMBEDDER_WRITE_CURRENT_POINTER) {
      await redis.json.set(keyCurrent, "$", {
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
          tema: ayuda.tema_subtema ?? "",
          servicio: ayuda.servicio ?? "",
        }),
        embedding,
      });
      wrotePointer = true;
    }

    // Marca en Neon el éxito del embed
    await db
      .update(schema.ayudas)
      .set({
        last_embedded_at: new Date(),
        last_embed_ok: true,
        last_error: null,
      })
      .where(eq(schema.ayudas.id, ayuda.id));

    // Auditoría
    await audit(ayuda.id, {
      ok: true,
      dim: embedding.length, // 👈 'dim' (no 'dims')
      wroteHistory,
      wrotePointer,
      storeKey: wrotePointer ? keyCurrent : null,
      storeVersion: version,
      storePrefix: prefix,
    });

    return {
      ok: true,
      dim: embedding.length,
      wroteHistory,
      wrotePointer,
    };
  } catch (e: any) {
    // Marca fallo en Neon
    await db
      .update(schema.ayudas)
      .set({
        last_embedded_at: new Date(),
        last_embed_ok: false,
        last_error: e?.message || String(e),
      })
      .where(eq(schema.ayudas.id, ayuda.id));

    // Auditoría de error
    await audit(ayuda.id, {
      ok: false,
      error: e?.message || String(e),
      wroteHistory: false,
      wrotePointer: false,
    });

    return { ok: false, error: e?.message || String(e) };
  }
}

/**
 * Inserta registro en embed_audit si EMBED_AUDIT_ENABLED=1
 * - Usa 'dim' (no 'dims') para encajar con el esquema.
 * - 'meta' es JSONB (objeto), no string.
 */
async function audit(
  ayuda_id: number,
  data: {
    ok: boolean;
    dim?: number;
    error?: string | null;
    wroteHistory?: boolean;
    wrotePointer?: boolean;
    storeKey?: string | null;
    storeVersion?: number | null;
    storePrefix?: string | null;
  }
) {
  if (!CFG.EMBED_AUDIT_ENABLED) return;

  await db.insert(schema.embedAudit).values({
    ayuda_id,
    ts: new Date(),
    dim: data.dim ?? null, // ✅ coincide con el esquema
    error: data.error ?? null,
    store_key: data.storeKey ?? null,
    meta: {
      ok: data.ok,
      wrote_history: data.wroteHistory ?? false,
      wrote_pointer: data.wrotePointer ?? false,
    },
  });
}

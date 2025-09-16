// packages/crawler/src/stages/scrape.ts
import { load } from "cheerio";
import { sha256 } from "../utils/hash";
import { db, schema } from "../db";
import { CFG } from "../config";
import type { ScrapeResult } from "../types";
import { eq } from "drizzle-orm";

// --- helpers dry-run e IO seguros ---
function isDryRun() {
  return process.env.CRAWLER_DRY_RUN === "1";
}

async function safeUpdateAyuda(id: number, patch: Record<string, any>) {
  if (isDryRun()) return;
  if (!(typeof id === "number" && Number.isFinite(id) && id > 0)) return;
  await db.update(schema.ayudas).set(patch).where(eq(schema.ayudas.id, id));
}

async function safeAudit(
  ayuda_id: number,
  url: string,
  data: {
    ok: boolean;
    textLen: number | null;
    textHash: string | null;
    extractor: string;
    meta?: Record<string, any> | null;
    error?: string | null;
  }
) {
  if (!CFG.SCRAPE_AUDIT_ENABLED || isDryRun()) return;
  if (!(typeof ayuda_id === "number" && Number.isFinite(ayuda_id) && ayuda_id > 0)) return;
  await db.insert(schema.scrapeAudit).values({
    ayuda_id,
    url,
    ts: new Date(),
    extractor: data.extractor,
    text_hash: data.textHash,
    text_len: data.textLen ?? null,
    lang: null,
    meta: data.meta ?? null,
    error: data.error ?? null,
  });
}

/**
 * Extractor específico para páginas de navarra.es (selectores conocidos).
 * Si necesitas más reglas/dominos, crea nuevos extractores o dispatch por host.
 */
export function extractFieldsFromNavarra(html: string) {
  const $ = load(html);

  const getTxt = (sel: string) => ($(sel).first().text() || "").trim();

  const dirigido_a = getTxt("#infoDirigido > div:nth-child(1)");
  const descripcion = getTxt("#infoDescripcion > div:nth-child(1)");
  const documentacion = getTxt("#infoDocu > div:nth-child(1)");
  const normativa = getTxt("#infoNormativa > div:nth-child(1)");

  return { dirigido_a, descripcion, documentacion, normativa };
}

function normalizeText(s: string) {
  return s
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Scrapea una ayuda concreta a partir del HTML:
 * - Calcula text_hash del texto útil (estable).
 * - Si cambió, actualiza contenido y sube content_version.
 * - Audita si SCRAPE_AUDIT_ENABLED=1.
 */
export async function scrapeOne(ayuda: any, html: string): Promise<ScrapeResult> {
  try {
    // 1) Extrae campos con el extractor de navarra
    const fields = extractFieldsFromNavarra(html);

    // 2) Concatena texto útil (normalizado) y calcula longitud
    const concat = normalizeText(
      [
        fields.descripcion,
        fields.documentacion,
        fields.normativa,
        fields.dirigido_a,
      ]
        .filter(Boolean)
        .join("\n\n")
    );

    const textLen = concat.length;

    // 3) Umbral de sanidad
    if (textLen < CFG.SCRAPER_MIN_TEXT_LEN) {
      await safeAudit(ayuda.id, ayuda.url_oficial, {
        ok: false,
        textLen,
        textHash: null,
        extractor: "rules(navarra.es)",
        meta: { reason: "too_short" },
      });
      return {
        ok: false,
        changed: false,
        textLen,
        textHash: null,
        fields,
        meta: { reason: "too_short" },
      };
    }

    // 4) Hash del texto útil y decisión de cambio
    const textHash = sha256(concat);
    const changed = !ayuda.text_hash || ayuda.text_hash !== textHash;

    // 5) Persistencia en ayudas
    if (changed) {
      await safeUpdateAyuda(ayuda.id, {
        dirigido_a: fields.dirigido_a || ayuda.dirigido_a,
        descripcion: fields.descripcion || ayuda.descripcion,
        documentacion: fields.documentacion || ayuda.documentacion,
        normativa: fields.normativa || ayuda.normativa,
        text_hash: textHash,
        content_version: (ayuda.content_version ?? 0) + 1,
        last_scraped_at: new Date(),
        last_scrape_ok: true,
        last_error: null,
        updated_at: new Date(),
      });
    } else {
      await safeUpdateAyuda(ayuda.id, {
        last_scraped_at: new Date(),
        last_scrape_ok: true,
        last_error: null,
      });
    }

    // 6) Auditoría
    await safeAudit(ayuda.id, ayuda.url_oficial, {
      ok: true,
      textLen,
      textHash,
      extractor: "rules(navarra.es)",
      meta: { changed },
    });

    // 7) Resultado
    return { ok: true, changed, textLen, textHash, fields, meta: { changed } };
  } catch (e: any) {
    // 8) Marca error + auditoría
    await safeUpdateAyuda(ayuda.id, {
      last_scraped_at: new Date(),
      last_scrape_ok: false,
      last_error: e?.message || String(e),
    });

    await safeAudit(ayuda.id, ayuda.url_oficial, {
      ok: false,
      textLen: 0,
      textHash: null,
      extractor: "rules(navarra.es)",
      meta: null,
      error: e?.message || String(e),
    });

    return { ok: false, changed: false, error: e?.message || String(e) };
  }
}

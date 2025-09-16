// packages/crawler/src/stages/crawl.ts
import { db, schema } from "../db";
import { CFG } from "../config";
import { normalizeHtml } from "../utils/html";
import { sha256 } from "../utils/hash";
import { allowedByRobots } from "../utils/robots";
import { extractLastUpdateOrAjax  } from "../utils/lastUpdate"; // 👈 NUEVO
import type { CrawlResult } from "../types";
import { eq } from "drizzle-orm";

const DRY_RUN = process.env.CRAWLER_DRY_RUN === "1";

async function safeUpsertAyuda(id: number, patch: Record<string, any>) {
  if (DRY_RUN) return;
  await db.update(schema.ayudas).set(patch).where(eq(schema.ayudas.id, id));
}

async function safeAudit(
  outcome: "UNCHANGED" | "SOFT_CHANGED" | "CHANGED" | "GONE" | "BLOCKED" | "ERROR",
  ayuda_id: number,
  url: string,
  extra: Record<string, any> = {}
) {
  if (!CFG.CRAWL_AUDIT_ENABLED || DRY_RUN) return;
  await db.insert(schema.crawlAudit).values({
    ayuda_id,
    url,
    ts: new Date(),
    http_status: extra.http_status ?? null,
    duration_ms: extra.duration_ms ?? null,
    etag: extra.etag ?? null,
    http_last_modified: extra.http_last_modified ?? null,   // 👈 renombrado en audit
    raw_hash: extra.raw_hash ?? null,
    diff_score: extra.diff_score ?? null,
    outcome,
    content_bytes: extra.content_bytes ?? null,
    notes: extra.notes ?? null,
    error: extra.error ?? null,
    // 👇 señales de la página (si añadiste estas columnas en audit)
    page_last_updated_at: extra.page_last_updated_at ?? null,
    page_last_updated_text: extra.page_last_updated_text ?? null,
  });
}

export async function crawlOne(ayuda: any): Promise<CrawlResult> {
  const url = ayuda?.url_oficial?.trim();
  if (!url) return { outcome: "ERROR", error: "sin url_oficial" };

  // robots.txt si aplica
  if (CFG.CRAWLER_OBEY_ROBOTS) {
    const ok = await allowedByRobots(url, CFG.CRAWLER_USER_AGENT);
    if (!ok) {
      await safeAudit("BLOCKED", ayuda.id, url, { notes: { robots: "disallow" } });
      return { outcome: "BLOCKED" };
    }
  }

  let status = 0;
  let etag: string | null = null;
  let httpLastModified: string | null = null; // 👈 HTTP header
  let contentBytes: number | null = null;

  const headers: Record<string, string> = { "User-Agent": CFG.CRAWLER_USER_AGENT };
  if (ayuda.etag) headers["If-None-Match"] = ayuda.etag;
  if (ayuda.http_last_modified) headers["If-Modified-Since"] = ayuda.http_last_modified; // 👈 usa SOLO la HTTP

  const started = Date.now();
  let error: string | null = null;

  for (let attempt = 0; attempt <= CFG.CRAWLER_RETRY; attempt++) {
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), CFG.CRAWLER_TIMEOUT_MS);

      const res = await fetch(url, { headers, redirect: "follow", signal: ctrl.signal });
      clearTimeout(to);

      status = res.status;
      etag = res.headers.get("etag");
      httpLastModified = res.headers.get("last-modified");

      // 304 Not Modified (por HTTP)
      if (status === 304) {
        await safeUpsertAyuda(ayuda.id, {
          etag,
          http_last_modified: httpLastModified,
          last_crawled_at: new Date(),
          last_crawl_outcome: "UNCHANGED",
          last_error: null,
        });
        await safeAudit("UNCHANGED", ayuda.id, url, {
          http_status: status,
          etag,
          http_last_modified: httpLastModified,
          duration_ms: Date.now() - started,
        });
        return { outcome: "UNCHANGED", status, etag, httpLastModified };
      }

      // 2xx — descargamos y decidimos por "última actualización" (página) o hash estable
      if (status >= 200 && status < 300) {
        const html = await res.text();
        contentBytes = html.length;

        // A) Señal de la página: <span> Última actualización: ...
// dentro del 2xx, tras leer html:
        const { text: pageText, iso: pageISO, source: pageUpdateSource } = await extractLastUpdateOrAjax(html, url);
        // B) Hash (si aún no tienes el “estable”, mantenemos normalize+sha)
        const base = CFG.SCRAPER_NORMALIZE_HTML ? normalizeHtml(html) : html;
        const rawHash = sha256(base);

        // C) Decisión: prioriza la fecha de la página
        let outcome: "UNCHANGED" | "CHANGED";
        if (pageISO && ayuda.page_last_updated_at) {
          const prev = new Date(ayuda.page_last_updated_at).getTime();
          const curr = new Date(pageISO).getTime();
          outcome = curr > prev ? "CHANGED" : "UNCHANGED";
        } else if (pageISO && !ayuda.page_last_updated_at) {
          // primera vez que la vemos → evita falsos positivos con respaldo por hash
          outcome = ayuda.raw_hash && ayuda.raw_hash === rawHash ? "UNCHANGED" : "CHANGED";
        } else {
          // no hay etiqueta en la página → respaldo por hash
          outcome = ayuda.raw_hash && ayuda.raw_hash === rawHash ? "UNCHANGED" : "CHANGED";
        }

        // D) Persistencia (no sobreescribas con null si no hay etiqueta)
        const patch: Record<string, any> = {
          etag,
          http_last_modified: httpLastModified,
          content_bytes: contentBytes,
          raw_hash: rawHash,
          last_crawled_at: new Date(),
          last_crawl_outcome: outcome,
          last_error: null,
        };
        if (pageISO) patch.page_last_updated_at = new Date(pageISO);
        if (pageText) patch.page_last_updated_text = pageText;

        await safeUpsertAyuda(ayuda.id, patch);

        // E) Auditoría
        await safeAudit(outcome, ayuda.id, url, {
          http_status: status,
          etag,
          http_last_modified: httpLastModified,
          raw_hash: rawHash,
          content_bytes: contentBytes,
          duration_ms: Date.now() - started,
          page_last_updated_at: pageISO ? new Date(pageISO) : null,
          page_last_updated_text: pageText ?? null,
          notes: { ...(pageUpdateSource ? { pageUpdateSource } : {}) },
        });

        // F) Devuelve HTML solo si cambió
        return {
          outcome,
          status,
          etag,
          httpLastModified,
          pageLastUpdatedAt: pageISO ?? null,
          pageLastUpdatedText: pageText ?? null,
          //pageUpdateSource: "visible" | "jsonld/meta" | "ajax" | "none",
          rawHash,
          contentBytes,
          html: outcome === "CHANGED" ? html : null,
        };
      }

      // 404/410 — GONE
      if (status === 404 || status === 410) {
        await safeUpsertAyuda(ayuda.id, {
          last_crawled_at: new Date(),
          last_crawl_outcome: "GONE",
          last_error: null,
        });
        await safeAudit("GONE", ayuda.id, url, {
          http_status: status,
          duration_ms: Date.now() - started,
        });
        return { outcome: "GONE", status };
      }

      error = `HTTP ${status}`;
    } catch (e: any) {
      error = `fetch error: ${e?.message || e}`;
    }

    // Reintento con backoff
    if (attempt < CFG.CRAWLER_RETRY) {
      await new Promise((r) => setTimeout(r, CFG.CRAWLER_BACKOFF_MS));
    }
  }

  // Fallo definitivo
  await safeUpsertAyuda(ayuda.id, {
    last_crawled_at: new Date(),
    last_crawl_outcome: "ERROR",
    last_error: error,
  });
  await safeAudit("ERROR", ayuda.id, url, {
    http_status: status,
    error,
    duration_ms: Date.now() - started,
  });
  return { outcome: "ERROR", status, error };
}

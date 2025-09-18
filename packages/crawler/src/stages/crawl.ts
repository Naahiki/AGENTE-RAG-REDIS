// packages/crawler/src/stages/crawl.ts
import { db, schema } from "../db";
import { CFG } from "../config";
import { normalizeHtml } from "../utils/html";
import { sha256 } from "../utils/hash";
import { allowedByRobots } from "../utils/robots";
import { extractLastUpdateOrAjax } from "../utils/lastUpdate";
import type { CrawlResult } from "../types";
import { eq } from "drizzle-orm";

const DRY = process.env.CRAWLER_DRY_RUN === "1";

async function safeUpdate(id: number, patch: Record<string, any>) {
  if (DRY) return;
  await db.update(schema.ayudas).set(patch).where(eq(schema.ayudas.id, id));
}

async function audit(
  outcome: any,
  ayudaId: number,
  url: string,
  extra: Record<string, any> = {}
) {
  if (!CFG.CRAWL_AUDIT_ENABLED || DRY) return;

  // Asegura tipos correctos para columnas timestamp del audit
  const pageLastUpdatedAt = extra.page_last_updated_at
    ? new Date(extra.page_last_updated_at as any)
    : null;

  await db.insert(schema.crawlAudit).values({
    ayuda_id: ayudaId,
    url,
    ts: new Date(),
    outcome,
    http_status: (extra.status as any) ?? null,
    etag: (extra.etag as any) ?? null,
    http_last_modified: (extra.http_last_modified as any) ?? null,
    duration_ms: (extra.duration_ms as any) ?? null,
    content_bytes: (extra.content_bytes as any) ?? null,
    raw_hash: (extra.raw_hash as any) ?? null,
    diff_score: (extra.diff_score as any) ?? null,
    page_last_updated_at: pageLastUpdatedAt,
    page_last_updated_text: (extra.page_last_updated_text as any) ?? null,
    notes: (extra.notes as any) ?? null,
    error: (extra.error as any) ?? null,
  });
}

export async function crawlOne(ayuda: any): Promise<CrawlResult> {
  const url = ayuda?.url_oficial?.trim();
  if (!url) return { outcome: "ERROR", error: "sin url_oficial" };

  // Robots (no hacerlo fatal si robots falla)
  if (CFG.CRAWLER_OBEY_ROBOTS) {
    try {
      const ok = await allowedByRobots(url, CFG.CRAWLER_USER_AGENT);
      if (!ok) {
        await audit("BLOCKED", ayuda.id, url, {
          notes: { robots: "disallow" },
        });
        return { outcome: "BLOCKED" };
      }
    } catch (e: any) {
      await audit("ERROR", ayuda.id, url, {
        error: `robots_error:${e?.message || String(e)}`,
      });
      // seguimos adelante igualmente
    }
  }

  const started = Date.now();
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": CFG.CRAWLER_USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
      },
      redirect: "follow",
    });

    const status = res.status;
    const etag = res.headers.get("etag");
    const httpLastModified = res.headers.get("last-modified");

    if (status === 404 || status === 410) {
      await safeUpdate(ayuda.id, {
        last_crawled_at: new Date(),
        last_crawl_outcome: "GONE",
        last_error: null,
      });
      await audit("GONE", ayuda.id, url, {
        status,
        duration_ms: Date.now() - started,
      });
      return { outcome: "GONE", status };
    }

    if (status >= 200 && status < 300) {
      const html = await res.text();
      const contentBytes = html.length;

      const {
        text: pageText,
        iso: pageISO,
        source,
      } = await extractLastUpdateOrAjax(html, url);

      const norm = normalizeHtml(html);
      const rawHash = sha256(norm);

      // Valores anteriores (de Neon) para comparar
      const prevText: string | null = ayuda.page_last_updated_text ?? null;

      const prevISO: string | null = ayuda.page_last_updated_at
        ? new Date(ayuda.page_last_updated_at as any).toISOString()
        : null;

      // Decide outcome
      let outcome: CrawlResult["outcome"] = "UNCHANGED";
      if (pageText && pageText !== prevText) outcome = "CHANGED";
      else if (pageISO && prevISO && pageISO > prevISO) outcome = "CHANGED";
      else if (!prevText && pageText) outcome = "SOFT_CHANGED";

      // IMPORTANTE: siempre manda Date en page_last_updated_at
      const nextPageUpdatedAt: Date | null = pageISO
        ? new Date(pageISO)
        : ayuda.page_last_updated_at
        ? new Date(ayuda.page_last_updated_at as any)
        : null;

      await safeUpdate(ayuda.id, {
        last_crawled_at: new Date(),
        last_crawl_outcome: outcome,
        last_error: null,
        raw_hash: rawHash,
        etag: etag ?? null,
        http_last_modified: httpLastModified ?? null,
        content_bytes: contentBytes,
        page_last_updated_text: pageText ?? prevText ?? null,
        page_last_updated_at: nextPageUpdatedAt, // <-- Date o null
      });

      await audit(outcome, ayuda.id, url, {
        status,
        etag,
        http_last_modified: httpLastModified ?? null,
        duration_ms: Date.now() - started,
        content_bytes: contentBytes,
        raw_hash: rawHash,
        page_last_updated_text: pageText ?? null,
        page_last_updated_at: pageISO ? new Date(pageISO) : null,
        diff_score: null,
        notes: { pageUpdateSource: source },
        error: null,
      });

      return {
        outcome,
        status,
        etag,
        httpLastModified,
        pageText: pageText ?? null,
        pageISO: pageISO ?? null,
        pageUpdateSource: source ?? null,
        rawHash,
        contentBytes,
        html,
      };
    }

    await audit("ERROR", ayuda.id, url, {
      status,
      duration_ms: Date.now() - started,
      error: `status_${status}`,
    });
    return { outcome: "ERROR", status, error: `status_${status}` };
  } catch (e: any) {
    const msg = e?.message || String(e);
    await audit("ERROR", ayuda.id, url, {
      duration_ms: Date.now() - started,
      error: msg,
    });
    return { outcome: "ERROR", error: msg };
  }
}

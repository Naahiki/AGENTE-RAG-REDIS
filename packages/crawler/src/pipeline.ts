// packages/crawler/src/pipeline.ts
import { db, schema } from "./db";
import { CFG } from "./config";
import { mapPool } from "./utils/pool";
import { crawlOne } from "./stages/crawl";
import { scrapeOne } from "./stages/scrape";
import { embedOne } from "./stages/embed";
import { asc, and, isNull, isNotNull, or, lt, eq } from "drizzle-orm";

/**
 * Selecciona candidatas a procesar según la estrategia:
 * - full: todas las que tengan url_oficial
 * - incremental: prioriza nunca-crawleadas o las más antiguas (last_crawled_at)
 */
export async function selectCandidates() {
  if (CFG.REINDEX_STRATEGY === "full") {
    const rows = await db
      .select()
      .from(schema.ayudas)
      .where(isNotNull(schema.ayudas.url_oficial))
      .orderBy(asc(schema.ayudas.last_crawled_at));
    return rows;
  }

  // incremental
  const rows = await db
    .select()
    .from(schema.ayudas)
    .where(isNotNull(schema.ayudas.url_oficial))
    .orderBy(asc(schema.ayudas.last_crawled_at)); // NULL primero, luego más antiguas
  return rows;
}

export async function runOnce() {
  if (!CFG.CRAWLER_ENABLED) {
    console.log("[crawler] disabled by env");
    return;
  }

  const items = await selectCandidates();
  if (!items.length) {
    console.log("[crawler] no candidates");
    return;
  }

  console.log(`[crawler] candidates: ${items.length}`);

  // 1) Crawl en pool (descarga y detección de cambios)
  const crawlResults = await mapPool(items, CFG.CRAWLER_MAX_CONCURRENCY, async (ayuda) => {
    const r = await crawlOne(ayuda);
    return { ayuda, crawl: r };
  });

  // 2) Scrape SOLO donde haya cambio y tengamos HTML fresco
  const toScrape = crawlResults.filter(
    (x) => x.crawl.outcome === "CHANGED" && x.crawl.html
  );

  if (CFG.SCRAPER_ENABLED && toScrape.length) {
    console.log(`[scraper] tasks: ${toScrape.length}`);

    await mapPool(toScrape, CFG.SCRAPER_MAX_CONCURRENCY, async (x) => {
      // Relee la ayuda por si el crawl ha actualizado columnas (etag, raw_hash, etc.)
      const freshRows = await db
        .select()
        .from(schema.ayudas)
        .where(eq(schema.ayudas.id, x.ayuda.id))
        .limit(1);

      const fresh = freshRows[0] ?? x.ayuda;
      await scrapeOne(fresh, x.crawl.html!);
    });
  }

  // 3) Embed donde haya text_hash nuevo (last_embedded_at < last_scraped_at) o nunca embebidas
  if (CFG.EMBEDDER_ENABLED) {
    const toEmbed = await db
      .select()
      .from(schema.ayudas)
      .where(
        and(
          isNotNull(schema.ayudas.text_hash),
          or(
            isNull(schema.ayudas.last_embedded_at),
            lt(schema.ayudas.last_embedded_at, schema.ayudas.last_scraped_at)
          )
        )
      )
      .orderBy(asc(schema.ayudas.last_embedded_at));

    if (toEmbed.length) {
      console.log(`[embedder] tasks: ${toEmbed.length}`);
      await mapPool(toEmbed, CFG.EMBEDDER_MAX_CONCURRENCY, async (a) => {
        await embedOne(a);
      });
    }
  }

  console.log("[pipeline] done");
}

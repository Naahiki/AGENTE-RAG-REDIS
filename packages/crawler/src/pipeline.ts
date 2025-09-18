// packages/crawler/src/pipeline.ts
import { db, schema } from "./db";
import { CFG } from "./config";
import { mapPool } from "./utils/pool";
import { crawlOne } from "./stages/crawl";
import { scrapeOne } from "./stages/scrape";
import { embedOne } from "./stages/embed";
import { or, isNull, lt } from "drizzle-orm";

/**
 * Orquestador:
 * 1) CRAWL (si nunca o está "viejo")
 * 2) Compara "Última actualización" visible (texto/ISO). Fallback: outcome del crawler.
 * 3) SCRAPE sólo si cambió (o primera vez)
 * 4) EMBED sólo si el texto cambió (scrape.changed === true)
 */

export type RunOpts = { onLog?: (line: string, level?: "info" | "error") => void };

const MAX_AGE_MINUTES = Number(process.env.CRAWLER_MAX_AGE_MINUTES ?? "360"); // 6h por defecto
const CRAWL_CONC = CFG.CRAWLER_MAX_CONCURRENCY || 4;
const SCRAPE_CONC = CFG.SCRAPER_MAX_CONCURRENCY || 4;
const EMBED_CONC  = CFG.EMBEDDER_MAX_CONCURRENCY || 2;

export async function runOnce(opts: RunOpts = {}) {
  const log = (s: string, l: "info" | "error" = "info") => {
    (l === "error" ? console.error : console.log)(`[pipeline] ${s}`);
    opts.onLog?.(`[pipeline] ${s}`, l);
  };

  // 1) Seleccionar ayudas a CRAWLear (si nunca o > X min)
  const since = new Date(Date.now() - MAX_AGE_MINUTES * 60_000);

  const toCrawl = await db.query.ayudas.findMany({
    where: or(
      isNull(schema.ayudas.last_crawled_at),
      lt(schema.ayudas.last_crawled_at, since)
    ),
    columns: {
      id: true,
      nombre: true,
      url_oficial: true,

      // Para comparación por fecha visible
      page_last_updated_text: true,
      page_last_updated_at: true,

      // Para saber 1ª vez / embedding
      text_hash: true,
      content_version: true,
      last_scraped_at: true,
      last_embedded_at: true,
      last_embedded_text_hash: true,
    },
    limit: 500,
  });

  log(`crawl tasks: ${toCrawl.length}`);

  // 2) CRAWL
  const crawled: { ayuda: any; crawl: any }[] = [];
  await mapPool(toCrawl, CRAWL_CONC, async (ayuda) => {
    const crawl = await crawlOne(ayuda);
    crawled.push({ ayuda, crawl });
  });

  // 3) Decidir SCRAPE
  const toScrape: { ayuda: any; html: string }[] = [];

  for (const { ayuda, crawl } of crawled) {
    const html = crawl?.html as string | undefined;
    if (!html) {
      log(`SCRAPE skip id=${ayuda.id}: no HTML`);
      continue;
    }

    // Señales "visibles"
    const prevText = (ayuda.page_last_updated_text ?? null) as string | null;
    const prevISO = ayuda.page_last_updated_at
      ? new Date(ayuda.page_last_updated_at).toISOString()
      : null;

    const currText = (crawl.pageText ?? null) as string | null;
    const currISO = (crawl.pageISO ?? null) as string | null;

    const firstTime = !ayuda.text_hash;
    const changedByText = !!currText && currText !== prevText;
    const changedByISO = !!currISO && (!prevISO || currISO > prevISO);

    // Fallback: si la página no expone "Última actualización",
    // permitimos el outcome del crawler como heurística.
    const changedByOutcome =
      (!currText && !currISO) &&
      (crawl.outcome === "CHANGED" || crawl.outcome === "SOFT_CHANGED");

    if (firstTime || changedByText || changedByISO || changedByOutcome) {
      const reason = firstTime
        ? "firstTime"
        : changedByText
        ? "pageText"
        : changedByISO
        ? "pageISO"
        : "outcome";
      log(`SCRAPE gate OK id=${ayuda.id} (${reason})`);
      toScrape.push({ ayuda, html });
    } else {
      log(`SCRAPE skip id=${ayuda.id}: unchanged`);
    }
  }

  log(`scrape tasks: ${toScrape.length}`);

  // 4) SCRAPE (sólo las seleccionadas)
  const scraped: { ayuda: any; scrape: any }[] = [];
  await mapPool(toScrape, SCRAPE_CONC, async ({ ayuda, html }) => {
    const scrape = await scrapeOne(ayuda, html);
    scraped.push({ ayuda, scrape });
  });

  // 5) Decidir EMBED:
  // embed ONLY si el texto cambió (scrape.changed === true).
  // Pasamos al embedder el objeto combinado con fields + textHash + version siguiente
  const toEmbed: any[] = [];
  for (const { ayuda, scrape } of scraped) {
    if (!scrape?.ok) continue;
    if (!scrape?.changed) {
      log(`EMBED skip id=${ayuda.id}: text unchanged`);
      continue;
    }

    const nextVersion = (ayuda.content_version ?? 0) + 1;
    const ayudaForEmbed = {
      ...ayuda,
      ...(scrape.fields ?? {}),
      text_hash: scrape.textHash,      // nuevo hash canónico
      content_version: nextVersion,    // para metadata en Redis
    };

    log(`EMBED gate OK id=${ayuda.id} v${nextVersion}`);
    toEmbed.push(ayudaForEmbed);
  }

  log(`embed tasks: ${toEmbed.length}`);

  await mapPool(toEmbed, EMBED_CONC, async (ayudaForEmbed) => {
    await embedOne(ayudaForEmbed);
  });

  log("done");
}

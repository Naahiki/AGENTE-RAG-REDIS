// packages/crawler/src/api.ts
import "dotenv/config";

/**
 * Ejecuta el pipeline completo (lo que antes hacía tu CLI `crawler:once`)
 * y espera a que termine.
 */
export async function runOnce(): Promise<any> {
  const m = await import("./index.ts");
  if (typeof (m as any).runOnce !== "function") {
    throw new Error("packages/crawler/src/index.ts debe exportar runOnce()");
  }
  return await (m as any).runOnce();
}

/**
 * Lanza crawl/scrape (y opcional embed) para una sola URL.
 * Es la versión programática del script pipeline-dry-run.
 */
export async function crawlOneUrl(opts: {
  url: string;
  write?: boolean;
  embed?: boolean;
  log?: "info" | "debug";
}) {
  const { url, write = false, embed = false, log = "info" } = opts;

  // Ajusta flags igual que hacía tu script
  if (!write) {
    process.env.CRAWLER_DRY_RUN ??= "1";
    process.env.CRAWL_AUDIT_ENABLED ??= "0";
    process.env.SCRAPE_AUDIT_ENABLED ??= "0";
    process.env.EMBED_AUDIT_ENABLED ??= "0";
  }

  const { crawlOne } = await import("./stages/crawl");
  const { scrapeOne } = await import("./stages/scrape");
  const { embedOne } = await import("./stages/embed");

  const ayuda = { id: -1, url_oficial: url, nombre: "ADMIN RUN" } as any;

  if (log === "debug") console.log("[api] crawlOneUrl:", { url, write, embed, log });

  const crawlRes: any = await crawlOne(ayuda);
  let scrapeRes: any = null;

  const htmlOk = typeof crawlRes?.html === "string" && crawlRes.html.length > 0;
  if (htmlOk) {
    scrapeRes = await scrapeOne(ayuda, crawlRes.html);
  }

  if (embed && scrapeRes?.textHash) {
    await embedOne({ ...ayuda, textHash: scrapeRes.textHash } as any);
  }

  return {
    ok: true,
    crawl: {
      outcome: crawlRes?.outcome ?? null,
      status: crawlRes?.status ?? null,
      etag: crawlRes?.etag ?? null,
      lastModified: crawlRes?.lastModified ?? null,
      rawHash: crawlRes?.rawHash ?? null,
      fetchedAt: crawlRes?.fetchedAt ?? null,
      pageLastUpdatedText: crawlRes?.pageLastUpdatedText ?? null,
      pageLastUpdatedAt: crawlRes?.pageLastUpdatedAt ?? null,
      pageUpdateSource: crawlRes?.pageUpdateSource ?? null,
    },
    scrape: scrapeRes
      ? {
          textHash: scrapeRes?.textHash ?? null,
          textLen: typeof scrapeRes?.text === "string" ? scrapeRes.text.length : null,
          fields: scrapeRes?.fields ?? null,
        }
      : null,
    embedded: Boolean(embed && scrapeRes?.textHash),
  };
}

export default { runOnce, crawlOneUrl };

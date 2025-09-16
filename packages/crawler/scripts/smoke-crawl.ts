#!/usr/bin/env tsx
// === Forzar entorno smoke antes de cargar módulos ===
process.env.CRAWLER_DRY_RUN ??= "1";
process.env.CRAWL_AUDIT_ENABLED ??= "0";
process.env.SCRAPE_AUDIT_ENABLED ??= "0";
process.env.EMBED_AUDIT_ENABLED ??= "0";

import * as dotenv from "dotenv";
dotenv.config();

function printIf<T extends object>(obj: T, key: string, label?: string) {
  if (obj && key in obj) {
    const val = obj[key];
    const k = label ?? key;
    if (
      typeof val === "string" ||
      typeof val === "number" ||
      typeof val === "boolean"
    ) {
      console.log(`${k}:`, val);
    } else if (Array.isArray(val)) {
      console.log(`${k} (#):`, val.length);
      if (val.length && typeof val[0] === "string")
        console.log(`${k} (sample):`, val.slice(0, 5));
    } else if (val && typeof val === "object") {
      console.log(`${k} (keys):`, Object.keys(val));
    } else {
      console.log(`${k}:`, val);
    }
  }
}

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error("Uso: pnpm crawl:smoke <URL>");
    process.exit(1);
  }

  // Importar stages DESPUÉS de setear env
  const { crawlOne } = await import("../src/stages/crawl");
  const { scrapeOne } = await import("../src/stages/scrape");

  const ayuda = {
    id: -1, // id dummy => safeAudit/safeUpsert deben ignorar ids <= 0
    url_oficial: url,
    nombre: "SMOKE TEST",
  };

  console.log("[smoke] crawling:", url);
  const crawl: any = await crawlOne(ayuda as any);

  printIf(crawl as any, "outcome");
  printIf(crawl as any, "status");
  printIf(crawl as any, "etag");
  printIf(crawl as any, "httpLastModified"); // 👈 nuevo
  printIf(crawl as any, "pageLastUpdatedText"); // 👈 nuevo
  printIf(crawl as any, "pageLastUpdatedAt"); // 👈 nuevo
  printIf(crawl as any, "pageUpdateSource");

  printIf(crawl as any, "rawHash");
  printIf(crawl as any, "fetchedAt"); // (si existiera)
  printIf(crawl as any, "title"); // (si existiera)
  printIf(crawl as any, "links"); 
  printIf(crawl as any, "warnings"); 

  const htmlOk = typeof crawl?.html === "string" && crawl.html.length > 0;
  console.log("html?:", htmlOk);

  if (!htmlOk) {
    console.log("[smoke] no HTML. Scrape omitido.");
    return;
  }

  console.log("\n[smoke] scraping…");
  const scraped: any = await scrapeOne(ayuda as any, crawl.html);

  printIf(scraped, "text");
  printIf(scraped, "textHash");
  printIf(scraped, "fields");
  printIf(scraped, "data");

  if (typeof scraped?.text === "string") {
    console.log("\n[smoke] text length:", scraped.text.length);
    console.log("[smoke] text preview:\n", scraped.text.slice(0, 400));
  }

  console.log("[smoke] done");
}

main().catch((e) => {
  console.error("[smoke] error:", e);
  process.exit(1);
});

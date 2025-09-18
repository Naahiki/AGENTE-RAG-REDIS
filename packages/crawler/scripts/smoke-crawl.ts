#!/usr/bin/env tsx
// === Defaults/flags
const args = process.argv.slice(2);
const URL_ARG = args.find(a => !a.startsWith("--"));
const USE_DB = args.includes("--use-db");
const WRITE  = args.includes("--write");

// DRY por defecto si NO pasas --write; respeta .env si ya está fijado
if (WRITE) process.env.CRAWLER_DRY_RUN = "0";
else process.env.CRAWLER_DRY_RUN ??= "1";

process.env.CRAWL_AUDIT_ENABLED ??= "0";
process.env.SCRAPE_AUDIT_ENABLED ??= "0";
process.env.EMBED_AUDIT_ENABLED ??= "0";

import * as dotenv from "dotenv";
dotenv.config();

type POJO = Record<string, any>;
const DRY = process.env.CRAWLER_DRY_RUN === "1";

import { db, schema } from "../src/db";
import { eq } from "drizzle-orm";

const preview = (s?: string, n = 160) =>
  (s ?? "").toString().replace(/\s+/g, " ").trim().slice(0, n);

function printIf<T extends POJO>(obj: T | null | undefined, key: string, label?: string) {
  if (!obj || !(key in obj)) return;
  const val = (obj as any)[key];
  const k = label ?? key;
  console.log(`${k}:`, val);
}

function printFirstAvailable<T extends POJO>(obj: T | null | undefined, keys: string[], label?: string) {
  if (!obj) return;
  for (const k of keys) if (k in obj) return printIf(obj, k, label ?? k);
}

async function main() {
  const urlCli = URL_ARG;
  if (!urlCli) {
    console.error("Uso: pnpm crawl:smoke <URL> [--use-db] [--write]");
    process.exit(1);
  }
  console.log(`[smoke] flags → use-db=${USE_DB} write=${WRITE} dry-run=${DRY}`);

  const { crawlOne } = await import("../src/stages/crawl");
  const { scrapeOne } = await import("../src/stages/scrape");
  const { embedOne } = await import("../src/stages/embed");

  // Cargar ayuda de Neon si --use-db
  let ayuda: any;
  if (USE_DB) {
    ayuda = await db.query.ayudas.findFirst({
      where: eq(schema.ayudas.url_oficial, urlCli),
    });
    if (ayuda) {
      console.log("[smoke] ayuda encontrada en Neon → id:", ayuda.id);
    } else {
      console.log("[smoke] no existe en Neon; usando stub temporal.");
      ayuda = { id: -1, url_oficial: urlCli, nombre: "SMOKE TEST", content_version: 0 };
    }
  } else {
    ayuda = { id: -1, url_oficial: urlCli, nombre: "SMOKE TEST", content_version: 0 };
  }

  // IMPORTANTE: muestra ambas URLs para detectar discrepancias
  console.log("[smoke] url (CLI):     ", urlCli);
  console.log("[smoke] url (Neon/stub)", ayuda.url_oficial);

  // CRAWL
  console.log("[smoke] crawling:", ayuda.url_oficial);
  const crawl: POJO = await crawlOne(ayuda as any);

  printIf(crawl, "outcome");
  printIf(crawl, "status");          // si hubo status != 2xx
  printIf(crawl, "error");           // si fue un error de red/excepción

  printFirstAvailable(crawl, ["httpLastModified", "http_last_modified"], "httpLastModified");
  printFirstAvailable(crawl, ["pageLastUpdatedText", "pageText"], "pageLastUpdatedText");
  printFirstAvailable(crawl, ["pageLastUpdatedAt", "pageISO"], "pageLastUpdatedAt");
  printIf(crawl, "pageUpdateSource");
  printFirstAvailable(crawl, ["rawHash", "raw_hash"], "rawHash");
  printFirstAvailable(crawl, ["contentBytes", "content_bytes"], "contentBytes");

  const htmlOk = typeof crawl?.html === "string" && crawl.html.length > 0;
  console.log("html?:", htmlOk);
  if (!htmlOk) {
    console.log("[smoke] no HTML. Scrape omitido.");
    return;
  }

  // === Gate por última actualización (igual que pipeline) ===
  const prevText = (ayuda.page_last_updated_text ?? null) as string | null;
  const prevISO  = ayuda.page_last_updated_at ? new Date(ayuda.page_last_updated_at).toISOString() : null;
  const currText = (crawl.pageText ?? null) as string | null;
  const currISO  = (crawl.pageISO  ?? null) as string | null;

  const firstTime     = !ayuda.text_hash;
  const changedByText = !!currText && currText !== prevText;
  const changedByISO  = !!currISO && (!prevISO || currISO > prevISO);

  if (!(firstTime || changedByText || changedByISO)) {
    console.log("[smoke] Gate SCRAPE: NO CAMBIO → scrape omitido.");
    return;
  }
  console.log("[smoke] Gate SCRAPE: CAMBIÓ (firstTime=%s, byText=%s, byISO=%s)", firstTime, changedByText, changedByISO);

  // SCRAPE
  console.log("\n[smoke] scraping…");
  const scraped: POJO = await scrapeOne(ayuda as any, crawl.html);

  printIf(scraped, "ok");
  printIf(scraped, "changed");
  printIf(scraped, "textHash");
  printIf(scraped, "textLen");
  printIf(scraped, "lang");

  if (scraped?.fields && typeof scraped.fields === "object") {
    const f = scraped.fields as POJO;
    console.log("\n[smoke] fields (scrapped → preview):");
    for (const k of ["nombre","estado_tramite","dirigido_a","descripcion","documentacion","normativa","resultados","otros"]) {
      if (k in f) {
        const val = (f as any)[k];
        const len = (val ?? "").toString().length;
        console.log(`  - ${k}: (${len} chars)`, preview(val));
      }
    }
  }

  if (scraped?.patch && typeof scraped.patch === "object") {
    const p = scraped.patch as POJO;
    console.log("\n[smoke] patch → Neon (keys):", Object.keys(p));
    for (const [k, v] of Object.entries(p)) {
      if (v == null) console.log(`  - ${k}: null`);
      else if (typeof v === "string") console.log(`  - ${k}: (${v.replace(/\s+/g," ").trim().length} chars)`, preview(v));
      else if (v instanceof Date) console.log(`  - ${k}:`, v.toISOString());
      else console.log(`  - ${k}:`, v);
    }
  }

  // EMBED solo si cambió el texto
  if (!scraped?.changed) {
    console.log("[smoke] Gate EMBED: texto sin cambios → embed omitido.");
    return;
  }

  const ayudaForEmbed = {
    ...ayuda,
    ...(scraped?.fields ?? {}),
    text_hash: scraped?.textHash,
    content_version: (ayuda.content_version ?? 0) + 1,
  };

  console.log("\n[smoke] embedding (dry-run:", DRY ? "ON" : "OFF", ") …");
  const emb: POJO = await embedOne(ayudaForEmbed as any);

  printIf(emb, "ok");
  printIf(emb, "dims");
  printIf(emb, "dryRun");
  printIf(emb, "skippedBecauseSameHash");
  printIf(emb, "error");

  console.log("[smoke] done");
}

main().catch((e) => {
  console.error("[smoke] error:", e);
  process.exit(1);
});

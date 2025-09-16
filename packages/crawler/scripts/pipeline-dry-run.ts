#!/usr/bin/env tsx
import * as dotenv from "dotenv";

// === flags CLI ===
import { parseArgs } from "node:util";
const { values } = parseArgs({
  options: {
    url: { type: "string" },
    embed: { type: "boolean", default: false },
    write: { type: "boolean", default: false }, // si true => CRAWLER_DRY_RUN=0
    log: { type: "string", default: "info" },
  },
});

if (!values.url) {
  console.error("Uso: pnpm pipeline:one --url=<URL> [--embed] [--write] [--log=debug]");
  process.exit(1);
}

// === Forzar entorno smoke (a menos que --write) ===
if (!values.write) {
  process.env.CRAWLER_DRY_RUN ??= "1";
  process.env.CRAWL_AUDIT_ENABLED ??= "0";
  process.env.SCRAPE_AUDIT_ENABLED ??= "0";
  process.env.EMBED_AUDIT_ENABLED ??= "0";
}
dotenv.config();

function dbg(...args: any[]) {
  if ((values.log as string) === "debug") console.log(...args);
}

function printIf<T extends object>(obj: T, key: string, label?: string) {
  if (obj && key in obj) {
    const val = obj[key];
    const k = label ?? key;
    if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
      console.log(`${k}:`, val);
    } else if (Array.isArray(val)) {
      console.log(`${k} (#):`, val.length);
      if (val.length && typeof val[0] === "string") console.log(`${k} (sample):`, val.slice(0, 5));
    } else if (val && typeof val === "object") console.log(`${k} (keys):`, Object.keys(val));
    else console.log(`${k}:`, val);
  }
}

async function main() {
  // Import dinámico para respetar env
  const { crawlOne } = await import("../src/stages/crawl");
  const { scrapeOne } = await import("../src/stages/scrape");
  const { embedOne } = await import("../src/stages/embed");

  const ayuda = { id: -1, url_oficial: String(values.url), nombre: "PIPELINE DRY RUN" };

  console.log("[pipeline] crawl:", ayuda.url_oficial);
  const c: any = await crawlOne(ayuda as any);

  printIf(c, "outcome");
  printIf(c, "status");
  printIf(c, "etag");
  printIf(c, "lastModified");
  printIf(c, "rawHash");
  printIf(c, "fetchedAt");
  const htmlOk = typeof c?.html === "string" && c.html.length > 0;
  console.log("html?:", htmlOk);

  if (!htmlOk) {
    console.log("[pipeline] sin HTML o UNCHANGED; fin.");
    return;
  }

  console.log("[pipeline] scrape…");
  const s: any = await scrapeOne(ayuda as any, c.html);
  printIf(s, "textHash");
  if (typeof s?.text === "string") {
    console.log("[pipeline] text len:", s.text.length);
    if ((values.log as string) === "debug") console.log("[pipeline] text preview:\n", s.text.slice(0, 400));
  }

  if (values.embed) {
    console.log("[pipeline] embed…");
    await embedOne({ ...(ayuda as any), textHash: s?.textHash ?? null } as any);
  }

  console.log("[pipeline] done");
}

main().catch((e) => {
  console.error("[pipeline] error:", e);
  process.exit(1);
});

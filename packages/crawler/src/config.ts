// packages/crawler/src/config.ts
import * as dotenv from "dotenv";
dotenv.config();

const bool = (v: string | undefined, def = false) =>
  v == null ? def : ["1", "true", "on", "yes"].includes(v.toLowerCase());

const num = (v: string | undefined, def: number) => {
  const n = parseInt(v || "", 10);
  return Number.isFinite(n) ? n : def;
};

export const CFG = {
  // ON/OFF
  CRAWLER_ENABLED: bool(process.env.CRAWLER_ENABLED, true),
  SCRAPER_ENABLED: bool(process.env.SCRAPER_ENABLED, true),
  EMBEDDER_ENABLED: bool(process.env.EMBEDDER_ENABLED, true),

  // Planificación
  CRAWLER_CRON: (process.env.CRAWLER_CRON || "").trim(), // vacío => sin cron

  // Concurrencia
  CRAWLER_MAX_CONCURRENCY: num(process.env.CRAWLER_MAX_CONCURRENCY, 4),
  SCRAPER_MAX_CONCURRENCY: num(process.env.SCRAPER_MAX_CONCURRENCY, 4),
  EMBEDDER_MAX_CONCURRENCY: num(process.env.EMBEDDER_MAX_CONCURRENCY, 2),

  // Net / robots / timeouts
  CRAWLER_OBEY_ROBOTS: bool(process.env.CRAWLER_OBEY_ROBOTS, true),
  CRAWLER_USER_AGENT: process.env.CRAWLER_USER_AGENT || "AgentRAG/1.0",
  CRAWLER_TIMEOUT_MS: num(process.env.CRAWLER_TIMEOUT_MS, 15000),
  CRAWLER_RETRY: num(process.env.CRAWLER_RETRY, 2),
  CRAWLER_BACKOFF_MS: num(process.env.CRAWLER_BACKOFF_MS, 5000),

  // Estrategia de reindexado
  REINDEX_STRATEGY: (process.env.REINDEX_STRATEGY || "incremental") as
    | "incremental"
    | "full",
  RAG_INDEX_NAME: process.env.RAG_INDEX_NAME || "ayuda_idx",

  // Redis persistencia
  REDIS_URL: process.env.REDIS_URL!,
  EMBEDDER_REDIS_PREFIX: process.env.EMBEDDER_REDIS_PREFIX || "ayuda",
  EMBEDDER_KEEP_HISTORY: bool(process.env.EMBEDDER_KEEP_HISTORY, true),
  EMBEDDER_WRITE_CURRENT_POINTER: bool(
    process.env.EMBEDDER_WRITE_CURRENT_POINTER,
    true
  ),

  // Scraper sanity
  SCRAPER_MIN_TEXT_LEN: num(process.env.SCRAPER_MIN_TEXT_LEN, 400),
  SCRAPER_NORMALIZE_HTML: bool(process.env.SCRAPER_NORMALIZE_HTML, true),

  // Auditoría
  CRAWL_AUDIT_ENABLED: bool(process.env.CRAWL_AUDIT_ENABLED, true),
  SCRAPE_AUDIT_ENABLED: bool(process.env.SCRAPE_AUDIT_ENABLED, true),
  EMBED_AUDIT_ENABLED: bool(process.env.EMBED_AUDIT_ENABLED, true),

  // Infra
  DATABASE_URL: process.env.DATABASE_URL!,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY!,
  EMBEDDING_MODEL: process.env.EMBEDDING_MODEL || "text-embedding-3-small",

  // Verbose
  VERBOSE: (process.env.CORE_VERBOSE || "0") === "1",
};

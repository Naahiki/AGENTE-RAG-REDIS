// packages/sources/neon/schemas/ayudas.ts
import {
  pgTable, serial, text, integer, timestamp, boolean, index, pgEnum,
} from "drizzle-orm/pg-core";

export const crawlOutcomeEnum = pgEnum("crawl_outcome", [
  "UNCHANGED","SOFT_CHANGED","CHANGED","GONE","BLOCKED","ERROR",
]);

export const ayudas = pgTable(
  "ayudas",
  {
    id: serial("id").primaryKey(),

    // --- Datos funcionales ---
    estado_tramite: text("estado_tramite"),
    tipo_tramite: text("tipo_tramite"),
    tema_subtema: text("tema_subtema"),
    nombre: text("nombre"),
    dirigido_a: text("dirigido_a"),
    descripcion: text("descripcion"),
    normativa: text("normativa"),
    documentacion: text("documentacion"),
    url_oficial: text("url_oficial"),
    resultados: text("resultados"),
    otros: text("otros"),
    servicio: text("servicio"),

    // --- Metadatos ---
    updated_at: timestamp("updated_at").defaultNow().notNull(),

    // --- Operativos ---
    etag: text("etag"),
    http_last_modified: text("http_last_modified"),
    page_last_updated_at: timestamp("page_last_updated_at"),
    page_last_updated_text: text("page_last_updated_text"),
    content_bytes: integer("content_bytes"),

    // Huellas
    raw_hash: text("raw_hash"),     // hash del HTML normalizado (diagnóstico)
    text_hash: text("text_hash"),   // ✅ hash canónico del texto útil

    // Versionado por cambios de text_hash
    content_version: integer("content_version").default(0).notNull(),

    // Timestamps pipeline
    last_crawled_at: timestamp("last_crawled_at"),
    last_scraped_at: timestamp("last_scraped_at"),
    last_embedded_at: timestamp("last_embedded_at"),

    // Idempotencia embedding
    last_embedded_text_hash: text("last_embedded_text_hash"),

    // Estados últimas etapas
    last_crawl_outcome: crawlOutcomeEnum("last_crawl_outcome"),
    last_scrape_ok: boolean("last_scrape_ok"),
    last_embed_ok: boolean("last_embed_ok"),

    // Error última vez
    last_error: text("last_error"),
  },
  (t) => ({
    urlIdx: index("ayudas_url_oficial_idx").on(t.url_oficial),
    textHashIdx: index("ayudas_text_hash_idx").on(t.text_hash),
    rawHashIdx: index("ayudas_raw_hash_idx").on(t.raw_hash),
    crawledAtIdx: index("ayudas_last_crawled_at_idx").on(t.last_crawled_at),
    scrapedAtIdx: index("ayudas_last_scraped_at_idx").on(t.last_scraped_at),
    embeddedAtIdx: index("ayudas_last_embedded_at_idx").on(t.last_embedded_at),
    pageUpdatedAtIdx: index("ayudas_page_last_updated_at_idx").on(t.page_last_updated_at),
  })
);

export type Ayuda = typeof ayudas.$inferSelect;
export type NewAyuda = typeof ayudas.$inferInsert;

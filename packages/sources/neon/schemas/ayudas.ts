import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  boolean,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";

// Enum informativo del último resultado de crawl
export const crawlOutcomeEnum = pgEnum("crawl_outcome", [
  "UNCHANGED",
  "SOFT_CHANGED",
  "CHANGED",
  "GONE",
  "BLOCKED",
  "ERROR",
]);

export const ayudas = pgTable(
  "ayudas",
  {
    id: serial("id").primaryKey(),

    // --- Campos funcionales de la ayuda ---
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

    // --- Metadatos tradicionales ---
    updated_at: timestamp("updated_at").defaultNow().notNull(),

    // Compat si ya lo usabas en tu ETL
    hash_contenido: text("hash_contenido"),

    // --- Operativos para el pipeline ---

    // Señales HTTP (del servidor)
    etag: text("etag"),
    // ⬇️ RENOMBRADO: header HTTP Last-Modified (no mezclar con la fecha de la página)
    http_last_modified: text("http_last_modified"),

    // Señales HTML (de la propia página)
    // Fecha del <span> "Última actualización: ..."
    // Si tu versión de drizzle soporta TZ, puedes usar { withTimezone: true }
    page_last_updated_at: timestamp("page_last_updated_at"),
    page_last_updated_text: text("page_last_updated_text"),

    // Tamaño del último contenido descargado (bytes del HTML/PDF)
    content_bytes: integer("content_bytes"),

    // Huellas
    // Recomendado: hash de contenido "estable" (no del HTML crudo)
    raw_hash: text("raw_hash"),
    // Hash del texto útil tras el scrape (para decidir re-embedding)
    text_hash: text("text_hash"),

    // Versionado simple del contenido (incrementa si cambia text_hash)
    content_version: integer("content_version").default(0).notNull(),

    // Marcas temporales por etapa
    last_crawled_at: timestamp("last_crawled_at"),
    last_scraped_at: timestamp("last_scraped_at"),
    last_embedded_at: timestamp("last_embedded_at"),

    // Idempotencia embed: último text_hash embebido correctamente
    last_embedded_text_hash: text("last_embedded_text_hash"),

    // Últimos outcomes (diagnóstico)
    last_crawl_outcome: crawlOutcomeEnum("last_crawl_outcome"),
    last_scrape_ok: boolean("last_scrape_ok"),
    last_embed_ok: boolean("last_embed_ok"),

    // Nota de error última vez
    last_error: text("last_error"),
  },
  (t) => ({
    urlIdx: index("ayudas_url_oficial_idx").on(t.url_oficial),
    textHashIdx: index("ayudas_text_hash_idx").on(t.text_hash),
    rawHashIdx: index("ayudas_raw_hash_idx").on(t.raw_hash),
    crawledAtIdx: index("ayudas_last_crawled_at_idx").on(t.last_crawled_at),
    scrapedAtIdx: index("ayudas_last_scraped_at_idx").on(t.last_scraped_at),
    embeddedAtIdx: index("ayudas_last_embedded_at_idx").on(t.last_embedded_at),

    // Índice útil para decidir cambios por fecha de página
    pageUpdatedAtIdx: index("ayudas_page_last_updated_at_idx").on(t.page_last_updated_at),
  })
);

export type Ayuda = typeof ayudas.$inferSelect;
export type NewAyuda = typeof ayudas.$inferInsert;

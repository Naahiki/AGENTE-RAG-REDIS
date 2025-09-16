import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { ayudas } from "./ayudas";

export const scrapeAudit = pgTable(
  "scrape_audit",
  {
    id: serial("id").primaryKey(),
    ayuda_id: integer("ayuda_id")
      .notNull()
      .references(() => ayudas.id, { onDelete: "cascade" }),

    url: text("url").notNull(),
    ts: timestamp("ts").defaultNow().notNull(),

    extractor: text("extractor"),   // p.ej. "readability", "rules(navarra.es)"
    text_hash: text("text_hash"),   // hash del texto útil post-scrape (para comparar con ayudas.text_hash)
    text_len: integer("text_len"),  // longitud del texto final
    lang: text("lang"),             // si haces detección de idioma

    // Datos adicionales útiles: secciones, títulos, pdfs extraídos, etc.
    meta: jsonb("meta"),
    error: text("error"),
  },
  (t) => ({
    ayudaIdx: index("scrape_audit_ayuda_id_idx").on(t.ayuda_id),
    tsIdx: index("scrape_audit_ts_idx").on(t.ts),
    urlIdx: index("scrape_audit_url_idx").on(t.url),
    textHashIdx: index("scrape_audit_text_hash_idx").on(t.text_hash),
  })
);

export type ScrapeAudit = typeof scrapeAudit.$inferSelect;
export type NewScrapeAudit = typeof scrapeAudit.$inferInsert;

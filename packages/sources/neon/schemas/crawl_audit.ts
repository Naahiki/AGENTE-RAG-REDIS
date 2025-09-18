import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  real,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { ayudas, crawlOutcomeEnum } from "./ayudas";

export const crawlAudit = pgTable(
  "crawl_audit",
  {
    id: serial("id").primaryKey(),

    ayuda_id: integer("ayuda_id")
      .notNull()
      .references(() => ayudas.id, { onDelete: "cascade" }),

    url: text("url").notNull(),
    ts: timestamp("ts").defaultNow().notNull(),

    // Métricas HTTP
    http_status: integer("http_status"),
    duration_ms: integer("duration_ms"),
    etag: text("etag"),
    http_last_modified: text("http_last_modified"),

    // Huellas del crawl
    raw_hash: text("raw_hash"),
    diff_score: real("diff_score"),
    outcome: crawlOutcomeEnum("outcome"),
    content_bytes: integer("content_bytes"),

    // Fecha visible en la página
    page_last_updated_at: timestamp("page_last_updated_at"),
    page_last_updated_text: text("page_last_updated_text"),

    // Miscelánea
    notes: jsonb("notes"),
    error: text("error"),
  },
  (t) => ({
    ayudaIdx: index("crawl_audit_ayuda_id_idx").on(t.ayuda_id),
    tsIdx: index("crawl_audit_ts_idx").on(t.ts),
    urlIdx: index("crawl_audit_url_idx").on(t.url),
    outcomeIdx: index("crawl_audit_outcome_idx").on(t.outcome),
    pageUpdatedAtIdx: index("crawl_audit_page_last_updated_at_idx").on(
      t.page_last_updated_at
    ),
  })
);

export type CrawlAudit = typeof crawlAudit.$inferSelect;
export type NewCrawlAudit = typeof crawlAudit.$inferInsert;

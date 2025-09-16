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

export const embedAudit = pgTable(
  "embed_audit",
  {
    id: serial("id").primaryKey(),
    ayuda_id: integer("ayuda_id")
      .notNull()
      .references(() => ayudas.id, { onDelete: "cascade" }),

    ts: timestamp("ts").defaultNow().notNull(),
    provider: text("provider"),   // "openai", "voyage", etc.
    model: text("model"),
    dim: integer("dim"),

    // Para rastrear la versión activa en Redis u otro store
    text_hash: text("text_hash"),         // en base al que embeddaste
    content_version: integer("content_version"),

    // Métricas / costes / claves de almacenamiento
    duration_ms: integer("duration_ms"),
    token_usage: jsonb("token_usage"),    // si aplica (prompt/completion/total)
    store_key: text("store_key"),         // e.g. redis key/version
    meta: jsonb("meta"),                  // cualquier extra (chunks, thresholds, etc.)
    error: text("error"),
  },
  (t) => ({
    ayudaIdx: index("embed_audit_ayuda_id_idx").on(t.ayuda_id),
    tsIdx: index("embed_audit_ts_idx").on(t.ts),
    textHashIdx: index("embed_audit_text_hash_idx").on(t.text_hash),
    modelIdx: index("embed_audit_model_idx").on(t.model),
  })
);

export type EmbedAudit = typeof embedAudit.$inferSelect;
export type NewEmbedAudit = typeof embedAudit.$inferInsert;

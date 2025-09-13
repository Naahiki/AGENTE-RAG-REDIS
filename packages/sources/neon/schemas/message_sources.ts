// packages/sources/neon/schemas/message_sources.ts
import { pgTable, serial, integer, text, real, jsonb, index } from "drizzle-orm/pg-core";
import { chatMessages } from "./chat_messages";

export const messageSources = pgTable("message_sources", {
  id: serial("id").primaryKey(),
  message_id: integer("message_id")
    .notNull()
    .references(() => chatMessages.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  rank: integer("rank").notNull(),        // 1..N según orden enviado al LLM
  score: real("score"),                   // si tu retriever lo expone
  raw_chunk: jsonb("raw_chunk")
    .$type<Record<string, any>>(),        // opcional: título/desc/estado/etc
}, (t) => ({
  msgIdx: index("message_sources_message_id_idx").on(t.message_id),
  urlIdx: index("message_sources_url_idx").on(t.url),
}));

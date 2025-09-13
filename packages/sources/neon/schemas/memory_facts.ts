// packages/sources/neon/schemas/memory_facts.ts
import { pgTable, serial, varchar, text, timestamp, integer, index } from "drizzle-orm/pg-core";

export const memoryFacts = pgTable("memory_facts", {
  id: serial("id").primaryKey(),
  user_id: varchar("user_id", { length: 64 }),      // null si chat público
  chat_id: varchar("chat_id", { length: 64 }).notNull(),
  fact_text: text("fact_text").notNull(),
  source: varchar("source", { length: 64 }),         // e.g. "assistant_extraction"
  confidence: integer("confidence").default(80),     // 0–100
  created_at: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  chatIdx: index("memory_facts_chat_id_idx").on(t.chat_id),
  userIdx: index("memory_facts_user_id_idx").on(t.user_id),
  createdIdx: index("memory_facts_created_at_idx").on(t.created_at),
}));

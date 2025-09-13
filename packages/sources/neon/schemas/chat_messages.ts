// packages/sources/neon/schemas/chat_messages.ts
import { pgTable, serial, text, timestamp, varchar, jsonb, index } from "drizzle-orm/pg-core";

export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  chat_id: varchar("chat_id", { length: 64 }).notNull(),
  role: varchar("role", { length: 16 }).notNull(), // "user" | "assistant"
  content: text("content").notNull(),
  // Recomendado: usar JSONB para meta (antes tenías text):
  meta: jsonb("meta").$type<Record<string, any>>(), 
  created_at: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  chatTimeIdx: index("chat_messages_chat_time_idx").on(t.chat_id, t.created_at),
}));

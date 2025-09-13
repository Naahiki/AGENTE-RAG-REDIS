// packages/schema/neon/chat_messages.ts
import { pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  chat_id: varchar("chat_id", { length: 64 }).notNull(),
  role: varchar("role", { length: 16 }).notNull(), // "user" | "assistant"
  content: text("content").notNull(),
  meta: text("meta"), // JSON string (sources, retrieval, etc.)
  created_at: timestamp("created_at").defaultNow().notNull(),
});

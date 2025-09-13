// packages/schema/neon/memory_summaries.ts
import { pgTable, serial, text, timestamp, varchar, integer } from "drizzle-orm/pg-core";

export const memorySummaries = pgTable("memory_summaries", {
  id: serial("id").primaryKey(),
  chat_id: varchar("chat_id", { length: 64 }).notNull(),
  summary_text: text("summary_text").notNull(),
  version: integer("version").default(1).notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

//Nota: si en el futuro quieres “memoria por usuario”, añade user_id nullable a ambas tablas.
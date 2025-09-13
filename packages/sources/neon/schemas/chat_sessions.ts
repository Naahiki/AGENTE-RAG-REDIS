// packages/sources/neon/schemas/chat_sessions.ts
import { pgTable, varchar, timestamp, jsonb, index } from "drizzle-orm/pg-core";

export const chatSessions = pgTable("chat_sessions", {
  chat_id: varchar("chat_id", { length: 64 }).primaryKey(),
  user_id: varchar("user_id", { length: 64 }),           // null -> público/anon
  created_at: timestamp("created_at").defaultNow().notNull(),
  last_activity_at: timestamp("last_activity_at").defaultNow().notNull(),
  meta: jsonb("meta").$type<Record<string, any>>(),       // opcional
}, (t) => ({
  lastActivityIdx: index("chat_sessions_last_activity_idx").on(t.last_activity_at),
  userIdx: index("chat_sessions_user_id_idx").on(t.user_id),
}));

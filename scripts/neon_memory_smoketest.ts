import * as dotenv from "dotenv";
dotenv.config();

import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { eq } from "drizzle-orm";

import { chatMessages } from "../packages/sources/neon/schemas/chat_messages";
import { memorySummaries } from "../packages/sources/neon/schemas/memory_summaries";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle(sql);

  const chatId = `smoke-${Date.now()}`;

  // 1) Inserta 2 mensajes (auditoría)
  await db.insert(chatMessages).values(
    { chat_id: chatId, role: "user",      content: "Hola, ¿qué ayudas hay?",       meta: { t: Date.now() } }
  );
  await db.insert(chatMessages).values(
    { chat_id: chatId, role: "assistant", content: "Existen Bonos Impulsa...",     meta: { sources: ["https://www.navarra.es/..."] } }
  );

  // 2) UPSERT simple del resumen largo
  const existing = await db.select().from(memorySummaries).where(eq(memorySummaries.chat_id, chatId));
  if (existing.length === 0) {
    await db.insert(memorySummaries).values({
      chat_id: chatId,
      summary_text: "El usuario pregunta por ayudas; se le menciona Bonos Impulsa.",
    });
  } else {
    await db
      .update(memorySummaries)
      .set({ summary_text: existing[0].summary_text + " (actualizado)" })
      .where(eq(memorySummaries.chat_id, chatId));
  }

  // 3) Lee y muestra
  const msgs = await db.select().from(chatMessages).where(eq(chatMessages.chat_id, chatId));
  const summaries = await db.select().from(memorySummaries).where(eq(memorySummaries.chat_id, chatId));

  console.log("✅ Neon OK");
  console.log("   chatId:", chatId);
  console.log("   Mensajes:", msgs.map(m => ({ role: m.role, content: m.content })));
  console.log("   Summary:", summaries[0]?.summary_text);
}

main().catch((e) => {
  console.error("❌ Neon smoketest error:", e);
  process.exit(1);
});

import * as dotenv from "dotenv";
dotenv.config();

import {
  appendTurn,
  getMemoryAsMessages,
  getShortSummary,
  setShortSummary,
  clearChat,
  getLongSummary,
  upsertLongSummary,
  appendAuditToNeon,
} from "../packages/memory/src/index";

async function main() {
  const chatId = `memtest-${Date.now()}`;

  // Limpia por si acaso
  await clearChat(chatId);

  // 1) Redis: short summary vacío → set + get
  console.log("== Redis short summary ==");
  let short0 = await getShortSummary(chatId);
  console.log("short before:", short0); // debería ser null
  await setShortSummary(chatId, "Resumen corto inicial del hilo.");
  let short1 = await getShortSummary(chatId);
  console.log("short after:", short1);

  // 2) Redis: append de turnos y lectura como mensajes rolados
  console.log("\n== Redis turns ==");
  await appendTurn(chatId, "Hola, ¿qué ayudas hay?", "Existen Bonos Impulsa…", { sources: ["https://www.navarra.es/..."] });
  await appendTurn(chatId, "¿Plazos actuales?", "Del 1 al 30 de septiembre.");
  let msgs1 = await getMemoryAsMessages(chatId);
  console.log("messages (2 turnos):", msgs1);

  // 3) Poda por longitud: genera más de MEMORY_MAX_TURNS para comprobar trim
  console.log("\n== Redis trim test ==");
  const maxTurns = parseInt(process.env.MEMORY_MAX_TURNS || "5", 10);
  for (let i = 0; i < maxTurns + 3; i++) {
    await appendTurn(chatId, `Q${i}`, `A${i}`);
  }
  let msgs2 = await getMemoryAsMessages(chatId);
  console.log(`messages after overflow (<= ${process.env.MEMORY_RECENT_LIMIT || 4}*2 roles aprox):`, msgs2.length, "items");
  console.log("sample last messages:", msgs2.slice(-4));

  // 4) Neon: resumen largo (upsert) + lectura
  console.log("\n== Neon long summary ==");
  let long0 = await getLongSummary(chatId);
  console.log("long before:", long0); // debería ser null
  await upsertLongSummary(chatId, "Resumen largo v1: el usuario consulta ayudas e interés en plazos.");
  let long1 = await getLongSummary(chatId);
  console.log("long after:", long1);

  // 5) Neon: auditoría de mensajes
  console.log("\n== Neon audit ==");
  await appendAuditToNeon(chatId, [
    { role: "user", content: "Mensaje auditado (user)" },
    { role: "assistant", content: "Mensaje auditado (assistant)", meta: { note: "ok" } },
  ]);
  console.log("audit: inserted 2 rows (verifícalo en Neon si quieres).");

  console.log("\n✅ TEST OK — chatId:", chatId);
}

main().catch((e) => {
  console.error("❌ test_memory_package error:", e);
  process.exit(1);
});

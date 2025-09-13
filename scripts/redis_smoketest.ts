import { createClient } from "redis";
import * as dotenv from "dotenv";
dotenv.config();

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const TTL = parseInt(process.env.MEMORY_TTL_SECONDS || "60", 10); // 60s para test

function kMsgs(chatId: string) { return `chat:${chatId}:messages`; }
function kSummary(chatId: string) { return `chat:${chatId}:summary_short`; }

async function main() {
  const redis = createClient({ url: REDIS_URL });
  await redis.connect();

  const chatId = `smoke-${Date.now()}`;
  const keyMsgs = kMsgs(chatId);
  const keySum = kSummary(chatId);

  // Limpia por si acaso (algunas typings exigen 1 arg)
  await redis.del(keyMsgs);
  await redis.del(keySum);

  // Inserta 2 turnos
  await redis.rPush(keyMsgs, JSON.stringify({ ts: Date.now(), user: "Hola", assistant: "¡Hola!" }));
  await redis.rPush(keyMsgs, JSON.stringify({ ts: Date.now(), user: "¿Plazos?", assistant: "Del 1 al 30." }));
  await redis.expire(keyMsgs, TTL);

  // Resumen corto
  await redis.set(keySum, "Interés en plazos de una ayuda.", { EX: TTL });

  // Lee últimos mensajes + resumen
  const len = await redis.lLen(keyMsgs);
  const last = await redis.lRange(keyMsgs, Math.max(0, len - 2), -1);
  const summary = await redis.get(keySum);
  const ttlMsgs = await redis.ttl(keyMsgs);

  console.log("✅ Redis OK");
  console.log("   chatId:", chatId);
  console.log("   Últimos mensajes:", last.map((s) => JSON.parse(s)));
  console.log("   Resumen corto:", summary);
  console.log("   TTL mensajes (s):", ttlMsgs);

  await redis.quit();
}

main().catch((e) => {
  console.error("❌ Redis smoketest error:", e);
  process.exit(1);
});

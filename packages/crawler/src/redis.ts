// packages/crawler/src/redis.ts
import { createClient } from "redis";
import { CFG } from "./config";

let client: ReturnType<typeof createClient> | null = null;

export async function getRedis() {
  if (client) return client;
  client = createClient({ url: CFG.REDIS_URL });
  client.on("error", (e) => console.error("[redis] error", e));
  await client.connect();
  return client;
}

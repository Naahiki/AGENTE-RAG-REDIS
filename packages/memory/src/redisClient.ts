import { createClient, RedisClientType } from "redis";
import { REDIS_URL } from "./constants";

let client: RedisClientType | null = null;
let connectPromise: Promise<void> | null = null;

export async function getRedis(): Promise<RedisClientType> {
  if (!client) {
    client = createClient({ url: REDIS_URL });
    client.on("error", (err) => {
      console.error("[redis] client error:", err);
    });
  }

  // node-redis v5 expone isOpen; usamos un lock para evitar carreras
  if (!client.isOpen) {
    if (!connectPromise) {
      connectPromise = client.connect()
        .catch((e) => { connectPromise = null; throw e; })
        .then(() => { connectPromise = null; });
    }
    await connectPromise;
  }

  return client;
}

export async function closeRedis() {
  if (client?.isOpen) {
    await client.quit();
  }
  client = null;
  connectPromise = null;
}

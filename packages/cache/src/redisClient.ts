import { createClient, RedisClientType } from "redis";
import { REDIS_URL } from "./constants";

let client: RedisClientType | null = null;
let connected = false;

export async function getRedis(): Promise<RedisClientType> {
  if (!client) client = createClient({ url: REDIS_URL });
  if (!connected) { await client.connect(); connected = true; }
  return client;
}

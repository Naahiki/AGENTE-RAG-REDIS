import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";

let _db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const sql = neon(url);
  _db = drizzle(sql);
  return _db;
}

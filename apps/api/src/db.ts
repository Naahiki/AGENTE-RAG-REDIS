// apps/api/src/db.ts
import { neon } from "@neondatabase/serverless";

const { DATABASE_URL } = process.env;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL not set");
}

export const sql = neon(DATABASE_URL);

// Utilidades pequeñas para mapear filas a objetos “seguros”
export function row<T = any>(arr: T[]): T | null {
  return Array.isArray(arr) && arr.length ? (arr[0] as T) : null;
}

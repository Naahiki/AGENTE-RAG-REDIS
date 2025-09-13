// packages/memory/src/neonClient.ts
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
dotenv.config();

// 👇 importa SOLO lo que realmente exporta @agent-rag/sources/schemas
import { chatMessages, memorySummaries /*, memoryFacts */ } from "@agent-rag/sources/schemas";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL not set");

const sql = neon(DATABASE_URL);
export const db = drizzle(sql);

// Re-exports para usar en el resto del paquete memory
export { chatMessages, memorySummaries /*, memoryFacts */ };

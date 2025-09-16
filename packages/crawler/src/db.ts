import * as dotenv from "dotenv";
dotenv.config();

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

// ✅ importa TODO el schema (todas las tablas) desde tu paquete de schemas
// Si ya tienes un index que re-exporta, usa esa ruta:
import * as schema from "../../sources/neon/schemas";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL no definida");
}

const sql = neon(process.env.DATABASE_URL);
export const db = drizzle(sql, { schema });

// Exporta el tipo si te viene bien en otros ficheros
export type DB = typeof db;

// (Opcional) re-exporta schema aquí si quieres importarlo de un sitio
export { schema };

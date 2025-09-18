// scripts/excel-a-neon.ts
// Ingesta desde Excel -> Neon (sin hash_contenido)

import * as xlsx from "xlsx";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
import { ayudas } from "../packages/sources/neon/schemas/ayudas";

dotenv.config();

const toNull = (v: any) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
};

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("Falta DATABASE_URL en .env");
  }

  const workbook = xlsx.readFile("data/data.xlsx");
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });

  console.log(`[excel] filas leídas: ${rows.length}`);

  const sql = neon(process.env.DATABASE_URL);
  const db = drizzle(sql);

  const payload = rows.map((row, i) => ({
    estado_tramite: toNull(row["Estado del trámite"]),
    tipo_tramite: toNull(row["Tipo de trámite"]),
    tema_subtema: toNull(row["Tema y subtema"]),
    nombre: toNull(row["Nombre de la ayuda"]),
    dirigido_a: toNull(row["Dirigido a / destinatarios"]),
    descripcion: toNull(row["Breve descripción"]),
    normativa: toNull(row["Normativa relacionada"]),
    documentacion: toNull(row["Documentación a presentar"]),
    url_oficial: toNull(row["Enlace oficial"]),
    resultados: toNull(row["Resultados"]),
    otros: toNull(row["Otros campos que consideréis relevantes"]),
    servicio: toNull(row["Servicio"]),
    // updated_at: se deja al defaultNow() del schema
  }));

  // Opcional: filtra filas totalmente vacías (sin nombre y sin url)
  const filtered = payload.filter(p => p.nombre || p.url_oficial);
  console.log(`[neon] filas a insertar: ${filtered.length}`);

  // Inserta en lotes por si el Excel es grande
  const BATCH = 500;
  for (let i = 0; i < filtered.length; i += BATCH) {
    const slice = filtered.slice(i, i + BATCH);
    await db.insert(ayudas).values(slice);
    console.log(`[neon] insertadas ${i + slice.length}/${filtered.length}`);
  }

  console.log("✅ Ingesta completada.");
}

main().catch((err) => {
  console.error("❌ Error al insertar:", err);
  process.exit(1);
});

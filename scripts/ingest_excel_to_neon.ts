// ✅ Ajustado según las buenas prácticas de Redis
// SCRIPT 1: Ingesta desde Excel a Neon

import * as xlsx from 'xlsx';
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';
import { ayudas } from '../packages/sources/neon/schemas/ayudas';

dotenv.config();

const main = async () => {
  const workbook = xlsx.readFile('data/data.xlsx');
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });

  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle(sql);

  const formatted = rows.map((row) => ({
    estado_tramite: row['Estado del trámite'],
    tipo_tramite: row['Tipo de trámite'],
    tema_subtema: row['Tema y subtema'],
    nombre: row['Nombre de la ayuda'],
    dirigido_a: row['Dirigido a / destinatarios'],
    descripcion: row['Breve descripción'],
    normativa: row['Normativa relacionada'],
    documentacion: row['Documentación a presentar'],
    url_oficial: row['Enlace oficial'],
    resultados: row['Resultados'],
    otros: row['Otros campos que consideréis relevantes'],
    servicio: row['Servicio'],
    updated_at: new Date(),
    hash_contenido: '',
  }));

  await db.insert(ayudas).values(formatted);
  console.log(`✅ Ingestadas ${formatted.length} filas desde el Excel a Neon.`);
};

main().catch((err) => {
  console.error('❌ Error al insertar:', err);
});

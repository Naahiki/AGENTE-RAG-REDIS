// import { drizzle } from 'drizzle-orm/neon-http';
// import { neon } from '@neondatabase/serverless';
// import { createClient } from 'redis';
// import { OpenAI } from 'openai';
// import * as dotenv from 'dotenv';
// import { ayudas } from '../packages/sources/neon/schemas/ayudas';
// import { eq } from 'drizzle-orm';
// import crypto from 'crypto';

// dotenv.config();

// const sql = neon(process.env.DATABASE_URL!);
// const db = drizzle(sql);
// const redis = createClient({ url: process.env.REDIS_URL! });
// const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// const DIM = 1536;
// const INDEX_NAME = 'ayuda_idx';

// const buildHash = (data: Record<string, any>) => {
//   const concat = [
//     data.descripcion,
//     data.estado_tramite,
//     data.tipo_tramite,
//     data.tema_subtema,
//     data.nombre,
//     data.dirigido_a,
//     data.normativa,
//     data.documentacion,
//     data.resultados,
//     data.otros,
//     data.servicio,
//   ]
//     .filter(Boolean)
//     .join('||');

//   return crypto.createHash('sha256').update(concat).digest('hex');
// };

// const main = async () => {
//   console.log('🚀 Iniciando indexación a Redis...');
//   await redis.connect();

//   // 1. Eliminar índice anterior si existe
//   try {
//     await redis.sendCommand(['FT.DROPINDEX', INDEX_NAME, 'DD']);
//     console.log(`🗑️ Índice "${INDEX_NAME}" eliminado`);
//   } catch {
//     console.log(`ℹ️ Índice "${INDEX_NAME}" no existía`);
//   }

//   // 2. Eliminar claves Redis anteriores
//   const keys = await redis.keys('ayuda:*');
//   if (keys.length > 0) {
//     await redis.del(keys);
//     console.log(`🧹 ${keys.length} claves eliminadas`);
//   } else {
//     console.log('ℹ️ No había claves previas');
//   }

//   // 3. Crear nuevo índice
//   console.log(`⚙️ Creando índice "${INDEX_NAME}"...`);
//   await redis.sendCommand([
//     'FT.CREATE', INDEX_NAME,
//     'ON', 'JSON',
//     'PREFIX', '1', 'ayuda:',
//     'SCHEMA',
//     '$.titulo', 'AS', 'titulo', 'TEXT',
//     '$.descripcion', 'AS', 'descripcion', 'TEXT',
//     '$.dirigido_a', 'AS', 'dirigido_a', 'TEXT',
//     '$.estado_tramite', 'AS', 'estado_tramite', 'TEXT',
//     '$.tipo_tramite', 'AS', 'tipo_tramite', 'TEXT',
//     '$.tema_subtema', 'AS', 'tema_subtema', 'TEXT',
//     '$.normativa', 'AS', 'normativa', 'TEXT',
//     '$.documentacion', 'AS', 'documentacion', 'TEXT',
//     '$.resultados', 'AS', 'resultados', 'TEXT',
//     '$.otros', 'AS', 'otros', 'TEXT',
//     '$.servicio', 'AS', 'servicio', 'TEXT',
//     '$.url', 'AS', 'url', 'TEXT',
//     '$.metadata', 'AS', 'metadata', 'TEXT',
//     '$.embedding', 'AS', 'embedding', 'VECTOR', 'FLAT', '6',
//     'TYPE', 'FLOAT32',
//     'DIM', DIM.toString(),
//     'DISTANCE_METRIC', 'COSINE',
//   ]);
//   console.log(`✅ Índice "${INDEX_NAME}" creado correctamente`);

//   // 4. Obtener ayudas de Neon
//   const allAyudas = await db.select().from(ayudas);

//   for (const ayuda of allAyudas) {
//     const hash = buildHash(ayuda);
//     const textoEmbedding = [
//       `Nombre: ${ayuda.nombre}`,
//       `Descripción: ${ayuda.descripcion}`,
//       `Estado del trámite: ${ayuda.estado_tramite}`,
//       `Tipo de trámite: ${ayuda.tipo_tramite}`,
//       `Tema y subtema: ${ayuda.tema_subtema}`,
//       `Dirigido a: ${ayuda.dirigido_a}`,
//       `Normativa: ${ayuda.normativa}`,
//       `Documentación: ${ayuda.documentacion}`,
//       `Resultados: ${ayuda.resultados}`,
//       `Otros: ${ayuda.otros}`,
//       `Servicio: ${ayuda.servicio}`,
//     ].filter(Boolean).join('\n\n');

//     // Obtener embedding desde OpenAI
//     const embeddingResponse = await openai.embeddings.create({
//       input: textoEmbedding,
//       model: process.env.EMBEDDING_MODEL!,
//     });

//     const vector = embeddingResponse.data[0].embedding;
//     const embedding = new Float32Array(vector); // ✅ Float32 obligatorio
//     const redisKey = `ayuda:${ayuda.id}`;

//     // Guardar JSON en Redis (embedding como Buffer)
//     await redis.json.set(redisKey, '$', {
//     id: ayuda.id,
//     titulo: ayuda.nombre,
//     url: ayuda.url_oficial,
//     descripcion: ayuda.descripcion,
//     estado_tramite: ayuda.estado_tramite,
//     tipo_tramite: ayuda.tipo_tramite,
//     tema_subtema: ayuda.tema_subtema,
//     dirigido_a: ayuda.dirigido_a,
//     normativa: ayuda.normativa,
//     documentacion: ayuda.documentacion,
//     resultados: ayuda.resultados,
//     otros: ayuda.otros,
//     servicio: ayuda.servicio,
//     metadata: JSON.stringify({      // 👈 CORREGIDO: ahora sí lo puedes indexar como TEXT
//         tema: ayuda.tema_subtema,
//         servicio: ayuda.servicio,
//     }),
//     hash,
//     embedding: Array.from(embedding),
//     });

//     // Actualizar hash en Neon
//     await db
//       .update(ayudas)
//       .set({ hash_contenido: hash })
//       .where(eq(ayudas.id, ayuda.id));

//     console.log(`✅ Guardado en Redis: ${ayuda.nombre}`);
//   }

//   const total = await redis.dbSize();
//   console.log(`📊 Total de claves Redis: ${total}`);

//   await redis.quit();
//   console.log('🎉 Proceso completo finalizado');
// };

// main().catch((err) => {
//   console.error('❌ Error en la indexación:', err);
//   redis.quit();
// });


import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { createClient } from 'redis';
import { OpenAI } from 'openai';
import * as dotenv from 'dotenv';
import { ayudas } from '../packages/sources/neon/schemas/ayudas';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

dotenv.config();

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);
const redis = createClient({ url: process.env.REDIS_URL! });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

const DIM = 1536;
const INDEX_NAME = 'ayuda_idx';

const buildHash = (data: Record<string, any>) => {
  const concat = [
    data.descripcion,
    data.estado_tramite,
    data.tipo_tramite,
    data.tema_subtema,
    data.nombre,
    data.dirigido_a,
    data.normativa,
    data.documentacion,
    data.resultados,
    data.otros,
    data.servicio,
  ]
    .filter(Boolean)
    .join('||');

  return crypto.createHash('sha256').update(concat).digest('hex');
};

const main = async () => {
  console.log('🚀 Iniciando indexación a Redis...');

  // Validar variables de entorno
  if (!process.env.DATABASE_URL || !process.env.REDIS_URL || !process.env.OPENAI_API_KEY || !process.env.EMBEDDING_MODEL) {
    throw new Error('Faltan variables de entorno necesarias');
  }

  await redis.connect();

  // 1. Eliminar índice anterior si existe
  try {
    await redis.sendCommand(['FT.DROPINDEX', INDEX_NAME, 'DD']);
    console.log(`🗑️ Índice "${INDEX_NAME}" eliminado`);
  } catch {
    console.log(`ℹ️ Índice "${INDEX_NAME}" no existía`);
  }

  // 2. Eliminar claves Redis anteriores
  const keys = await redis.keys('ayuda:*');
  if (keys.length > 0) {
    await redis.del(keys);
    console.log(`🧹 ${keys.length} claves eliminadas`);
  } else {
    console.log('ℹ️ No había claves previas');
  }

  // 3. Crear nuevo índice
  console.log(`⚙️ Creando índice "${INDEX_NAME}"...`);
  await redis.sendCommand([
    'FT.CREATE', INDEX_NAME,
    'ON', 'JSON',
    'PREFIX', '1', 'ayuda:',
    'SCHEMA',
    '$.titulo', 'AS', 'titulo', 'TEXT',
    '$.descripcion', 'AS', 'descripcion', 'TEXT',
    '$.dirigido_a', 'AS', 'dirigido_a', 'TEXT',
    '$.estado_tramite', 'AS', 'estado_tramite', 'TEXT',
    '$.tipo_tramite', 'AS', 'tipo_tramite', 'TEXT',
    '$.tema_subtema', 'AS', 'tema_subtema', 'TEXT',
    '$.normativa', 'AS', 'normativa', 'TEXT',
    '$.documentacion', 'AS', 'documentacion', 'TEXT',
    '$.resultados', 'AS', 'resultados', 'TEXT',
    '$.otros', 'AS', 'otros', 'TEXT',
    '$.servicio', 'AS', 'servicio', 'TEXT',
    '$.url', 'AS', 'url', 'TEXT',
    '$.metadata', 'AS', 'metadata', 'TEXT',
    '$.embedding', 'AS', 'embedding', 'VECTOR', 'FLAT', '6',
    'TYPE', 'FLOAT32',
    'DIM', DIM.toString(),
    'DISTANCE_METRIC', 'COSINE',
  ]);
  console.log(`✅ Índice "${INDEX_NAME}" creado correctamente`);

  // 4. Obtener ayudas de Neon
  const allAyudas = await db.select().from(ayudas);

  if (allAyudas.length === 0) {
    console.warn('⚠️ No se encontraron ayudas en la base de datos');
    await redis.quit();
    return;
  }

  for (const ayuda of allAyudas) {
    try {
      const hash = buildHash(ayuda);
      const textoEmbedding = [
        `Nombre: ${ayuda.nombre ?? ''}`,
        `Descripción: ${ayuda.descripcion ?? ''}`,
        `Estado del trámite: ${ayuda.estado_tramite ?? ''}`,
        `Tipo de trámite: ${ayuda.tipo_tramite ?? ''}`,
        `Tema y subtema: ${ayuda.tema_subtema ?? ''}`,
        `Dirigido a: ${ayuda.dirigido_a ?? ''}`,
        `Normativa: ${ayuda.normativa ?? ''}`,
        `Documentación: ${ayuda.documentacion ?? ''}`,
        `Resultados: ${ayuda.resultados ?? ''}`,
        `Otros: ${ayuda.otros ?? ''}`,
        `Servicio: ${ayuda.servicio ?? ''}`,
      ].filter(Boolean).join('\n\n');

      if (!textoEmbedding) {
        throw new Error('Texto para embedding está vacío');
      }

      // Obtener embedding desde OpenAI
      const embeddingResponse = await openai.embeddings.create({
        input: textoEmbedding,
        model: process.env.EMBEDDING_MODEL!,
      });

      const vector = embeddingResponse.data[0].embedding;
      if (vector.length !== DIM) {
        throw new Error(`El embedding tiene ${vector.length} dimensiones, se esperaban ${DIM}`);
      }

      const embedding = Array.from(new Float32Array(vector)); // Convertir a array para JSON
      const redisKey = `ayuda:${ayuda.id}`;

      // 5. Guardar JSON (incluyendo embedding como array)
      await redis.json.set(redisKey, '$', {
        id: ayuda.id,
        titulo: ayuda.nombre ?? '',
        url: ayuda.url_oficial ?? '',
        descripcion: ayuda.descripcion ?? '',
        estado_tramite: ayuda.estado_tramite ?? '',
        tipo_tramite: ayuda.tipo_tramite ?? '',
        tema_subtema: ayuda.tema_subtema ?? '',
        dirigido_a: ayuda.dirigido_a ?? '',
        normativa: ayuda.normativa ?? '',
        documentacion: ayuda.documentacion ?? '',
        resultados: ayuda.resultados ?? '',
        otros: ayuda.otros ?? '',
        servicio: ayuda.servicio ?? '',
        metadata: JSON.stringify({
          tema: ayuda.tema_subtema ?? '',
          servicio: ayuda.servicio ?? '',
        }),
        hash,
        embedding, // Guardar como array de números
      });

      // 6. Actualizar hash en Neon
      await db
        .update(ayudas)
        .set({ hash_contenido: hash })
        .where(eq(ayudas.id, ayuda.id));

      console.log(`✅ Guardado en Redis: ${ayuda.nombre}`);
    } catch (err) {
      console.error(`❌ Error al procesar ayuda ${ayuda.nombre ?? 'ID: ' + ayuda.id}:`, err);
      continue; // Continúa con la siguiente ayuda
    }
  }

  const total = await redis.dbSize();
  console.log(`📊 Total de claves Redis: ${total}`);

  await redis.quit();
  console.log('🎉 Proceso completo finalizado');
};

main().catch((err) => {
  console.error('❌ Error en la indexación:', err);
  redis.quit();
});
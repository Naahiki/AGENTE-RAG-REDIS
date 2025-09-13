// packages/sources/neon/schemas/ayudas.ts
import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const ayudas = pgTable('ayudas', {
  id: serial('id').primaryKey(),

  estado_tramite: text('estado_tramite'),
  tipo_tramite: text('tipo_tramite'),
  tema_subtema: text('tema_subtema'),
  nombre: text('nombre'), // nombre de la ayuda
  dirigido_a: text('dirigido_a'),
  descripcion: text('descripcion'),
  normativa: text('normativa'),
  documentacion: text('documentacion'),
  url_oficial: text('url_oficial'),
  resultados: text('resultados'),
  otros: text('otros'),
  servicio: text('servicio'),

  // Metadatos
  updated_at: timestamp('updated_at').defaultNow().notNull(),
  hash_contenido: text('hash_contenido')
});

// packages/sources/neon/queries/getAyudas.ts
import { db } from '../client'
import { ayudas } from '../schemas/ayudas'
import { eq } from 'drizzle-orm'

export async function getAyudaById(id: number) {
  const result = await db.select().from(ayudas).where(eq(ayudas.id, id))
  return result[0]
}

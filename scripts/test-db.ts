// scripts/test-db.ts
import 'dotenv/config'
import { drizzle } from 'drizzle-orm/neon-http'
import { neon } from '@neondatabase/serverless'
import { ayudas } from '../packages/sources/neon/schemas/ayudas'

const main = async () => {
  const sql = neon(process.env.DATABASE_URL!)
  const db = drizzle(sql)
  const allAyudas = await db.select().from(ayudas)
  console.log(allAyudas)
}

main()

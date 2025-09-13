// packages/sources/neon/client/index.ts
import * as dotenv from 'dotenv'
dotenv.config() // 👈 esto tiene que ir arriba

import { drizzle } from 'drizzle-orm/neon-http'
import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL!)
export const db = drizzle(sql)

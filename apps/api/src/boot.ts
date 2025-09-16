// apps/api/src/boot.ts
import * as dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const rootEnv = path.resolve(__dirname, "../../../.env");
dotenv.config({ path: rootEnv, override: true });

console.log("[boot] .env file DONDE OSTIAS ESTAS =", rootEnv);
console.log("[boot] CORE_LLM_TIMEOUT_MS =", process.env.CORE_LLM_TIMEOUT_MS);
console.log(
  "[boot] DATABASE_URL =", (process.env.DATABASE_URL || "")
    .replace(/^(.{12}).+(.{4})$/, "$1…$2") || "(missing)"
);

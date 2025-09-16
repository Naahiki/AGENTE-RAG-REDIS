// apps/api/src/boot.ts
import * as dotenv from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
// .../apps/api/src  -> .../apps/api
const apiRoot = resolve(here, "..");
// .../apps/api -> ... (repo root)
const repoRoot = resolve(apiRoot, "..", "..");

// 1) Carga .env de la RAÍZ (si no había variables previas)
dotenv.config({
  path: resolve(repoRoot, ".env"),
  override: false,
});

// 2) Carga .env local de apps/api (si existe) para sobreescribir
dotenv.config({
  path: resolve(apiRoot, ".env"),
  override: true,
});

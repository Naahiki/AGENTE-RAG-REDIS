import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Lee el system prompt desde:
 * 1) process.env.LLM_SYSTEM_PATH (si está definido)
 * 2) packages/llm/system.txt (ruta por defecto, relativa a este paquete)
 */
export function loadSystemPromptFromLLM(): string {
  const envPath = process.env.LLM_SYSTEM_PATH;
  const defaultPath = join(__dirname, "..", "system.txt"); // packages/llm/system.txt

  const pathToRead = envPath || defaultPath;
  return readFileSync(pathToRead, "utf8");
}

import * as dotenv from "dotenv";
dotenv.config();

import { getCompletion, maybeDistillAndPersist, loadSystemPromptFromLLM } from "../packages/llm/src/index";
import { appendTurn, getMemoryAsMessages, setShortSummary } from "../packages/memory/src/index";

async function main() {
  const chatId = `llmtest-${Date.now()}`;
  await setShortSummary(chatId, "Interés en ayudas de internacionalización.");

  const history = await getMemoryAsMessages(chatId);
  const chunks = [
    {
      titulo: "Bonos Impulsa Internacionalización 2025",
      descripcion: "Subvención a pymes navarras para acciones de internacionalización. Plazo: 1–30 septiembre.",
      url: "https://www.navarra.es/..."
    }
  ];

  const systemPrompt = loadSystemPromptFromLLM(); // ← lee packages/llm/system.txt

  const { content, model } = await getCompletion({
    chatId,
    systemPrompt,
    history,
    shortSummary: "Interés en apoyo a internacionalización.",
    chunks,
    user: "¿Requisitos principales de Bonos Impulsa?"
  });

  console.log("🧠 Modelo:", model);
  console.log("➡️ Respuesta:\n", content);

  await appendTurn(chatId, "¿Requisitos principales de Bonos Impulsa?", content);
  await maybeDistillAndPersist(chatId, systemPrompt);
}

main().catch(console.error);

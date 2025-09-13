import * as dotenv from "dotenv";
dotenv.config();

import { handleTurn } from "../packages/core/src/index";

async function main() {
  const chatId = `coretest-${Date.now()}`;
  const q1 = "Busco ayudas para internacionalización";
  const q2 = "¿Requisitos principales de Bonos Impulsa?";

  const r1 = await handleTurn({ chatId, message: q1 });
  console.log("\n#1", r1.type, "\n", r1.content, "\nSources:", r1.sources);

  const r2 = await handleTurn({ chatId, message: q2 });
  console.log("\n#2", r2.type, "\n", r2.content, "\nSources:", r2.sources);

  // Repite la segunda para comprobar cache:
  const r3 = await handleTurn({ chatId, message: q2 });
  console.log("\n#3 (cached)", r3.type, "\n", r3.content);
}

main().catch(console.error);

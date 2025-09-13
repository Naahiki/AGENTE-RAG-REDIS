import * as dotenv from "dotenv";
dotenv.config();

import { getCachedAnswer, cacheAnswer, questionHash } from "../packages/cache/src/index";

async function main() {
  const q = "¿Qué ayudas hay para internacionalización?";
  console.log("hash:", questionHash(q));

  const before = await getCachedAnswer(q);
  console.log("before:", before); // null

  await cacheAnswer(q, "Hay Bonos Impulsa, línea X, etc.", {
    model: "gpt-4o-mini",
    sources: ["https://www.navarra.es/..."]
  });

  const after = await getCachedAnswer(q);
  console.log("after:", after);
}

main().catch(console.error);

// packages/crawler/src/index.ts
import "dotenv/config";

// ⬅️ exportamos runOnce para que apps/api pueda llamarlo
export { runOnce } from "./pipeline";

import { CFG } from "./config";
import { runOnce as runOnceImpl } from "./pipeline";

async function main() {
  if (!CFG.CRAWLER_CRON) {
    // modo one-shot (CLI)
    await runOnceImpl();
    return;
  }

  // modo cron
  const { default: cron } = await import("node-cron");
  console.log(`[crawler] scheduling cron: "${CFG.CRAWLER_CRON}"`);
  cron.schedule(CFG.CRAWLER_CRON, async () => {
    try {
      console.log(`[crawler] tick @ ${new Date().toISOString()}`);
      await runOnceImpl();
    } catch (e) {
      console.error("[crawler] tick error:", e);
    }
  });

  console.log("[crawler] cron started; press Ctrl+C to exit");
}

// Solo ejecuta main si se llama como script (pnpm crawler:once)
// y no cuando se importa desde la API.
if (import.meta.main) {
  main().catch((e) => {
    console.error("[crawler] fatal:", e);
    process.exit(1);
  });
}

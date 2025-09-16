// packages/crawler/src/index.ts
import * as dotenv from "dotenv";
dotenv.config();

import { CFG } from "./config";
import { runOnce } from "./pipeline";

async function main() {
  if (!CFG.CRAWLER_CRON) {
    // modo one-shot
    await runOnce();
    return;
  }

  // modo cron
  const { default: cron } = await import("node-cron");
  console.log(`[crawler] scheduling cron: "${CFG.CRAWLER_CRON}"`);
  cron.schedule(CFG.CRAWLER_CRON, async () => {
    try {
      console.log(`[crawler] tick @ ${new Date().toISOString()}`);
      await runOnce();
    } catch (e) {
      console.error("[crawler] tick error:", e);
    }
  });

  console.log("[crawler] cron started; press Ctrl+C to exit");
}

main().catch((e) => {
  console.error("[crawler] fatal:", e);
  process.exit(1);
});

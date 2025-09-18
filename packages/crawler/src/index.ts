import "dotenv/config";

export { runOnce } from "./pipeline";
export { crawlOneUrl } from "./api";  // 👈 añade esto

import { CFG } from "./config";
import { runOnce as runOnceImpl } from "./pipeline";

async function main() {
  if (!CFG.CRAWLER_CRON) {
    await runOnceImpl();
    return;
  }
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

if (import.meta.main) {
  main().catch((e) => {
    console.error("[crawler] fatal:", e);
    process.exit(1);
  });
}

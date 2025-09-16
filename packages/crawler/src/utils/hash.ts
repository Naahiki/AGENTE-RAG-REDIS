// packages/crawler/src/utils/hash.ts
import crypto from "crypto";
export function sha256(s: string) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

// packages/core/src/guardrails/apply.ts
import { GUARD_cfg } from "./config";
import type { DetectInput } from "./types";
import { detectPreLLM } from "./detect";
import { guardMessage } from "./messages";

/** PRE-LLM */
export async function applyGuardrailsPreLLM(input: DetectInput) {
  if (!GUARD_cfg.enabled || GUARD_cfg.mode === "off") {
    return { blocked: false as const, reply: null as string | null, types: [] as string[] };
  }

  const result = await detectPreLLM(input);

  if (GUARD_cfg.mode === "log") {
    return { blocked: false as const, reply: null, types: result.types };
  }

  if (result.types.length) {
    const msg = guardMessage(result.types, {
      reason: result.reason,
      embedScore: result.embedScore ?? null,
    });
    return { blocked: true as const, reply: msg, types: result.types };
  }

  return { blocked: false as const, reply: null, types: [] as string[] };
}

/** POST-LLM: whitelist de URLs */
export function applyUrlWhitelist(
  content: string,
  allowed: string[]
): { content: string; strippedUrls: string[] } {
  if (!GUARD_cfg.enabled || !GUARD_cfg.requireUrlWhitelist) {
    return { content, strippedUrls: [] };
  }
  if (!allowed?.length) {
    const rx = /\bhttps?:\/\/[^\s)]+/gi;
    const stripped = (content.match(rx) || []).slice();
    return { content: content.replace(rx, "[enlace oculto]"), strippedUrls: stripped };
  }

  const allowSet = new Set(
    allowed.map((u) =>
      u.replace(/^https?:\/\//, "").replace(/\/$/, "").toLowerCase()
    )
  );

  const rx = /\bhttps?:\/\/[^\s)]+/gi;
  const stripped: string[] = [];
  const out = content.replace(rx, (m) => {
    const norm = m.replace(/^https?:\/\//, "").replace(/\/$/, "").toLowerCase();
    if (allowSet.has(norm)) return m;
    const host = norm.split("/")[0];
    const allowedHosts = Array.from(allowSet).map((s) => s.split("/")[0]);
    if (allowedHosts.includes(host)) return m;
    stripped.push(m);
    return "[enlace oculto]";
  });

  return { content: out, strippedUrls: stripped };
}

/** POST-LLM: scope simple (si no hubo RAG y coincide denylist) */
export async function enforceScopeAfterLLM(
  query: string,
  content: string,
  ragDocCount: number
): Promise<{ content: string; overridden: boolean }> {
  if (!GUARD_cfg.enabled || !GUARD_cfg.postScopeCheckEnabled) {
    return { content, overridden: false };
  }
  if ((ragDocCount ?? 0) >= GUARD_cfg.ragMinDocs) {
    return { content, overridden: false };
  }

  const q = String(query || "").trim();
  if (GUARD_cfg.denylistRegex && GUARD_cfg.denylistRegex.test(q)) {
    return { content: guardMessage(["OUT_OF_SCOPE"]), overridden: true };
  }

  return { content, overridden: false };
}

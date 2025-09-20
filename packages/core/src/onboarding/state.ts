// packages/core/src/onboarding/state.ts
import type { UserProfile } from "./extract";
import { INTRO_GUIDE_REQUIRED } from "../config";

type HistoryMsg = { role: "user" | "assistant"; content: string; meta?: any };

export function getLastAskedField(history: HistoryMsg[]): keyof UserProfile | null {
  // Busca el último turno assistant con meta.guidedIntro.lastAsked
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    const f = h?.meta?.guidedIntro?.lastAsked as keyof UserProfile | undefined;
    if (h.role === "assistant" && f) return f;
  }
  return null;
}

export function pickNextField(profile: Partial<UserProfile>): keyof UserProfile | null {
  for (const k of INTRO_GUIDE_REQUIRED as (keyof UserProfile)[]) {
    const val = (profile as any)[k];
    if (!val || String(val).trim() === "") return k;
  }
  return null;
}

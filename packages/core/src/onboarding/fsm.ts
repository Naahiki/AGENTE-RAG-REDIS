// packages/core/src/onboarding/fsm.ts
import { OnboardingInput, OnboardingStatus, UserProfile } from "./types";

export function getStatus(i: OnboardingInput): OnboardingStatus {
  const answered = i.required.filter(
    (k) => !!(i.profile as any)[k] && String((i.profile as any)[k]).trim() !== ""
  );
  const missing = i.required.filter((k) => !answered.includes(k));
  const needMore = answered.length < i.minAnswers;

  // Scope gate SOLO si no faltan mínimas (controlado también desde handleTurn)
  const scopeOK = !i.onlyInScope || !!i.expecting || !!i.inScope;

  // Anti-bucle: respeta maxQuestions
  const capHit = i.askedRecentlyCount >= i.maxQuestions;

  // Caso principal: faltan mínimas → preguntar aunque no haya expecting
  if (needMore && missing.length > 0 && !capHit && scopeOK) {
    const avoid = i.expecting || null;
    const next = pickNextFieldSafe(i.profile, missing as any, avoid);
    return { state: "ask", field: next, answered, missing };
  }

  // Si venimos respondiendo a expecting y aún faltan campos, seguimos preguntando
  if (!!i.expecting && missing.length > 0 && !capHit && scopeOK) {
    const avoid = i.expecting || null;
    const next = pickNextFieldSafe(i.profile, missing as any, avoid);
    return { state: "ask", field: next, answered, missing };
  }

  return { state: "done", answered, missing };
}

export function pickNextFieldSafe(
  _profile: Partial<UserProfile>,
  missing: (keyof UserProfile)[],
  avoid?: string | null
): keyof UserProfile {
  const order: (keyof UserProfile)[] = ["company_size", "sector", "objective"];
  const candidates = (avoid ? missing.filter((m) => m !== avoid) : missing).slice();
  candidates.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return (candidates[0] || missing[0]) as keyof UserProfile;
}

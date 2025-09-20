// packages/core/src/rag/buildQuery.ts
import type { UserProfile } from "../onboarding/types";

export function buildOnboardingQuery(p: Partial<UserProfile>, msg: string) {
  return `perfil:
- empresa: ${p.company_size ?? "-"}
- sector: ${p.sector ?? "-"}
- objetivo: ${p.objective ?? "-"}

consulta:
${msg}`.trim();
}

export function augmentQueryWithProfile(msg: string, p: Partial<UserProfile>) {
  const tags = [p.company_size && `empresa:${p.company_size}`, p.sector && `sector:${p.sector}`, p.objective && `objetivo:${p.objective}`]
    .filter(Boolean)
    .join(" | ");
  return tags ? `${tags}\n\n${msg}` : msg;
}

// packages/core/src/profile.ts
import { INTRO_GUIDE_REQUIRED } from "./config";
import type { UserProfile } from "./onboarding/types";
export { extractProfilePatchFromMessage } from "./onboarding/extract";

export function missingProfileFields(profile: Partial<UserProfile> | null) {
  const p = profile || {};
  return INTRO_GUIDE_REQUIRED.filter((k) => !(p as any)[k] || String((p as any)[k]).trim() === "");
}

export function augmentQueryWithProfile(userQuery: string, profile: Partial<UserProfile> | null) {
  if (!profile) return userQuery;
  const parts: string[] = [];
  if (profile.company_size) parts.push(`tamaño=${profile.company_size}`);
  if (profile.sector) parts.push(`sector=${profile.sector}`);
  if (profile.objective) parts.push(`objetivo=${profile.objective}`);
  if (!parts.length) return userQuery;
  return `${userQuery}\n\n[perfil] ${parts.join(" | ")}`;
}



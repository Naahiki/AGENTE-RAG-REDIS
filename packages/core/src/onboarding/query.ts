import type { UserProfile } from "./types";

/** Construye una query “enriquecida” solo con perfil. */
export function buildOnboardingQuery(profile: Partial<UserProfile>, userMsg?: string) {
  const parts: string[] = [];
  if (profile.company_size) parts.push(`tamaño=${String(profile.company_size).trim()}`);
  if (profile.sector)       parts.push(`sector=${String(profile.sector).trim()}`);
  if (profile.objective)    parts.push(`objetivo=${String(profile.objective).trim()}`);

  // si el usuario además dijo algo concreto, lo anexamos (opcional)
  const base = (userMsg || "").trim();
  const head = base ? base : "ayudas / subvenciones relacionadas";

  return `${head}\n\n[perfil] ${parts.join(" | ")}`.trim();
}

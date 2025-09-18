import { INTRO_GUIDE_REQUIRED } from "./config";

export function extractProfilePatchFromMessage(msg: string) {
  const patch: Record<string, string> = {};
  const rx = /\b(company_size|tamaño|sector|objective|objetivo)\s*[:=]\s*([^\n,.;]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(msg)) !== null) {
    const kRaw = m[1].toLowerCase().trim();
    const v = m[2].trim();
    const k =
      kRaw === "tamaño" ? "company_size" :
      kRaw === "objetivo" ? "objective" :
      kRaw;
    if (["company_size", "sector", "objective"].includes(k) && v) {
      patch[k] = v;
    }
  }
  return patch as Partial<{ company_size: string; sector: string; objective: string }>;
}

export function missingProfileFields(profile: any | null) {
  const p = profile || {};
  return INTRO_GUIDE_REQUIRED.filter((k) => !p[k] || String(p[k]).trim() === "");
}

export function augmentQueryWithProfile(userQuery: string, profile: any | null) {
  if (!profile) return userQuery;
  const parts: string[] = [];
  if (profile.company_size) parts.push(`tamaño=${profile.company_size}`);
  if (profile.sector) parts.push(`sector=${profile.sector}`);
  if (profile.objective) parts.push(`objetivo=${profile.objective}`);
  if (!parts.length) return userQuery;
  return `${userQuery}\n\n[perfil] ${parts.join(" | ")}`;
}

export function renderGuidedIntro(missing: string[]) {
  const labels: Record<string,string> = {
    company_size: "tamaño de la empresa",
    sector: "sector",
    objective: "objetivo",
  };
  const pedir = missing.map((k) => labels[k] || k).join(", ");
  return `Hola. Para afinar la búsqueda, ¿me indicas: ${pedir}?
Ejemplos:
- tamaño: 20 empleados
- sector: agroalimentario
- objetivo: internacionalizar`;
}

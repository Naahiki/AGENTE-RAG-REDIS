// packages/core/src/onboarding/extract.ts
export type UserProfile = {
  company_size?: string;
  sector?: string;
  objective?: string;
};

export function extractProfilePatchFromMessage(
  msg: string,
  ctx?: { expecting?: keyof UserProfile }
): Partial<UserProfile> {
  const patch: Partial<UserProfile> = {};
  const text = msg.trim();

  // 0) Si tenemos "expecting", hacemos parsing contextual robusto.
  if (ctx?.expecting === "company_size") {
    // "15 empleados", "15 emp", "somos 15", "facturamos 3M"
    const m1 = text.match(/\b(\d{1,4})\s*(emplead[oa]s?|emp\.?)\b/i);
    if (m1) patch.company_size = `${m1[1]} empleados`;
    const m2 = text.match(/\bfactur(a|amos)\s+~?\s*([\d.,]+)\s*m\b/i); // "facturamos 5 m"
    if (m2) patch.company_size = `facturación ~${m2[2]}M`;
    const m3 = text.match(/\bsomos\s+(\d{1,4})\b/i); // "somos 20"
    if (m3) patch.company_size = `${m3[1]} empleados`;
  } else if (ctx?.expecting === "sector") {
    // respuestas tipo "agroalimentario", "software b2b", etc.
    if (text.length <= 80 && /\b\w/.test(text)) patch.sector = text;
  } else if (ctx?.expecting === "objective") {
    // "internacionalizar", "contratar comercial", "entrar en Alemania"
    if (text.length <= 140 && /\b\w/.test(text)) patch.objective = text;
  }

  // 1) clave: valor (fallback general)
  const rx = /\b(company_size|tamaño|tamano|sector|objective|objetivo)\s*[:=]\s*([^\n,.;]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(text)) !== null) {
    const kRaw = m[1].toLowerCase().trim();
    const v = m[2].trim();
    const k =
      kRaw === "tamaño" || kRaw === "tamano" ? "company_size" :
      kRaw === "objetivo" ? "objective" :
      kRaw;
    if (["company_size", "sector", "objective"].includes(k) && v) {
      (patch as any)[k] = truncate(v, 200);
    }
  }

  return patch;
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

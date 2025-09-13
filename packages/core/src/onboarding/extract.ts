import type { UserProfile } from "./types";

// Claves que nos interesan con alias frecuentes (no imponemos valores)
const keyAliases: Record<keyof UserProfile, RegExp[]> = {
  company_size: [
    /\b(tamaño|tamano|size|company\s*size)\s*:\s*(.+)$/i,
  ],
  sector: [
    /\b(sector|industria|actividad)\s*:\s*(.+)$/i,
  ],
  objective: [
    /\b(objetivo|objetive|goal|propósito|proposito)\s*:\s*(.+)$/i,
  ],
};

// También soportamos frases tipo "mi sector es ..." o "queremos ..."
const softPatterns: Array<[keyof UserProfile, RegExp]> = [
  ["sector", /\b(sector)\s+(es|:)\s+(.+)/i],
  ["company_size", /\b(somos|tamaño|tamano)\s+(.+)/i],
  ["objective", /\b(queremos|buscamos|mi objetivo|nuestro objetivo)\s+(.+)/i],
];

export function extractProfilePatchFromMessage(msg: string): Partial<UserProfile> {
  const patch: Partial<UserProfile> = {};
  const lines = msg.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // 1) Busca "clave: valor" en cada línea
  for (const [field, patterns] of Object.entries(keyAliases) as Array<[keyof UserProfile, RegExp[]]>) {
    for (const p of patterns) {
      for (const line of lines) {
        const m = line.match(p);
        if (m?.[2]) {
          const value = m[2].trim();
          if (value) patch[field] = truncate(value, 200);
        }
      }
    }
  }

  // 2) Heurística suave en el texto completo (frases naturales)
  const full = msg.trim();
  for (const [field, rx] of softPatterns) {
    const m = full.match(rx);
    if (m) {
      const val = (m[3] ?? m[2] ?? "").trim();
      if (val) patch[field] = truncate(val, 200);
    }
  }

  return patch;
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

// packages/core/guardrails/detect.ts
import { GUARD_cfg } from "./config";
import type { DetectInput, DetectResult, GuardrailType } from "./types";
import { OpenAI } from "openai";

// Cache para la puerta de embeddings (centro de dominio)
let DOMAIN_CENTROID: number[] | null = null;

async function ensureDomainCentroid(openai: OpenAI): Promise<number[]> {
  if (DOMAIN_CENTROID) return DOMAIN_CENTROID;

  const seeds = [
    "ayudas y subvenciones del Gobierno de Navarra",
    "convocatorias, trámites y subvenciones en Navarra",
    "industria, agroalimentaria, internacionalización, empleo, energía",
  ];
  const resp = await openai.embeddings.create({
    model: GUARD_cfg.embedModel,
    input: seeds,
  });
  const vecs = resp.data.map((d) => d.embedding as number[]);
  const dim = vecs[0].length;
  const avg = new Array(dim).fill(0);
  for (const v of vecs) for (let i = 0; i < dim; i++) avg[i] += v[i];
  for (let i = 0; i < dim; i++) avg[i] /= vecs.length;
  DOMAIN_CENTROID = avg;
  return avg;
}

function cosine(a: number[], b: number[]) {
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

export async function detectPreLLM(input: DetectInput): Promise<DetectResult> {
  if (!GUARD_cfg.enabled || GUARD_cfg.mode === "off") {
    return { types: [] };
  }

  const types: GuardrailType[] = [];
  const q = String(input.query || "").trim();
  const tokens = q.split(/\s+/).filter(Boolean).length;

  // Saludo
  if (GUARD_cfg.greetingRegex.test(q) && tokens <= 3) {
    return { types: ["GREET_ONLY"] };
  }

  const ragEmpty = (input.ragDocCount ?? 0) < GUARD_cfg.ragMinDocs;
  if (ragEmpty) types.push("RAG_EMPTY");

  // VAGUE_QUERY solo si RAG está vacío
  if (ragEmpty && tokens < GUARD_cfg.minQueryTokens) {
    types.push("VAGUE_QUERY");
  }

  // Denylist opcional
  if (GUARD_cfg.denylistRegex && GUARD_cfg.denylistRegex.test(q)) {
    types.push("OUT_OF_SCOPE");
    return { types, reason: "denylist" };
  }

  // Puerta por embeddings si RAG está vacío
  if (ragEmpty && GUARD_cfg.useEmbedGate) {
    try {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
      const [centroid, qEmbResp] = await Promise.all([
        ensureDomainCentroid(openai),
        openai.embeddings.create({ model: GUARD_cfg.embedModel, input: q }),
      ]);
      const qVec = qEmbResp.data[0].embedding as number[];
      const score = cosine(centroid, qVec);
      if (score < GUARD_cfg.embedThreshold) {
        types.push("OUT_OF_SCOPE");
        return { types, reason: "embed_gate", embedScore: score };
      }
      return { types, embedScore: score };
    } catch {
      // Si la puerta falla (API/offline), no bloqueamos por embeddings
      return { types };
    }
  }

  return { types };
}

import OpenAI from "openai";
import { createClient } from "redis";

// ==== singletons (init perezoso, sin RedisClientType) ====
let _redis: ReturnType<typeof createClient> | null = null;
function getRedis() {
  if (_redis) return _redis;
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL not set");
  _redis = createClient({ url });
  _redis.on("error", (e) => console.error("[retriever] redis error:", e));
  return _redis!;
}

let _openai: OpenAI | null = null;
function getOpenAI() {
  if (_openai) return _openai!;
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not set");
  _openai = new OpenAI({ apiKey: key });
  return _openai!;
}

const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL ?? "text-embedding-3-small";
const INDEX_NAME = process.env.REDIS_VECTOR_INDEX ?? "ayuda_idx";
const VECTOR_FIELD = process.env.REDIS_VECTOR_FIELD ?? "embedding";

export type RetrievedDoc = {
  id: string;
  titulo: string;
  url: string;
  descripcion?: string;
  estado_tramite?: string;
  tipo_tramite?: string;
  tema_subtema?: string;
  dirigido_a?: string;
  normativa?: string;
  documentacion?: string;
  resultados?: string;
  otros?: string;
  servicio?: string;
  metadata?: Record<string, string>;
  score: number;
};

function safeParse<T>(val?: string): T | undefined {
  try {
    return val ? (JSON.parse(val) as T) : undefined;
  } catch {
    return undefined;
  }
}

export async function retrieveRelevantDocs(query: string, k = 5): Promise<RetrievedDoc[]> {
  const openai = getOpenAI();
  const redis = getRedis();
  if (!redis.isOpen) await redis.connect();

  // 1) Embedding de la query
  const emb = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: query,
  });
  const vec = emb.data[0].embedding;
  const blob = Buffer.from(new Float32Array(vec).buffer);

  // 2) Búsqueda KNN (alias de score)
  const returnFields = [
    "titulo",
    "url",
    "descripcion",
    "estado_tramite",
    "tipo_tramite",
    "tema_subtema",
    "dirigido_a",
    "normativa",
    "documentacion",
    "resultados",
    "otros",
    "servicio",
    "metadata",
    "__score",
  ];

  const args: (string | Buffer)[] = [
    "FT.SEARCH",
    INDEX_NAME,
    `*=>[KNN $K @${VECTOR_FIELD} $BLOB AS __score]`,
    "PARAMS",
    "4",
    "K",
    String(k),
    "BLOB",
    blob,
    "RETURN",
    String(returnFields.length),
    ...returnFields,
    "SORTBY",
    "__score",
    "DIALECT",
    "2",
    "LIMIT",
    "0",
    String(k),
  ];

  const raw = (await redis.sendCommand(args)) as any[];
  const out: RetrievedDoc[] = [];

  if (Array.isArray(raw) && raw.length > 1) {
    for (let i = 1; i < raw.length; i += 2) {
      const key = raw[i] as string;
      const arr = raw[i + 1] as string[];
      const fields: Record<string, string> = {};
      for (let j = 0; j < arr.length; j += 2) fields[arr[j]] = arr[j + 1];

      out.push({
        id: key.replace(/^ayuda:/, ""),
        titulo: fields["titulo"] ?? "",
        url: fields["url"] ?? "",
        descripcion: fields["descripcion"] ?? "",
        estado_tramite: fields["estado_tramite"] ?? "",
        tipo_tramite: fields["tipo_tramite"] ?? "",
        tema_subtema: fields["tema_subtema"] ?? "",
        dirigido_a: fields["dirigido_a"] ?? "",
        normativa: fields["normativa"] ?? "",
        documentacion: fields["documentacion"] ?? "",
        resultados: fields["resultados"] ?? "",
        otros: fields["otros"] ?? "",
        servicio: fields["servicio"] ?? "",
        metadata: safeParse<Record<string, string>>(fields["metadata"]),
        score: Number(fields["__score"] ?? "0"),
      });
    }
  }

  return out;
}

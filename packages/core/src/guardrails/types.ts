// packages/core/guardrails/types.ts
export type GuardrailType =
  | "GREET_ONLY"
  | "VAGUE_QUERY"
  | "RAG_EMPTY"
  | "OUT_OF_SCOPE"
  | "URL_OUT_OF_WHITELIST";

export type DetectInput = {
  /** Texto del usuario */
  query: string;
  /** Número de docs RAG recuperados (para reglas) */
  ragDocCount?: number;
};

export type DetectResult = {
  types: GuardrailType[];
  reason?: "denylist" | "embed_gate" | string;
  embedScore?: number;
};

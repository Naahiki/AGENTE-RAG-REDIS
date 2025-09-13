export type GuardrailType =
  | "RAG_EMPTY"
  | "VAGUE_QUERY"
  | "OUT_OF_SCOPE"
  | "LLM_TIMEOUT"
  | "URL_STRIPPED";

export interface Detection {
  triggered: GuardrailType[];
}

export interface PostProcessOutcome {
  content: string;
  strippedUrls: string[];
}

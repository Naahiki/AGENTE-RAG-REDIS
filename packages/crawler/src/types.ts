// packages/crawler/src/types.ts
export type CrawlOutcome =
  | "UNCHANGED"
  | "SOFT_CHANGED"
  | "CHANGED"
  | "GONE"
  | "BLOCKED"
  | "ERROR";

export type PageUpdateSource =
  | "ajax"
  | "jsonld/meta"
  | "visible"
  | "script"   // <-- añadido
  | "none";

export interface CrawlResult {
  outcome: CrawlOutcome;
  status?: number;
  etag?: string | null;
  httpLastModified?: string | null;

  pageText?: string | null;
  pageISO?: string | null;
  pageUpdateSource?: PageUpdateSource;  // <-- permite "script"

  rawHash?: string | null;
  contentBytes?: number | null;

  html?: string | null;
  error?: string | null;
}

export interface ScrapeFields {
  nombre?: string;
  estado_tramite?: string;
  dirigido_a?: string;
  descripcion?: string;
  documentacion?: string;
  normativa?: string;
  resultados?: string;
  otros?: string;
}

export interface ScrapeResult {
  ok?: boolean;
  changed: boolean;
  textHash?: string | null;
  textLen?: number | null;
  lang?: string | null;

  // NUEVO: lo que hemos extraído del HTML (para imprimir)
  fields?: ScrapeFields;

  // NUEVO: el patch exacto que se sube a Neon (para imprimir)
  patch?: Record<string, any>;

  // opcional: el texto concatenado usado para hashing/embeddings
  text?: string;

  error?: string | null;
}

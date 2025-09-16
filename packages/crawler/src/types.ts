export type CrawlOutcome =
  | "UNCHANGED"
  | "SOFT_CHANGED"
  | "CHANGED"
  | "GONE"
  | "BLOCKED"
  | "ERROR";

export interface CrawlResult {
  outcome: CrawlOutcome;
  status?: number;

  // Señales HTTP
  etag?: string | null;
  httpLastModified?: string | null; // <-- antes era lastModified

  // Señales de la página (HTML)
  pageLastUpdatedAt?: string | null;   // ISO parseado del <span> "Última actualización"
  pageLastUpdatedText?: string | null; // Texto bruto del span
  pageUpdateSource?: "ajax" | "jsonld/meta" | "visible" | "none";
  // Huellas / métricas
  rawHash?: string | null;        // hash "estable" que guardas en raw_hash
  contentBytes?: number | null;

  // Pipeline
  html?: string | null;           // solo si cambia o si se fuerza
  error?: string | null;
  notes?: Record<string, any>;
}

export interface ScrapeResult {
  ok: boolean;
  changed?: boolean;              // <-- expone si el texto útil ha cambiado
  textHash?: string | null;
  textLen?: number;
  fields?: Partial<{
    descripcion: string;
    documentacion: string;
    normativa: string;
    dirigido_a: string;
  }>;
  meta?: Record<string, any>;
  error?: string | null;
}

export interface EmbedResult {
  ok: boolean;
  dims?: number;
  error?: string | null;
  wroteHistory?: boolean;
  wrotePointer?: boolean;
  skippedBecauseSameHash?: boolean; // <-- útil para idempotencia
}

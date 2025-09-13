// packages/llm/src/prompt.ts
type Chunk = {
  titulo?: string; descripcion?: string; url?: string;
  estado_tramite?: string; tipo_tramite?: string; tema_subtema?: string;
  dirigido_a?: string; normativa?: string; documentacion?: string;
  resultados?: string; otros?: string; servicio?: string;
};

type Msg = { role: "system" | "user" | "assistant"; content: string };

function renderChunk(c: Chunk, i: number) {
  const L = (k: string, v?: string) => v ? `- ${k}: ${v}` : null;
  const lines = [
    `#${i} ${c.titulo ?? "Sin título"}`,
    L("Estado del trámite", c.estado_tramite),
    L("Tipo de trámite", c.tipo_tramite),
    L("Tema y subtema", c.tema_subtema),
    L("Dirigido a / destinatarios", c.dirigido_a),
    L("Breve descripción", c.descripcion),
    L("Normativa relacionada", c.normativa),
    L("Documentación a presentar", c.documentacion),
    L("Resultados", c.resultados),
    L("Otros campos", c.otros),
    L("Servicio", c.servicio),
    L("Enlace oficial", c.url),
  ].filter(Boolean);
  return lines!.join("\n");
}

export function buildMessages(opts: {
  system: string;
  longSummary?: string | null;
  shortSummary?: string | null;
  history: { role: "user" | "assistant"; content: string }[];
  chunks: Chunk[];
  user: string;
}): Msg[] {
  const msgs: Msg[] = [];

  msgs.push({ role: "system", content: opts.system });
  if (opts.longSummary) msgs.push({ role: "system", content: `Resumen persistente de la conversación:\n${opts.longSummary}` });
  if (opts.shortSummary) msgs.push({ role: "system", content: `Resumen breve reciente:\n${opts.shortSummary}` });

  // historial reciente
  for (const m of opts.history) msgs.push(m as Msg);

  // ⬇️ contexto RAG (fichas completas)
  if (opts.chunks?.length) {
    const ctx = opts.chunks.map((c, i) => renderChunk(c, i + 1)).join("\n\n");
    msgs.push({
      role: "system",
      content: `Contexto factual recuperado (usa y cita cuando proceda; no inventes):\n${ctx}`
    });
  }

  // pregunta actual
  msgs.push({ role: "user", content: opts.user });
  return msgs;
}

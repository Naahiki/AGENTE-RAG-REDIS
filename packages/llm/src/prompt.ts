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
  urlWhitelist?: string[];            // <— NUEVO
  ragEmptyBehavior?: "none" | "ask_for_name_or_link"; // <— NUEVO
}): Msg[] {
  const msgs: Msg[] = [];

  msgs.push({ role: "system", content: opts.system });
  if (opts.longSummary) msgs.push({ role: "system", content: `Resumen persistente de la conversación:\n${opts.longSummary}` });
  if (opts.shortSummary) msgs.push({ role: "system", content: `Resumen breve reciente:\n${opts.shortSummary}` });

  // Instrucciones de guard/whitelist
  if (opts.urlWhitelist?.length) {
    msgs.push({
      role: "system",
      content:
        "Reglas de citación y enlaces:\n" +
        "- Solo puedes citar o mostrar URLs de esta whitelist.\n" +
        opts.urlWhitelist.map(u => `  • ${u}`).join("\n"),
    });
  }
  if (opts.ragEmptyBehavior === "ask_for_name_or_link") {
    msgs.push({
      role: "system",
      content: [
        "No se ha recuperado contexto factual suficiente.",
        "Antes de responder, pide al usuario el nombre exacto de la ayuda o el enlace oficial.",
        "No inventes contenido; solicita 1–2 datos mínimos para recuperar la ficha correcta.",
      ].join("\n")
    });
  }

  // historial
  for (const m of opts.history) msgs.push(m as Msg);

  // contexto RAG
  if (opts.chunks?.length) {
    const ctx = opts.chunks.map((c, i) => renderChunk(c, i + 1)).join("\n\n");
    msgs.push({
      role: "system",
      content: `Contexto factual recuperado (usa y cita cuando proceda; no inventes):\n${ctx}`
    });
  }

  // pregunta
  msgs.push({ role: "user", content: opts.user });
  return msgs;
}

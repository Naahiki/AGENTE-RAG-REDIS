export function makeFallbackFromChunks(chunks: any[]) {
  if (!chunks.length) return "No he podido generar con el modelo y no hay contexto recuperado.";
  const lines: string[] = [
    "No he podido completar la generación con el modelo. Te dejo la información del contexto recuperado:",
  ];
  for (const c of chunks) {
    const t = c.titulo ?? "Sin título";
    const u = c.url ?? "-";
    const d = c.descripcion ?? "";
    lines.push(`- ${t}${u !== "-" ? ` — ${u}` : ""}${d ? `\n  ${d}` : ""}`);
  }
  lines.push("\n### Fichas completas");
  for (const c of chunks) {
    const nombre = c.titulo ?? "N/D";
    lines.push(`#### ${nombre}`);
    lines.push(`- Estado del trámite: ${c.estado_tramite ?? "N/D"}`);
    lines.push(`- Tipo de trámite: ${c.tipo_tramite ?? "N/D"}`);
    lines.push(`- Tema y subtema: ${c.tema_subtema ?? "N/D"}`);
    lines.push(`- Dirigido a / destinatarios: ${c.dirigido_a ?? "N/D"}`);
    lines.push(`- Breve descripción: ${c.descripcion ?? "N/D"}`);
    lines.push(`- Normativa relacionada: ${c.normativa ?? "N/D"}`);
    lines.push(`- Documentación a presentar: ${c.documentacion ?? "N/D"}`);
    lines.push(`- Resultados: ${c.resultados ?? "N/D"}`);
    lines.push(`- Otros campos: ${c.otros ?? "N/D"}`);
    lines.push(`- Servicio: ${c.servicio ?? "N/D"}`);
    lines.push(`- Enlace oficial: ${c.url ?? "N/D"}`);
    if (c.url) lines.push(`Fuente: ${c.url}`);
    lines.push("");
  }
  lines.push("\n_(Respuesta de respaldo sin LLM)_");
  return lines.join("\n");
}

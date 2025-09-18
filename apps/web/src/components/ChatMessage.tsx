// apps/web/src/components/ChatMessage.tsx
import Markdown from "./Markdown";

export function ChatMessage({ msg }: { msg: { role: "user"|"assistant"; content: string; sources?: string[]; type?: string } }) {
  const isFallback = msg.role === "assistant" && msg.content.startsWith("No he podido completar");
  const [intro, fichas] = isFallback
    ? msg.content.split("\n### Fichas completas")
    : [msg.content, ""];

  return (
    <div className={`rounded-2xl p-3 ${msg.role==="assistant" ? "bg-gray-50" : "bg-blue-50"}`}>
      {isFallback && (
        <div className="mb-2 text-xs text-amber-700 bg-amber-100 border border-amber-200 rounded px-2 py-1">
          Respuesta generada con información recuperada (sin LLM).
        </div>
      )}

      {/* Intro / respuesta principal */}
      <Markdown text={intro} />

      {/* “Fichas completas” como acordeón simple (opcional) */}
      {isFallback && fichas?.trim() && (
        <details className="mt-3 bg-white rounded border p-2">
          <summary className="cursor-pointer font-semibold">Fichas completas</summary>
          <div className="mt-2">
            <Markdown text={`### Fichas completas${fichas}`} />
          </div>
        </details>
      )}

      {/* Fuentes como chips si el backend las envía en `sources` */}
      {/* {msg.sources?.length ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {msg.sources.map((u) => (
            <a key={u} href={u} target="_blank" rel="noopener noreferrer"
               className="text-[11px] px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 border">
              Fuente
            </a>
          ))}
        </div>
      ) : null} */}
    </div>
  );
}

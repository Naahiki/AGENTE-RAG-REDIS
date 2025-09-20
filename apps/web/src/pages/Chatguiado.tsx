// pages/Chatguiado.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Msg = { role: "user" | "assistant"; content: string; sources?: string[] };

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

function genChatId() {
  const prev = localStorage.getItem("chatId");
  if (prev) return prev;
  const id = `web-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  localStorage.setItem("chatId", id);
  return id;
}

function SourcesCollapse({ sources }: { sources: string[] }) {
  if (!sources?.length) return null;
  const cleanUrl = (url: string) =>
    url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
  return (
    <div className="mt-3">
      <div className="collapse collapse-arrow bg-base-200">
        <input type="checkbox" />
        <div className="collapse-title text-sm font-medium">Fuentes</div>
        <div className="collapse-content">
          <ul className="list-disc pl-5 space-y-1">
            {sources.map((s, k) => (
              <li key={k}>
                <a className="link" href={s} target="_blank" rel="noreferrer">
                  {cleanUrl(s)}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default function Chatguiado() {
  const chatId = useMemo(genChatId, []);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingIntro, setLoadingIntro] = useState(true);
  const [messages, setMessages] = useState<Msg[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, sending, loadingIntro]);

  // 1) Primer mensaje: mini-entrevista desde el backend
  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const res = await fetch(
          `${API_URL}/intro?chatId=${encodeURIComponent(chatId)}`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: { content: string; sources?: string[] } = await res.json();
        if (!cancelled) {
          setMessages([
            { role: "assistant", content: data.content, sources: data.sources || [] },
          ]);
        }
      } catch {
        if (!cancelled) {
          // Fallback si el backend aún no expone /intro
          setMessages([
            {
              role: "assistant",
              content:
                "Para empezar, ¿qué tamaño tiene tu empresa?\n\n_Responde libremente (p. ej., «somos 40 personas»)._",
            },
          ]);
        }
      } finally {
        if (!cancelled) setLoadingIntro(false);
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [chatId]);

  // 2) Envío de mensajes del usuario → siempre a /chat
  async function sendMessage() {
    const text = input.trim();
    if (!text || sending) return;

    setMessages((m) => [...m, { role: "user", content: text }]);
    setInput("");
    setSending(true);

    try {
      const res = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId, message: text }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { type: string; content: string; sources?: string[] } =
        await res.json();
      setMessages((m) => [
        ...m,
        { role: "assistant", content: data.content, sources: data.sources || [] },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content:
            "Lo siento, ha ocurrido un error. Intenta de nuevo en unos segundos.",
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <div className="min-h-dvh flex flex-col bg-base-100">
      {/* Header */}
      <header className="navbar bg-base-100 border-b">
        <div className="flex-1">
          <div className="flex flex-col">
            <span className="text-xl font-semibold">Agente Ayudas Navarra</span>
            <span className="text-xs opacity-70 -mt-1">Chat guiado</span>
          </div>
        </div>
      </header>

      {/* Chat */}
      <main className="flex-1 container mx-auto max-w-3xl w-full px-4 py-4">
        <div className="flex flex-col gap-4">
          {loadingIntro && (
            <div className="chat chat-start">
              <div className="chat-bubble">
                <span className="loading loading-dots loading-sm" />
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div
              key={i}
              className={`chat ${m.role === "assistant" ? "chat-start" : "chat-end"}`}
            >
              <div className="chat-bubble max-w-[90%] prose prose-sm dark:prose-invert">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {m.content}
                </ReactMarkdown>
                {!!m.sources?.length && <SourcesCollapse sources={m.sources} />}
              </div>
            </div>
          ))}

          {sending && !loadingIntro && (
            <div className="chat chat-start">
              <div className="chat-bubble">
                <span className="loading loading-dots loading-sm" />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </main>

      {/* Composer */}
      <footer className="border-t bg-base-100">
        <div className="container mx-auto max-w-3xl w-full px-4 py-3">
          <div className="join w-full">
            <textarea
              className="textarea textarea-bordered join-item w-full"
              placeholder="Escribe tu mensaje… (Enter para enviar, Shift+Enter para salto de línea)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              rows={2}
              disabled={sending || loadingIntro}
            />
            <button
              className="btn btn-primary join-item"
              onClick={sendMessage}
              disabled={sending || loadingIntro || !input.trim()}
              aria-label="Enviar"
            >
              {sending ? "Enviando…" : "Enviar"}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

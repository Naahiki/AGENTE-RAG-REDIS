import React, { useEffect, useMemo, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string; sources?: string[] };

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

function genChatId() {
  const prev = localStorage.getItem("chatId");
  if (prev) return prev;
  const id = `web-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  localStorage.setItem("chatId", id);
  return id;
}

function Accordion({ sources }: { sources: string[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const cleanUrl = (url: string) =>
    url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return (
    <div className="sources">
      <div className="accordion-header" onClick={() => setIsOpen(!isOpen)}>
        Fuentes {isOpen ? "▼" : "▲"}
      </div>
      <div className={`accordion-content ${isOpen ? "open" : "closed"}`}>
        <ul className="list-disc pl-5">
          {sources.map((s, k) => (
            <li key={k}>
              <a href={s} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                {cleanUrl(s)}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function Chat() {
  const chatId = useMemo(genChatId, []);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "¡Hola! Soy el asistente de Ayudas del Gobierno de Navarra. Pregúntame por una ayuda concreta o tu caso (p. ej. “Bonos Impulsa”, “requisitos contratación internacionalización”).",
    },
  ]);

  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, sending]);

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
      const data: { type: string; content: string; sources?: string[] } = await res.json();
      setMessages((m) => [...m, { role: "assistant", content: data.content, sources: data.sources || [] }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "Lo siento, ha ocurrido un error. Intenta de nuevo en unos segundos." }]);
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <div className="app">
      <header className="header">
        <div className="title">Agente Ayudas Navarra</div>
        <div className="subtitle">RAG + Memoria (demo)</div>
      </header>

      <main className="chat">
        {messages.map((m, i) => (
          <div key={i} className={`row ${m.role}`}>
            <div className="bubble">
              <div className="content">{m.content}</div>
              {!!m.sources?.length && <Accordion sources={m.sources} />}
            </div>
          </div>
        ))}

        {sending && (
          <div className="row assistant">
            <div className="bubble typing">
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </main>

      <footer className="composer">
        <input
          className="input"
          placeholder="Escribe tu mensaje y pulsa Enter…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={sending}
        />
        <button className="btn" onClick={sendMessage} disabled={sending || !input.trim()}>
          Enviar
        </button>
      </footer>
    </div>
  );
}

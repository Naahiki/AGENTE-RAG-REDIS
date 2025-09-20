import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Msg = {
  role: "user" | "assistant";
  content: string;
  sources?: string[];
  model?: string; // para marcar "guided-intro"
};

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
  const [cfg, setCfg] = useState<{ INTRO_GUIDE_ENABLED: boolean } | null>(null);

  // Panel admin: visible con ?admin=1
  const [admin, setAdmin] = useState(false);
  const [adminKey, setAdminKey] = useState<string>(() => localStorage.getItem("adminKey") || "");
  const [savingFlag, setSavingFlag] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, sending, loadingIntro]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setAdmin(params.get("admin") === "1");
  }, []);

  // Cargar config backend
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API_URL}/config`);
        if (r.ok) {
          setCfg(await r.json());
        } else {
          console.error("GET /config status", r.status);
        }
      } catch (e) {
        console.error("GET /config error", e);
      }
    })();
  }, []);

  // Cargar primer mensaje (/intro)
  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      try {
        const res = await fetch(`${API_URL}/intro?chatId=${encodeURIComponent(chatId)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: { content: string; sources?: string[]; model?: string } = await res.json();
        if (!cancelled) {
          setMessages([{ role: "assistant", content: data.content, sources: data.sources || [], model: data.model }]);
        }
      } catch {
        if (!cancelled) {
          setMessages([
            {
              role: "assistant",
              content:
                "Para empezar, ¿qué tamaño tiene tu empresa?\n\n_Responde libremente (p. ej., «somos 40 personas»)._",
              model: "guided-intro",
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

  // Enviar mensajes → /chat
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
      const data: { type: string; content: string; sources?: string[]; model?: string } = await res.json();
      setMessages((m) => [
        ...m,
        { role: "assistant", content: data.content, sources: data.sources || [], model: data.model },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Lo siento, ha ocurrido un error. Intenta de nuevo en unos segundos." },
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

  // === Admin: checkbox simple SIEMPRE clicable ===
  async function onIntroCheckboxChange(e: React.ChangeEvent<HTMLInputElement>) {
    const nextChecked = e.target.checked;
    const current = cfg || { INTRO_GUIDE_ENABLED: false };

    // Si no hay key, la pedimos (y persistimos)
    let key = adminKey;
    if (!key) {
      key = window.prompt("Introduce la ADMIN_KEY del API:") || "";
      if (!key) {
        // Revertimos visualmente el checkbox sin tocar backend
        e.target.checked = current.INTRO_GUIDE_ENABLED;
        return;
      }
      setAdminKey(key);
      localStorage.setItem("adminKey", key);
    }

    // Update optimista
    setCfg({ ...current, INTRO_GUIDE_ENABLED: nextChecked });
    setSavingFlag(true);

    try {
      const res = await fetch(`${API_URL}/admin/flags`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Key": key,
        },
        body: JSON.stringify({ INTRO_GUIDE_ENABLED: nextChecked }),
      });

      if (!res.ok) {
        // Rollback
        setCfg({ ...current, INTRO_GUIDE_ENABLED: !nextChecked });
        if (res.status === 401) {
          alert("No autorizado: la ADMIN_KEY no coincide con el backend.");
        } else {
          const text = await res.text().catch(() => "");
          alert(`Error guardando flags (${res.status}): ${text || "desconocido"}`);
        }
        return;
      }

      const newCfg = await res.json();
      setCfg(newCfg); // Estado real del servidor
    } catch {
      setCfg({ ...current, INTRO_GUIDE_ENABLED: !nextChecked }); // rollback
      alert("Error de red guardando flags");
    } finally {
      setSavingFlag(false);
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

        <div className="flex items-center gap-3">
          {/* Badge estado intro */}
          <span
            className={`badge ${cfg?.INTRO_GUIDE_ENABLED ? "badge-success" : "badge-ghost"} text-xs`}
            title="Estado del onboarding"
          >
            Onboarding: {cfg?.INTRO_GUIDE_ENABLED ? "ON" : "OFF"}
          </span>

          {/* Panel admin simple (checkbox nativo SIEMPRE clicable) */}
          {/* {admin && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                className="input input-bordered input-xs w-44"
                placeholder="Admin key"
                value={adminKey}
                onChange={(e) => {
                  setAdminKey(e.target.value);
                  localStorage.setItem("adminKey", e.target.value);
                }}
                title="Se guarda en localStorage"
              />
              <div className="flex items-center gap-2">
                <input
                  id="introToggle"
                  type="checkbox"
                  // 👇 NUNCA deshabilitamos el checkbox; así siempre es clicable
                  checked={!!cfg?.INTRO_GUIDE_ENABLED}
                  onChange={onIntroCheckboxChange}
                  style={{ cursor: "pointer" }}
                />
                <label htmlFor="introToggle" style={{ cursor: "pointer" }}>
                  Intro
                </label>
                {savingFlag && <span className="loading loading-dots loading-xs" />}
              </div>
            </div>
          )} */}
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
            <div key={i} className={`chat ${m.role === "assistant" ? "chat-start" : "chat-end"}`}>
              <div className="chat-bubble max-w-[90%] prose prose-sm dark:prose-invert">
                {m.role === "assistant" && m.model === "guided-intro" && (
                  <div className="mb-1">
                    <span className="badge badge-info badge-sm">Onboarding</span>
                  </div>
                )}
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
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

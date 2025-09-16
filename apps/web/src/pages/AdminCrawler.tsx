import React, { useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";

export default function AdminCrawler() {
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string>("");

  async function runOnce() {
    setRunning(true);
    setLog("");
    try {
      const res = await fetch(`${API_BASE}/crawler/run-once`, { method: "POST" });
      const data = await res.json();
      setLog(JSON.stringify(data, null, 2));
    } catch (e: any) {
      setLog(`ERROR: ${e?.message || String(e)}`);
    } finally {
      setRunning(false);
    }
  }

  async function listAudit() {
    setRunning(true);
    setLog("");
    try {
      const res = await fetch(`${API_BASE}/crawler/audit?limit=50`);
      const data = await res.json();
      setLog(JSON.stringify(data, null, 2));
    } catch (e: any) {
      setLog(`ERROR: ${e?.message || String(e)}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div style={{ padding: 12 }}>
      <h1>Admin / Crawler</h1>
      <p style={{ color: "#666", marginBottom: 12 }}>
        API Base: <code>{API_BASE}</code>
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={runOnce} disabled={running}>▶️ Ejecutar crawler una vez</button>
        <button onClick={listAudit} disabled={running}>📜 Ver últimos audits</button>
      </div>

      <pre style={{ whiteSpace: "pre-wrap", background: "#f7f7f7", padding: 12, borderRadius: 8, minHeight: 200 }}>
        {log || "—"}
      </pre>
    </div>
  );
}

// apps/web/src/pages/Admin.tsx
import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";

type Tab = "ayudas" | "audits" | "crawler";

// -----------------------
// Página principal
// -----------------------
export default function Admin() {
  const [tab, setTab] = useState<Tab>("ayudas");
  const [health, setHealth] = useState<string>("…");

  useEffect(() => {
    api.admin
      .health()
      .then(() => setHealth("ok"))
      .catch((e) => setHealth("error: " + e.message));
  }, []);

  return (
    <div style={{ padding: 24, fontFamily: "system-ui, Arial" }}>
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>Admin</h1>
        <p style={{ margin: "4px 0 0 0", color: "#666" }}>API health: {health}</p>
      </header>

      <nav style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <TabBtn value="ayudas" tab={tab} setTab={setTab} label="Ayudas (CRUD)" />
        <TabBtn value="audits" tab={tab} setTab={setTab} label="Auditorías" />
        <TabBtn value="crawler" tab={tab} setTab={setTab} label="Crawler" />
      </nav>

      {tab === "ayudas" && <AyudasCrud />}
      {tab === "audits" && <AuditsPanel />}
      {tab === "crawler" && <CrawlerPanel />}
    </div>
  );
}

function TabBtn({
  value,
  tab,
  setTab,
  label,
}: {
  value: Tab;
  tab: Tab;
  setTab: (t: Tab) => void;
  label: string;
}) {
  const active = tab === value;
  return (
    <button
      onClick={() => setTab(value)}
      style={{
        padding: "6px 10px",
        borderRadius: 8,
        border: "1px solid #ddd",
        background: active ? "#111" : "#fff",
        color: active ? "#fff" : "#111",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

// -----------------------
// CRUD Ayudas
// -----------------------
function AyudasCrud() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [limit, setLimit] = useState(100);
  const [q, setQ] = useState("");
  const [form, setForm] = useState<{ nombre: string; url_oficial: string }>({
    nombre: "",
    url_oficial: "",
  });

  const load = async () => {
    try {
      setBusy(true);
      const data = await api.ayudas.list(limit, q || undefined);
      setRows(data as any[]);
    } catch {
      setRows([]);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const create = async () => {
    if (!form.nombre.trim() || !form.url_oficial.trim()) return;
    await api.ayudas.create(form);
    setForm({ nombre: "", url_oficial: "" });
    await load();
  };

  const updateRow = async (id: number, patch: any) => {
    await api.ayudas.update(id, patch);
    await load();
  };

  const remove = async (id: number) => {
    if (!confirm("¿Eliminar ayuda?")) return;
    await api.ayudas.remove(id);
    await load();
  };

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          placeholder="Buscar…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ padding: 6, borderRadius: 8, border: "1px solid #ddd", width: 240 }}
        />
        <input
          type="number"
          min={1}
          max={500}
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
          style={{ width: 100, padding: 6, borderRadius: 8, border: "1px solid #ddd" }}
        />
        <button onClick={load} disabled={busy} style={btnStyle}>
          {busy ? "Cargando…" : "Refrescar"}
        </button>
      </div>

      {/* Crear */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          placeholder="Nombre"
          value={form.nombre}
          onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
          style={{ padding: 6, borderRadius: 8, border: "1px solid #ddd", width: 280 }}
        />
        <input
          placeholder="URL oficial"
          value={form.url_oficial}
          onChange={(e) => setForm((f) => ({ ...f, url_oficial: e.target.value }))}
          style={{ padding: 6, borderRadius: 8, border: "1px solid #ddd", width: 360 }}
        />
        <button onClick={create} style={btnStyle}>+ Crear</button>
      </div>

      <DataTable
        rows={rows}
        editable
        onEdit={(id, patch) => updateRow(id, patch)}
        onDelete={(id) => remove(id)}
      />
    </section>
  );
}

// -----------------------
// Auditorías (3 tablas)
// -----------------------
function AuditsPanel() {
  const [kind, setKind] = useState<"crawl" | "scrape" | "embed">("crawl");
  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <TabMini value="crawl" cur={kind} setCur={setKind} label="Crawl" />
        <TabMini value="scrape" cur={kind} setCur={setKind} label="Scrape" />
        <TabMini value="embed" cur={kind} setCur={setKind} label="Embed" />
      </div>
      <Audit kind={kind} />
    </section>
  );
}
function TabMini<T extends string>({ value, cur, setCur, label }: { value: T; cur: T; setCur: (v: T) => void; label: string }) {
  const active = cur === value;
  return (
    <button onClick={() => setCur(value)} style={{
      padding: "6px 10px",
      borderRadius: 8,
      border: "1px solid #ddd",
      background: active ? "#111" : "#fff",
      color: active ? "#fff" : "#111",
      cursor: "pointer",
    }}>{label}</button>
  );
}

function Audit({ kind }: { kind: "crawl" | "scrape" | "embed" }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [limit, setLimit] = useState(100);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [purging, setPurging] = useState(false);

  const load = async () => {
    try {
      setBusy(true);
      const data = await api.audit.list(kind, limit, q || undefined);
      setRows(data as any[]);
    } catch {
      setRows([]);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const remove = async (id: number) => {
    if (!confirm(`¿Eliminar registro #${id}?`)) return;
    await api.audit.remove(kind, id);
    await load();
  };

  const purge = async () => {
    if (!confirm("¿Purgar registros antiguos (30 días)?")) return;
    setPurging(true);
    try {
      await api.audit.purge(kind, 30);
      await load();
    } finally {
      setPurging(false);
    }
  };

  return (
    <section>
      <header style={{ marginBottom: 12, display: "flex", gap: 8 }}>
        <input
          placeholder="Buscar texto…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ width: 260, padding: 6, borderRadius: 8, border: "1px solid #ddd" }}
        />
        <input
          type="number"
          min={1}
          max={500}
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
          style={{ width: 100, padding: 6, borderRadius: 8, border: "1px solid #ddd" }}
        />
        <button onClick={load} disabled={busy} style={btnStyle}>
          {busy ? "Cargando…" : "Refrescar"}
        </button>
        <button onClick={purge} disabled={purging} style={{ ...btnStyle, background: "#B00020" }}>
          {purging ? "Purgando…" : "Purgar (30d)"}
        </button>
      </header>

      <DataTable rows={rows} onDelete={remove} />
    </section>
  );
}

// -----------------------
// Crawler (acciones)
// -----------------------
function CrawlerPanel() {
  const [url, setUrl] = useState("");
  const [write, setWrite] = useState(false);
  const [embed, setEmbed] = useState(false);
  const [log, setLog] = useState<"info" | "debug">("info");
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<any>(null);

  const canRunOne = useMemo(() => !!url && !busy, [url, busy]);
  const canRunOnce = useMemo(() => !busy, [busy]);

  const runOnce = async () => {
    setBusy(true); setOut(null);
    try {
      const data = await api.crawler.runOnce();
      setOut(data);
    } catch (e: any) {
      setOut({ error: e?.message || String(e) });
    } finally { setBusy(false); }
  };

  const runOne = async () => {
    setBusy(true); setOut(null);
    try {
      const data = await api.crawler.crawlOne({ url, write, embed, log });
      setOut(data);
    } catch (e: any) {
      setOut({ error: e?.message || String(e) });
    } finally { setBusy(false); }
  };

  return (
    <section style={{ display: "grid", gap: 12, maxWidth: 860 }}>
      <div style={{ display: "grid", gap: 6 }}>
        <label>URL (opcional para “crawl one”)</label>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.navarra.es/es/tramites/on/-/line/..."
          style={{ padding: 8, borderRadius: 8, border: "1px solid #ddd" }}
        />
      </div>

      <div style={{ display: "flex", gap: 16 }}>
        <label>
          <input type="checkbox" checked={write} onChange={(e) => setWrite(e.target.checked)} /> write
        </label>
        <label>
          <input type="checkbox" checked={embed} onChange={(e) => setEmbed(e.target.checked)} /> embed
        </label>
        <label>
          log:&nbsp;
          <select value={log} onChange={(e) => setLog(e.target.value as any)}>
            <option value="info">info</option>
            <option value="debug">debug</option>
          </select>
        </label>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={runOnce} disabled={!canRunOnce} style={btnStyle}>
          {busy ? "Lanzando…" : "▶️ Run once (candidates)"}
        </button>
        <button onClick={runOne} disabled={!canRunOne} style={btnStyle}>
          {busy ? "Lanzando…" : "🎯 Crawl one (URL)"}
        </button>
      </div>

      {out && (
        <pre style={{ marginTop: 8, padding: 12, background: "#f7f7f7", borderRadius: 8, overflow: "auto" }}>
          {JSON.stringify(out, null, 2)}
        </pre>
      )}
    </section>
  );
}

// -----------------------
// Tabla genérica
// -----------------------
function DataTable({
  rows,
  editable,
  onEdit,
  onDelete,
}: {
  rows: any[] | null;
  editable?: boolean;
  onEdit?: (id: number, patch: Record<string, any>) => void;
  onDelete?: (id: number) => void;
}) {
  if (!rows) return <p>Cargando…</p>;
  if (!rows.length) return <p>Sin datos.</p>;

  const cols = Object.keys(rows[0] || {});

  return (
    <div style={{ overflow: "auto", maxHeight: "70vh", border: "1px solid #eee", borderRadius: 8 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead style={{ position: "sticky", top: 0, background: "#fafafa" }}>
          <tr>
            {cols.map((c) => (
              <th key={c} style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #eee" }}>
                {c}
              </th>
            ))}
            {(editable || onDelete) && <th style={{ width: 140 }} />}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderBottom: "1px solid #f2f2f2" }}>
              {cols.map((c) => (
                <td key={c} style={{ padding: 8, verticalAlign: "top" }}>
                  {editable
                    ? <Cell value={r[c]} onChange={(v) => onEdit?.(r.id, { [c]: v })} />
                    : renderCell(r[c])}
                </td>
              ))}
              {(editable || onDelete) && (
                <td style={{ padding: 8 }}>
                  {onDelete && (
                    <button onClick={() => onDelete(r.id)} style={{ ...btnStyle, background: "#B00020" }}>
                      Borrar
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cell({ value, onChange }: { value: any; onChange?: (v: any) => void }) {
  const fmt = (v: any) => {
    if (v == null) return <em style={{ color: "#999" }}>null</em>;
    if (typeof v === "string" && /^https?:\/\//.test(v))
      return (
        <a href={v} target="_blank" rel="noreferrer">
          {v}
        </a>
      );
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
      const d = new Date(v);
      return d.toLocaleString();
    }
    if (typeof v === "object") return <code>{JSON.stringify(v)}</code>;
    return String(v);
  };

  // editable solo para strings razonables (nombre/url)
  const asEditable =
    typeof value === "string" &&
    (value.startsWith("http") || value.length < 200);

  if (!asEditable) return fmt(value);

  return (
    <input
      defaultValue={value}
      onBlur={(e) => {
        const v = e.target.value;
        if (v !== value) onChange?.(v);
      }}
      style={{ width: "100%", padding: 6, border: "1px solid #ddd", borderRadius: 6 }}
    />
  );
}

function renderCell(v: any) {
  if (v == null) return <em style={{ color: "#999" }}>null</em>;
  if (typeof v === "string" && /^https?:\/\//.test(v))
    return (
      <a href={v} target="_blank" rel="noreferrer">
        {v}
      </a>
    );
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
    const d = new Date(v);
    return d.toLocaleString();
  }
  if (typeof v === "object") return <code>{JSON.stringify(v)}</code>;
  return String(v);
}

const btnStyle: React.CSSProperties = {
  padding: "6px 10px",
  border: "1px solid #111",
  borderRadius: 8,
  background: "#111",
  color: "#fff",
  cursor: "pointer",
};

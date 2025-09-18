// apps/web/src/pages/Admin.tsx
import { useEffect, useMemo, useRef, useState } from "react";
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
    <div className="min-h-dvh bg-base-100">
      {/* Header */}
      <div className="navbar bg-base-100 border-b">
        <div className="flex-1">
          <span className="btn btn-ghost text-xl">Admin</span>
        </div>
        <div className="flex-none">
          <div
            className={`badge ${
              health === "ok"
                ? "badge-neutral"
                : health.startsWith("error")
                ? "badge-error"
                : "badge-outline"
            } badge-lg`}
          >
            API: {health}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="container mx-auto px-4 py-4">
        <nav className="flex flex-wrap gap-2 mb-4">
          <TabBtn
            value="ayudas"
            tab={tab}
            setTab={setTab}
            label="Ayudas (CRUD)"
          />
          <TabBtn value="audits" tab={tab} setTab={setTab} label="Auditorías" />
          <TabBtn value="crawler" tab={tab} setTab={setTab} label="Crawler" />
        </nav>

        {tab === "ayudas" && <AyudasCrud />}
        {tab === "audits" && <AuditsPanel />}
        {tab === "crawler" && <CrawlerPanel />}
      </div>
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
      className={`btn btn-sm ${
        active ? "btn-primary" : "btn-ghost border border-base-300"
      }`}
    >
      {label}
    </button>
  );
}

/* -----------------------
   CRUD Ayudas  (CARDS + TAGS + AGRUPAR/FILTRAR)
----------------------- */
type GroupBy = "none" | "tipo_tramite" | "estado_tramite" | "tema_subtema";

function AyudasCrud() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [limit, setLimit] = useState(100);
  const [q, setQ] = useState("");
  const [form, setForm] = useState({
    nombre: "",
    url_oficial: "",
    tipo_tramite: "",
    tema_subtema: "",
    servicio: "",
  });

  // Nuevo: estado de agrupación y filtros por tag
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const parseTags = (v: any): string[] => {
    if (!v && v !== 0) return [];
    if (Array.isArray(v)) return v.filter(Boolean).map(String);
    if (typeof v === "string") {
      return v
        .split(/[,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return [String(v)];
    // Nota: esto mismo se usa también en la card
  };

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
    setForm({
      nombre: "",
      url_oficial: "",
      tipo_tramite: "",
      tema_subtema: "",
      servicio: "",
    });
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

  // Conjunto de tags únicos según groupBy
  const availableTags = useMemo(() => {
    if (!rows || groupBy === "none") return [];
    const set = new Set<string>();
    for (const r of rows) {
      parseTags(r[groupBy]).forEach((t) => set.add(t));
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows, groupBy]);

  // Filtrado por tags seleccionados (solo aplica si hay alguno seleccionado)
  const filteredRows = useMemo(() => {
    if (!rows) return null;
    if (groupBy === "none" || selectedTags.length === 0) return rows;
    return rows.filter((r) => {
      const tags = parseTags(r[groupBy]);
      return selectedTags.every((t) => tags.includes(t));
    });
  }, [rows, groupBy, selectedTags]);

  // Agrupación
  const grouped = useMemo(() => {
    if (!filteredRows) return null;
    if (groupBy === "none")
      return { __all__: filteredRows } as Record<string, any[]>;
    const map: Record<string, any[]> = {};
    for (const r of filteredRows) {
      const tags = parseTags(r[groupBy]);
      if (tags.length === 0) {
        map["(Sin etiqueta)"] = map["(Sin etiqueta)"] || [];
        map["(Sin etiqueta)"].push(r);
      } else {
        for (const t of tags) {
          map[t] = map[t] || [];
          map[t].push(r);
        }
      }
    }
    // Ordena grupos por nombre
    return Object.fromEntries(
      Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]))
    );
  }, [filteredRows, groupBy]);

  const toggleTag = (t: string) => {
    setSelectedTags((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    );
  };

  const clearFilters = () => setSelectedTags([]);

  const groupByLabel =
    groupBy === "tipo_tramite"
      ? "Tipo de trámite"
      : groupBy === "estado_tramite"
      ? "Estado del trámite"
      : groupBy === "tema_subtema"
      ? "Tema / subtema"
      : "Sin agrupación";

  return (
    <section className="grid gap-4">
      {/* Filtros y acciones */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          placeholder="Buscar…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="input input-bordered w-60"
        />
        <label className="input input-bordered w-28 flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={500}
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="grow"
          />
          <span className="opacity-60">limit</span>
        </label>
        <button onClick={load} disabled={busy} className="btn btn-primary">
          {busy ? "Cargando…" : "Refrescar"}
        </button>

        {/* Agrupar por */}
        <div className="divider divider-horizontal" />
        <div className="join">
          <button
            className={`btn btn-sm join-item ${
              groupBy === "none"
                ? "btn-neutral"
                : "btn-ghost border border-base-300"
            }`}
            onClick={() => setGroupBy("none")}
          >
            Sin agrupar
          </button>
          <button
            className={`btn btn-sm join-item ${
              groupBy === "tipo_tramite"
                ? "btn-primary"
                : "btn-ghost border border-base-300"
            }`}
            onClick={() => setGroupBy("tipo_tramite")}
          >
            Tipo
          </button>
          <button
            className={`btn btn-sm join-item ${
              groupBy === "estado_tramite"
                ? "btn-primary"
                : "btn-ghost border border-base-300"
            }`}
            onClick={() => setGroupBy("estado_tramite")}
          >
            Estado
          </button>
          <button
            className={`btn btn-sm join-item ${
              groupBy === "tema_subtema"
                ? "btn-primary"
                : "btn-ghost border border-base-300"
            }`}
            onClick={() => setGroupBy("tema_subtema")}
          >
            Tema
          </button>
        </div>
      </div>

      {/* Filtros de tags (si hay agrupación) */}
      {groupBy !== "none" && (
        <div className="card bg-base-100 border border-base-300">
          <div className="card-body gap-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="card-title text-base">
                Filtrar por {groupByLabel}
              </h3>
              {selectedTags.length > 0 && (
                <button
                  className="btn btn-ghost btn-sm border border-base-300"
                  onClick={clearFilters}
                >
                  Limpiar filtros
                </button>
              )}
            </div>
            {availableTags.length === 0 ? (
              <div className="opacity-60 text-sm">
                No hay etiquetas disponibles.
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {availableTags.map((t) => {
                  const active = selectedTags.includes(t);
                  return (
                    <button
                      key={t}
                      className={`badge badge-lg cursor-pointer ${
                        active ? "badge-primary" : "badge-outline"
                      }`}
                      onClick={() => toggleTag(t)}
                      title={t}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Crear */}
      <div className="card bg-base-100 shadow">
        <div className="card-body gap-3">
          <h2 className="card-title">Crear nueva ayuda</h2>

          <div className="flex flex-wrap items-center gap-2">
            <input
              placeholder="Nombre"
              value={form.nombre}
              onChange={(e) =>
                setForm((f) => ({ ...f, nombre: e.target.value }))
              }
              className="input input-bordered w-72"
            />
            <input
              placeholder="URL oficial"
              value={form.url_oficial}
              onChange={(e) =>
                setForm((f) => ({ ...f, url_oficial: e.target.value }))
              }
              className="input input-bordered w-[28rem] max-w-full"
            />
            <input
              placeholder="Tipo de trámite"
              value={form.tipo_tramite}
              onChange={(e) =>
                setForm((f) => ({ ...f, tipo_tramite: e.target.value }))
              }
              className="input input-bordered w-60"
            />
            <input
              placeholder="Tema / Subtema"
              value={form.tema_subtema}
              onChange={(e) =>
                setForm((f) => ({ ...f, tema_subtema: e.target.value }))
              }
              className="input input-bordered w-60"
            />
            <input
              placeholder="Servicio"
              value={form.servicio}
              onChange={(e) =>
                setForm((f) => ({ ...f, servicio: e.target.value }))
              }
              className="input input-bordered w-60"
            />

            <button onClick={create} className="btn btn-primary">
              + Crear
            </button>
          </div>
        </div>
      </div>

      {/* Render de cards: agrupado o no */}
      {groupBy === "none" ? (
        <AyudaCardsList
          rows={filteredRows}
          onDelete={remove}
          onPatch={updateRow}
        />
      ) : (
        <div className="grid gap-6">
          {grouped &&
            Object.entries(grouped).map(([tag, list]) => (
              <section key={tag} className="grid gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm opacity-70">{groupByLabel}:</span>
                  <span className="badge badge-neutral badge-lg">{tag}</span>
                  <span className="text-xs opacity-60">({list.length})</span>
                </div>
                <AyudaCardsList
                  rows={list}
                  onDelete={remove}
                  onPatch={updateRow}
                />
              </section>
            ))}
        </div>
      )}
    </section>
  );
}

/* Cards renderer */
function AyudaCardsList({
  rows,
  onDelete,
  onPatch,
}: {
  rows: any[] | null;
  onDelete: (id: number) => void;
  onPatch: (id: number, patch: Record<string, any>) => void;
}) {
  if (!rows) return <p className="opacity-70">Cargando…</p>;
  if (!rows.length) return <p className="opacity-70">Sin datos.</p>;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((r) => (
        <AyudaCard key={r.id} row={r} onDelete={onDelete} onPatch={onPatch} />
      ))}
    </div>
  );
}

function AyudaCard({
  row,
  onDelete,
  onPatch,
}: {
  row: any;
  onDelete: (id: number) => void;
  onPatch: (id: number, patch: Record<string, any>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [nombre, setNombre] = useState<string>(row.nombre || "");
  const [url, setUrl] = useState<string>(row.url_oficial || "");

  const parseTags = (v: any): string[] => {
    if (!v && v !== 0) return [];
    if (Array.isArray(v)) return v.filter(Boolean).map(String);
    if (typeof v === "string") {
      return v
        .split(/[,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return [String(v)];
  };

  const tipo = parseTags(row.tipo_tramite);
  const estado = parseTags(row.estado_tramite);
  const tema = parseTags(row.tema_subtema);

  const save = async () => {
    const patch: Record<string, any> = {};
    if (nombre !== row.nombre) patch.nombre = nombre;
    if (url !== row.url_oficial) patch.url_oficial = url;
    if (Object.keys(patch).length) await onPatch(row.id, patch);
    setEditing(false);
  };

  const cancel = () => {
    setNombre(row.nombre || "");
    setUrl(row.url_oficial || "");
    setEditing(false);
  };

  const renderDate = (v: any) => {
    if (!v) return <span className="opacity-60">—</span>;
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v))
      return <span>{new Date(v).toLocaleString()}</span>;
    return <span>{String(v)}</span>;
  };

  return (
    <div className="card bg-base-100 border border-base-300">
      <div className="card-body gap-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs opacity-60">ID #{row.id}</div>

            {!editing ? (
              <h3 className="text-lg font-semibold break-words whitespace-pre-wrap">
                {nombre || "—"}
              </h3>
            ) : (
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="input input-bordered w-full"
                placeholder="Nombre"
              />
            )}

            {!editing ? (
              row.url_oficial ? (
                <a
                  href={row.url_oficial}
                  target="_blank"
                  rel="noreferrer"
                  className="link break-all"
                  title={row.url_oficial}
                >
                  {row.url_oficial}
                </a>
              ) : (
                <span className="opacity-60">Sin URL</span>
              )
            ) : (
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="input input-bordered w-full mt-2"
                placeholder="URL oficial"
              />
            )}
          </div>

          {/* Acciones */}
          <div className="flex gap-2">
            {!editing ? (
              <>
                <button
                  className="btn btn-ghost btn-sm border border-base-300"
                  onClick={() => setEditing(true)}
                >
                  Editar
                </button>
                <button
                  className="btn btn-error btn-sm"
                  onClick={() => onDelete(row.id)}
                >
                  Borrar
                </button>
              </>
            ) : (
              <>
                <button className="btn btn-primary btn-sm" onClick={save}>
                  Guardar
                </button>
                <button
                  className="btn btn-ghost btn-sm border border-base-300"
                  onClick={cancel}
                >
                  Cancelar
                </button>
              </>
            )}
          </div>
        </div>

        {/* Tags */}
        {(tipo.length > 0 || estado.length > 0 || tema.length > 0) && (
          <div className="grid gap-2">
            {tipo.length > 0 && (
              <TagRow label="Tipo de trámite" tags={tipo} variant="primary" />
            )}
            {estado.length > 0 && (
              <TagRow
                label="Estado del trámite"
                tags={estado}
                variant="neutral"
              />
            )}
            {tema.length > 0 && (
              <TagRow label="Tema / subtema" tags={tema} variant="outline" />
            )}
          </div>
        )}

        {/* Meta fechas */}
        <div className="mt-1 grid gap-1 text-xs">
          <div>
            <span className="opacity-70">Enlace url: </span>
            <span className="break-words">
              {row.page_last_updated_text || "—"}
            </span>
          </div>
          <div className="opacity-70">
            Último rastreo:{" "}
            <span className="opacity-100">
              {renderDate(row.last_crawled_at)}
            </span>
          </div>
          <div className="opacity-70">
            Último scraping:{" "}
            <span className="opacity-100">
              {renderDate(row.last_scraped_at)}
            </span>
          </div>
          <div className="opacity-70">
            Último embedding:{" "}
            <span className="opacity-100">
              {renderDate(row.last_embedded_at)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function TagRow({
  label,
  tags,
  variant, // "primary" | "neutral" | "outline"
}: {
  label: string;
  tags: string[];
  variant: "primary" | "neutral" | "outline";
}) {
  const badgeClass =
    variant === "primary"
      ? "badge badge-primary"
      : variant === "neutral"
      ? "badge badge-neutral"
      : "badge badge-outline";
  return (
    <div className="flex items-start gap-2">
      <div className="text-xs opacity-70 min-w-fit mt-1">{label}:</div>
      <div className="flex flex-wrap gap-2">
        {tags.map((t, i) => (
          <span key={i} className={`${badgeClass} text-xs`}>
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

/* -----------------------
   Auditorías (sin cambios)
----------------------- */
function AuditsPanel() {
  return (
    <section className="grid gap-6">
      <AuditCard kind="crawl" title="Crawl audit" />
      <AuditCard kind="scrape" title="Scrape audit" />
      <AuditCard kind="embed" title="Embed audit" />
    </section>
  );
}

function AuditCard({
  kind,
  title,
}: {
  kind: "crawl" | "scrape" | "embed";
  title: string;
}) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [limit, setLimit] = useState(100);
  const [busy, setBusy] = useState(false);
  const [purging, setPurging] = useState(false);

  const load = async () => {
    try {
      setBusy(true);
      const data = await api.audit.list(kind, limit);
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
    <section className="card bg-base-100 shadow">
      <div className="card-body gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="card-title">{title}</h3>
          <label className="input input-bordered w-28 flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={500}
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="grow"
            />
            <span className="opacity-60">limit</span>
          </label>
          <button onClick={load} disabled={busy} className="btn btn-primary">
            {busy ? "Cargando…" : "Refrescar"}
          </button>
          <button onClick={purge} disabled={purging} className="btn btn-error">
            {purging ? "Purgando…" : "Purgar (30d)"}
          </button>
        </div>

        <DataTable rows={rows} onDelete={remove} />
      </div>
    </section>
  );
}

/* -----------------------
   Crawler (sin cambios)
----------------------- */
function CrawlerPanel() {
  const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";

  const [url, setUrl] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const esRef = useRef<EventSource | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const canRunOnce = useMemo(() => !streaming, [streaming]);
  const canRunOne = useMemo(() => !!url && !streaming, [url, streaming]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines.length, streaming]);

  const append = (s: string) => setLines((prev) => [...prev, s]);
  const stop = () => {
    try {
      esRef.current?.close();
    } catch {}
    esRef.current = null;
    setStreaming(false);
  };

  const runOnce = () => {
    if (streaming) return;
    setLines([]);
    setStreaming(true);
    const u = new URL("/admin/crawler/run-once/stream", API_BASE);
    const es = new EventSource(u.toString());
    esRef.current = es;
    es.onopen = () => append("[stream] conectado");
    es.onmessage = (evt) => {
      if (evt?.data) append(String(evt.data));
    };
    es.onerror = () => {
      append("[stream] fin");
      stop();
    };
  };

  const runOne = () => {
    if (!url || streaming) return;
    setLines([]);
    setStreaming(true);
    const u = new URL("/admin/crawler/crawl-one/stream", API_BASE);
    u.searchParams.set("url", url); // el backend decide auditoría según .env
    const es = new EventSource(u.toString());
    esRef.current = es;
    es.onopen = () => append("[stream] conectado");
    es.onmessage = (evt) => {
      if (evt?.data) append(String(evt.data));
    };
    es.onerror = () => {
      append("[stream] fin");
      stop();
    };
  };

  return (
    <section className="grid gap-4 max-w-[900px]">
      <div className="alert alert-neutral">
        <span>
          Las auditorías se guardan automáticamente si están activadas en el
          backend (<code>.env</code>).
        </span>
      </div>

      <div className="form-control gap-2">
        <label className="label">
          <span className="label-text">URL (para “Crawl one”)</span>
        </label>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.navarra.es/es/tramites/on/-/line/..."
          className="input input-bordered"
          disabled={streaming}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={runOnce}
          disabled={!canRunOnce}
          className="btn btn-primary"
        >
          {streaming ? "Lanzando…" : "▶️ Run once"}
        </button>
        <button
          onClick={runOne}
          disabled={!canRunOne}
          className="btn btn-outline btn-primary"
        >
          {streaming ? "Lanzando…" : " Crawl one"}
        </button>
        <button onClick={stop} disabled={!streaming} className="btn btn-error">
          ⏹️ Stop
        </button>
      </div>

      <div className="mockup-code min-h-40 max-h-[420px] overflow-auto text-sm">
        {lines.length === 0 ? (
          <pre data-prefix="$" className="opacity-70">
            <code>{streaming ? "Conectando…" : "Sin logs."}</code>
          </pre>
        ) : (
          lines.map((ln, i) => (
            <pre key={i} data-prefix="$">
              <code>{ln}</code>
            </pre>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </section>
  );
}

/* -----------------------
   Tabla genérica (otras)
----------------------- */
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
  if (!rows) return <p className="opacity-70">Cargando…</p>;
  if (!rows.length) return <p className="opacity-70">Sin datos.</p>;

  const cols = Object.keys(rows[0] || {});
  return (
    <div className="overflow-auto max-h-[70vh] border border-base-300 rounded-xl">
      <table className="table table-zebra text-sm">
        <thead className="sticky top-0 bg-base-200 z-10">
          <tr>
            {cols.map((c) => (
              <th key={c} className="whitespace-nowrap">
                {c}
              </th>
            ))}
            {(editable || onDelete) && <th className="w-36" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="align-top">
              {cols.map((c) => (
                <td key={c}>
                  {editable ? (
                    <Cell
                      value={r[c]}
                      onChange={(v) => onEdit?.(r.id, { [c]: v })}
                    />
                  ) : (
                    renderCell(r[c])
                  )}
                </td>
              ))}
              {(editable || onDelete) && (
                <td>
                  {onDelete && (
                    <button
                      onClick={() => onDelete(r.id)}
                      className="btn btn-error btn-sm"
                    >
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

function Cell({
  value,
  onChange,
}: {
  value: any;
  onChange?: (v: any) => void;
}) {
  const fmt = (v: any) => {
    if (v == null) return <em className="opacity-60">null</em>;
    if (typeof v === "string" && /^https?:\/\//.test(v))
      return (
        <a className="link" href={v} target="_blank" rel="noreferrer">
          {v}
        </a>
      );
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v))
      return <span>{new Date(v).toLocaleString()}</span>;
    if (typeof v === "object")
      return <code className="text-xs">{JSON.stringify(v)}</code>;
    return String(v);
  };

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
      className="input input-bordered input-sm w-full"
    />
  );
}

function renderCell(v: any) {
  if (v == null) return <em className="opacity-60">null</em>;
  if (typeof v === "string" && /^https?:\/\//.test(v))
    return (
      <a className="link" href={v} target="_blank" rel="noreferrer">
        {v}
      </a>
    );
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v))
    return <span>{new Date(v).toLocaleString()}</span>;
  if (typeof v === "object")
    return <code className="text-xs">{JSON.stringify(v)}</code>;
  return String(v);
}

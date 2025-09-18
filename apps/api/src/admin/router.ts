// apps/api/src/admin/router.ts
import { Router } from "express";
import { z } from "zod";
import { neon } from "@neondatabase/serverless";

// En dev con tsx puedes usar este import relativo al package del crawler.
// Si más adelante publicas/compilas el package, cambia a: import { runOnce, crawlOneUrl } from "@agent-rag/crawler";
import { runOnce as runCrawlerOnce, crawlOneUrl } from "../../../../packages/crawler/src/api";

const router = Router();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL no está definido");
}
const sql = neon(DATABASE_URL);

// ---------- helpers ----------
const qLimit = (v: unknown, def = 100) => {
  const n = Number(v ?? def);
  return Number.isFinite(n) ? Math.max(1, Math.min(500, n)) : def;
};

// Filtramos sólo líneas que vienen etiquetadas por el pipeline
const okTag = (s: string) => /^\[(crawler|scraper|embedder|pipeline)\]/.test(s);

const sseHeaders = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
} as const;

const sseSend = (res: any, line: string) => res.write(`data: ${line}\n\n`);

// ---------- health ----------
router.get("/admin/health", (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// =======================================================
// AYUDAS: LIST
// =======================================================
router.get("/admin/ayudas", async (req, res) => {
  try {
    const limit = qLimit(req.query.limit);
    const q = (req.query.q as string | undefined)?.trim();

    if (q) {
      const like = `%${q}%`;
      const rows = await sql`
        select id, nombre, url_oficial,
               page_last_updated_text, page_last_updated_at,
               last_crawled_at, last_scraped_at, last_embedded_at,
               tipo_tramite, estado_tramite, tema_subtema
        from ayudas
        where (nombre ilike ${like} or url_oficial ilike ${like})
        order by id desc
        limit ${limit};
      `;
      return res.json(rows);
    }

    const rows = await sql`
      select id, nombre, url_oficial,
             page_last_updated_text, page_last_updated_at,
             last_crawled_at, last_scraped_at, last_embedded_at,
             tipo_tramite, estado_tramite, tema_subtema
      from ayudas
      order by id desc
      limit ${limit};
    `;
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

// =======================================================
// AYUDAS: CREATE
// =======================================================
router.post("/admin/ayudas", async (req, res) => {
  try {
    const body = z.object({
      nombre: z.string().min(1),
      url_oficial: z.string().url(),
      tipo_tramite: z.string().trim().optional(),
      tema_subtema: z.string().trim().optional(),
      servicio: z.string().trim().optional(),
    })
    .transform(b => ({
      ...b,
      tipo_tramite: b.tipo_tramite && b.tipo_tramite.length ? b.tipo_tramite : null,
      tema_subtema: b.tema_subtema && b.tema_subtema.length ? b.tema_subtema : null,
      servicio: b.servicio && b.servicio.length ? b.servicio : null,
    }))
    .parse(req.body || {});

    const rows = await sql`
      insert into ayudas (nombre, url_oficial, tipo_tramite, tema_subtema, servicio, updated_at)
      values (${body.nombre}, ${body.url_oficial}, ${body.tipo_tramite}, ${body.tema_subtema}, ${body.servicio}, now())
      returning id, nombre, url_oficial,
                tipo_tramite, tema_subtema, servicio,
                estado_tramite,
                page_last_updated_text, page_last_updated_at,
                last_crawled_at, last_scraped_at, last_embedded_at;
    `;

    res.json(rows?.[0] ?? null);
  } catch (e: any) {
    res.status(400).json({ error: e?.message || String(e) });
  }
});

// =======================================================
// AYUDAS: UPDATE (parcial)
// =======================================================
router.patch("/admin/ayudas/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "id inválido" });

    const patch = z.object({
      nombre: z.string().min(1).optional(),
      url_oficial: z.string().url().optional(),
      // Si más adelante quieres permitir actualizar tags desde admin,
      // añade aquí .optional() para tipo_tramite/estado_tramite/tema_subtema
      // y construye los sets correspondientes.
    }).parse(req.body || {});

    const sets: string[] = [];
    const params: any[] = [];

    if (patch.nombre != null) { sets.push(`nombre = $${sets.length + 1}`); params.push(patch.nombre); }
    if (patch.url_oficial != null) { sets.push(`url_oficial = $${sets.length + 1}`); params.push(patch.url_oficial); }
    if (!sets.length) return res.status(400).json({ error: "Nada que actualizar" });

    const raw = `
      update ayudas
         set ${sets.join(", ")}
       where id = $${sets.length + 1}
       returning id, nombre, url_oficial,
                 page_last_updated_text, page_last_updated_at,
                 last_crawled_at, last_scraped_at, last_embedded_at,
                 tipo_tramite, estado_tramite, tema_subtema;
    `;
    const rows = await sql(raw, [...params, id]);
    res.json((rows as any[])?.[0] ?? null);
  } catch (e: any) {
    res.status(400).json({ error: e?.message || String(e) });
  }
});

// =======================================================
// AYUDAS: DELETE
// =======================================================
router.delete("/admin/ayudas/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "id inválido" });
    await sql`delete from ayudas where id = ${id};`;
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

// =======================================================
// AUDIT: CRAWL / SCRAPE / EMBED (LIST) — columnas alineadas con tus schemas
// =======================================================
router.get("/admin/audit/crawl", async (req, res) => {
  try {
    const limit = qLimit(req.query.limit);
    const rows = await sql`
      select id, ayuda_id, url, ts,
             http_status, duration_ms, etag, http_last_modified,
             raw_hash, diff_score, outcome, content_bytes,
             page_last_updated_at, page_last_updated_text,
             notes, error
      from crawl_audit
      order by id desc
      limit ${limit};
    `;
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

router.get("/admin/audit/scrape", async (req, res) => {
  try {
    const limit = qLimit(req.query.limit);
    const rows = await sql`
      select id, ayuda_id, url, ts,
             extractor, text_hash, text_len, lang,
             meta, error
      from scrape_audit
      order by id desc
      limit ${limit};
    `;
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

router.get("/admin/audit/embed", async (req, res) => {
  try {
    const limit = qLimit(req.query.limit);
    const rows = await sql`
      select id, ayuda_id, ts,
             provider, model, dim,
             text_hash, content_version,
             duration_ms, token_usage, store_key, meta,
             error
      from embed_audit
      order by id desc
      limit ${limit};
    `;
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

// =======================================================
// AUDIT: DELETE row por id  -> /admin/audit/:kind/:id
// kind ∈ {crawl|scrape|embed}
// =======================================================
router.delete("/admin/audit/:kind/:id", async (req, res) => {
  try {
    const kind = String(req.params.kind);
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "id inválido" });

    const table =
      kind === "crawl" ? "crawl_audit" :
      kind === "scrape" ? "scrape_audit" :
      kind === "embed" ? "embed_audit" : null;

    if (!table) return res.status(400).json({ error: "kind inválido" });

    // Usamos la sobrecarga sql(string, paramsArray) para poder interpolar el nombre de tabla
    await sql(`delete from ${table} where id = $1`, [id]);

    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

// =======================================================
// AUDIT: PURGE por antigüedad (en días) -> /admin/audit/:kind/purge?days=30
// Usa la columna 'ts' como referencia
// =======================================================
router.post("/admin/audit/:kind/purge", async (req, res) => {
  try {
    const kind = String(req.params.kind);
    const days = Number(req.query.days ?? 30);
    const d = Number.isFinite(days) ? Math.max(1, Math.min(3650, days)) : 30;

    const table =
      kind === "crawl" ? "crawl_audit" :
      kind === "scrape" ? "scrape_audit" :
      kind === "embed" ? "embed_audit" : null;

    if (!table) return res.status(400).json({ error: "kind inválido" });

    const q = `
      delete from ${table}
      where ts < now() - interval '${d} days'
    `;
    await sql(q);

    res.json({ ok: true, purged_older_than_days: d });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

// =======================================================
// CRAWLER: RUN ONCE (SSE con logs en vivo)
// =======================================================
router.get("/admin/crawler/run-once/stream", async (_req, res) => {
  res.writeHead(200, sseHeaders);

  const send = (s: string) => sseSend(res, s);
  const origLog = console.log;

  console.log = (...args: any[]) => {
    const line = args.map(a => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
    if (okTag(line)) send(line);
    origLog.apply(console, args);
  };

  try {
    send("[stream] start");
    await runCrawlerOnce();           // ejecuta el pipeline con tus flags de .env
    send("[stream] end");
  } catch (e: any) {
    send(`[error] ${e?.message || String(e)}`);
  } finally {
    console.log = origLog;
    res.end();
  }
});

// =======================================================
// CRAWLER: CRAWL ONE (SSE con logs en vivo)
// Query params: url (obligatoria), write=0/1, embed=0/1, log=info|debug
// =======================================================
router.get("/admin/crawler/crawl-one/stream", async (req, res) => {
  res.writeHead(200, sseHeaders);

  const qp = req.query || {};
  const parseBool = (v: any) => v === "1" || v === "true" || v === true;

  const url  = String(qp.url || "");
  const write = parseBool(qp.write);
  const embed = parseBool(qp.embed);
  const log   = (qp.log === "debug" ? "debug" : "info") as "info" | "debug";

  const schema = z.object({
    url: z.string().url(),
    write: z.boolean(),
    embed: z.boolean(),
    log: z.enum(["info", "debug"]),
  });

  const send = (s: string) => sseSend(res, s);

  try {
    schema.parse({ url, write, embed, log });
  } catch (e: any) {
    send(`[error] ${e?.message || "invalid params"}`);
    return res.end();
  }

  const origLog = console.log;
  console.log = (...args: any[]) => {
    const line = args.map(a => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
    if (okTag(line)) send(line);
    origLog.apply(console, args);
  };

  try {
    send("[stream] start");
    const out = await crawlOneUrl({ url, write, embed, log }); // mini-pipeline ad-hoc
    send(`[pipeline] done ok=${out?.ok}`);
    send("[stream] end");
  } catch (e: any) {
    send(`[error] ${e?.message || String(e)}`);
  } finally {
    console.log = origLog;
    res.end();
  }
});

export default router;

// apps/api/src/admin/router.ts
import { Router } from "express";
import { z } from "zod";
import { neon } from "@neondatabase/serverless";
import { runOnce, crawlOneUrl } from "@agent-rag/crawler/api";

const router = Router();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL no está definido");
}
const sql = neon(DATABASE_URL);

// ---------- helpers ----------
const qLimit = (v: any, def = 100) => {
  const n = Number(v ?? def);
  return Number.isFinite(n) ? Math.max(1, Math.min(500, n)) : def;
};

// ---------- health ----------
router.get("/admin/health", (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// ---------- AYUDAS: list ----------
router.get("/admin/ayudas", async (req, res) => {
  try {
    const limit = qLimit(req.query.limit);
    const q = (req.query.q as string | undefined)?.trim();

    let rows: any[] = [];
    if (q) {
      const like = `%${q}%`;
      rows = await sql(
        `select id, nombre, url_oficial, page_last_updated_text, page_last_updated_at,
                last_crawled_at, last_scraped_at, last_embedded_at
         from ayudas
         where (nombre ilike $1 or url_oficial ilike $1)
         order by id desc
         limit $2`,
        [like, limit]
      );
    } else {
      rows = await sql(
        `select id, nombre, url_oficial, page_last_updated_text, page_last_updated_at,
                last_crawled_at, last_scraped_at, last_embedded_at
         from ayudas
         order by id desc
         limit $1`,
        [limit]
      );
    }
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

// ---------- AYUDAS: create ----------
router.post("/admin/ayudas", async (req, res) => {
  try {
    const body = z
      .object({
        nombre: z.string().min(1),
        url_oficial: z.string().url(),
      })
      .parse(req.body || {});

    const rows = await sql(
      `insert into ayudas (nombre, url_oficial)
       values ($1, $2)
       returning id, nombre, url_oficial, page_last_updated_text, page_last_updated_at,
                 last_crawled_at, last_scraped_at, last_embedded_at`,
      [body.nombre, body.url_oficial]
    );

    res.json(rows?.[0] ?? null);
  } catch (e: any) {
    res.status(400).json({ error: e?.message || String(e) });
  }
});

// ---------- AYUDAS: update (nombre / url_oficial) ----------
router.patch("/admin/ayudas/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "id inválido" });

    const patch = z
      .object({
        nombre: z.string().min(1).optional(),
        url_oficial: z.string().url().optional(),
      })
      .parse(req.body || {});

    const fields: string[] = [];
    const params: any[] = [];
    let i = 1;

    if (patch.nombre != null) {
      fields.push(`nombre = $${i++}`);
      params.push(patch.nombre);
    }
    if (patch.url_oficial != null) {
      fields.push(`url_oficial = $${i++}`);
      params.push(patch.url_oficial);
    }
    if (!fields.length) return res.status(400).json({ error: "Nada que actualizar" });

    params.push(id);
    const rows = await sql(
      `update ayudas
         set ${fields.join(", ")}
       where id = $${i}
       returning id, nombre, url_oficial, page_last_updated_text, page_last_updated_at,
                 last_crawled_at, last_scraped_at, last_embedded_at`,
      params
    );

    res.json(rows?.[0] ?? null);
  } catch (e: any) {
    res.status(400).json({ error: e?.message || String(e) });
  }
});

// ---------- AYUDAS: delete ----------
router.delete("/admin/ayudas/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "id inválido" });

    await sql(`delete from ayudas where id = $1`, [id]);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

// ---------- AUDIT: crawl ----------
router.get("/admin/audit/crawl", async (req, res) => {
  try {
    const limit = qLimit(req.query.limit);
    const rows = await sql(
      `select id, ayuda_id, url, status, etag, last_modified, fetched_at, outcome, raw_hash,
              page_last_updated_text, page_last_updated_at, page_update_source, error
       from crawl_audit
       order by id desc
       limit $1`,
      [limit]
    );
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

// ---------- AUDIT: scrape ----------
router.get("/admin/audit/scrape", async (req, res) => {
  try {
    const limit = qLimit(req.query.limit);
    const rows = await sql(
      `select id, ayuda_id, text_hash, text_len, fields, scraped_at, error
       from scrape_audit
       order by id desc
       limit $1`,
      [limit]
    );
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

// ---------- AUDIT: embed ----------
router.get("/admin/audit/embed", async (req, res) => {
  try {
    const limit = qLimit(req.query.limit);
    const rows = await sql(
      `select id, ayuda_id, text_hash, embedded_at, error
       from embed_audit
       order by id desc
       limit $1`,
      [limit]
    );
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

// ---------- CRAWLER: run once ----------
router.post("/admin/crawler/run-once", async (_req, res) => {
  try {
    const out = await runOnce();
    res.json(out ?? { ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

// ---------- CRAWLER: crawl one URL ----------
router.post("/admin/crawler/crawl-one", async (req, res) => {
  try {
    const body = z
      .object({
        url: z.string().url(),
        write: z.boolean().optional(),
        embed: z.boolean().optional(),
        log: z.enum(["info", "debug"]).optional(),
      })
      .parse(req.body || {});

    const out = await crawlOneUrl(body);
    res.json(out ?? { ok: true });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || String(e) });
  }
});

export default router;

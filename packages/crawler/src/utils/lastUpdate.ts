import { load, CheerioAPI } from "cheerio";

const DEBUG = process.env.CRAWLER_DEBUG_LASTUPDATE === "1";

/* =====================
 * Utilidades
 * ===================== */
const MESES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10,
  noviembre: 11, diciembre: 12,
};

const norm = (s: string) =>
  (s || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").trim();

const pickFirstNonEmpty = (...vals: (string | null | undefined)[]) => {
  for (const v of vals) if (v && v.trim()) return v.trim();
  return null;
};

const makeAbsolute = (urlLike: string, pageUrl?: string) => {
  try { return new URL(urlLike, pageUrl).toString(); } catch { return urlLike; }
};

const slugNorm = (s?: string | null) => {
  if (!s) return null;
  try { s = decodeURIComponent(s); } catch {}
  return s.toLowerCase().replace(/-+$/, "");
};

function getParamBySuffix(u: URL, suffix: string): string | null {
  for (const [k, v] of u.searchParams.entries()) {
    if (k.toLowerCase().endsWith(suffix.toLowerCase())) return v;
  }
  return null;
}

function getTramiteSlugFromPageUrl(pageUrl?: string): string | null {
  if (!pageUrl) return null;
  try {
    const path = new URL(pageUrl).pathname;
    const m =
      path.match(/\/-\/line\/([^/]+)(?:\/)?$/i) ||
      path.match(/\/line\/([^/]+)(?:\/)?$/i);
    if (m) {
      try { return decodeURIComponent(m[1]).toLowerCase().replace(/-+$/, ""); }
      catch { return m[1].toLowerCase(); }
    }
    return null;
  } catch { return null; }
}

/* =====================
 * Parseo fecha en español
 * ===================== */
function parseSpanishDate(text: string): Date | null {
  const s = norm(text);

  // “15 de septiembre, 2025” (hora opcional)
  let m = s.match(/(\d{1,2})\s+de\s+([a-z]+),?\s+(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/i);
  if (m) {
    const d = +m[1], mon = MESES[m[2]] || 0, y = +m[3];
    const H = m[4] ? +m[4] : 0, M = m[5] ? +m[5] : 0, S = m[6] ? +m[6] : 0;
    if (mon >= 1 && mon <= 12 && d >= 1 && d <= 31) {
      const dt = new Date(Date.UTC(y, mon - 1, d, H, M, S));
      return isNaN(dt.getTime()) ? null : dt;
    }
  }

  // dd/mm/yyyy o dd-mm-yyyy (hora opcional)
  m = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const d = +m[1], mon = +m[2], y = +m[3];
    const H = m[4] ? +m[4] : 0, M = m[5] ? +m[5] : 0, S = m[6] ? +m[6] : 0;
    if (mon >= 1 && mon <= 12 && d >= 1 && d <= 31) {
      const dt = new Date(Date.UTC(y, mon - 1, d, H, M, S));
      return isNaN(dt.getTime()) ? null : dt;
    }
  }

  // YYYY-MM-DD (00:00Z estable)
  const isoDay = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDay) {
    const y = +isoDay[1], mon = +isoDay[2], d = +isoDay[3];
    const dt = new Date(Date.UTC(y, mon - 1, d, 0, 0, 0));
    return isNaN(dt.getTime()) ? null : dt;
  }

  // ISO con hora
  const ms = Date.parse(text);
  return Number.isNaN(ms) ? null : new Date(ms);
}

/* =====================
 * SSR (visible) primero
 * ===================== */
function tryJsonLd($: CheerioAPI): string | null {
  const scripts = $('script[type="application/ld+json"]');
  for (const el of scripts.toArray()) {
    try {
      const json = JSON.parse($(el).text() || "{}");
      const items = Array.isArray(json) ? json : [json];
      for (const item of items) {
        const v = pickFirstNonEmpty(
          item?.dateModified, item?.dateUpdated,
          item?.mainEntity?.dateModified, item?.articleBody?.dateModified
        );
        if (v) return v;
      }
    } catch {}
  }
  return null;
}

function tryMeta($: CheerioAPI): string | null {
  const sel = [
    'meta[property="article:modified_time"]',
    'meta[name="last-modified"]',
    'meta[name="modified"]',
    'meta[itemprop="dateModified"]',
    'meta[property="og:updated_time"]',
  ].join(",");
  return $(sel).first().attr("content") || null;
}

function tryExplicitSelectors($: CheerioAPI): string | null {
  // 1) span directo del portlet
  const span = $('span[id$="lastUpdateDateText"], span[id*="lastUpdateDateText"]').first();
  if (span.length) return span.text().trim();

  // 2) contenedor visible con clase “update-date”
  const c = $(".update-date").first();
  if (c.length) {
    const t = c.text().replace(/\s+/g, " ").trim();
    if (t) return t;
  }

  // 3) nodos “de texto” con etiqueta + fecha corta
  const nodes = $("span,p,li,strong,em").toArray();
  const reLabel = /ultima\s+actualizacion/i;
  const reDate = /(\d{1,2}\s+de\s+[a-z]+,?\s+\d{4}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}|20\d{2}-\d{2}-\d{2})/i;
  for (const n of nodes) {
    const t = $(n).text().replace(/\s+/g, " ").trim();
    if (!t || t.length > 300) continue;
    if (!reLabel.test(norm(t))) continue;
    const m = t.match(reDate);
    if (m) return `Última actualización: ${m[1]}`;
  }

  return null;
}

/** Busca en <script> lo que renderiza la fecha en SSR:
 *   - var fecha = '...'
 *   - $("#...lastUpdateDateText").text('...')
 */
function tryFromInlineScripts($: CheerioAPI): string | null {
  const scripts = $("script").toArray();
  const rxVarFecha = /var\s+fecha\s*=\s*(['"])(.*?)\1\s*;/i;
  const rxSetter = /\$\("#_lastPublicationDatev2_INSTANCE_[^"]+_lastUpdateDateText"\)\.text\(\s*(['"])(.*?)\1\s*\)/i;

  for (const s of scripts) {
    const code = ($(s).html() || "").slice(0, 200_000);
    let m = code.match(rxVarFecha);
    if (m && m[2]) return m[2];

    m = code.match(rxSetter);
    if (m && m[2]) return m[2];
  }
  return null;
}

/* =====================
 * AJAX del portlet (fallback)
 * ===================== */
function findPortletInstanceId(html: string): string | null {
  const m = html.match(/_lastPublicationDatev2_INSTANCE_([A-Za-z0-9]+)_/);
  return m ? `lastPublicationDatev2_INSTANCE_${m[1]}` : null;
}

function buildFallbackAjaxUrl(pageUrl?: string, html?: string): string | null {
  const slug = getTramiteSlugFromPageUrl(pageUrl);
  if (!slug) return null;

  const inst =
    findPortletInstanceId(html ?? "") ||
    "lastPublicationDatev2_INSTANCE_footerlastPublicationDatev3";

  const u = new URL("https://www.navarra.es/es/tramites/on");
  u.searchParams.set("p_p_id", inst);
  u.searchParams.set("p_p_lifecycle", "2");
  u.searchParams.set("p_p_state", "normal");
  u.searchParams.set("p_p_mode", "view");
  u.searchParams.set("p_p_resource_id", "/get/last_update_date");
  u.searchParams.set("p_p_cacheability", "cacheLevelPage");
  u.searchParams.set(
    `_${inst}__es_navarra_tramites_visor_web_portlet_TramitesVisorWebPortlet_mvcRenderCommandName`,
    "detalleTramite"
  );
  u.searchParams.set(
    `_${inst}__es_navarra_tramites_visor_web_portlet_TramitesVisorWebPortlet_urlTitle`,
    slug
  );

  if (pageUrl) {
    try {
      const pbid = new URL(pageUrl).searchParams.get("pageBackId");
      if (pbid) u.searchParams.set(`_${inst}_pageBackId`, pbid);
    } catch {}
  }

  if (DEBUG) {
    console.log("[lastUpdate] built fallback ajax url:", u.toString(), "(inst:", inst, ")");
  }
  return u.toString();
}

function extractAjaxUrl(html: string, pageUrl?: string): string | null {
  const lines = html.match(/url:\s*['"]([^'"]+?)['"]/gi);
  if (!lines || !lines.length) return buildFallbackAjaxUrl(pageUrl, html);

  const pageSlug = getTramiteSlugFromPageUrl(pageUrl);
  const pageBackId = (() => {
    if (!pageUrl) return null;
    try { return new URL(pageUrl).searchParams.get("pageBackId"); } catch { return null; }
  })();

  type Cand = { url: string; score: number };
  const cands: Cand[] = [];

  for (const line of lines) {
    const m = line.match(/url:\s*['"]([^'"]+?)['"]/i);
    if (!m) continue;
    let raw = m[1];
    if (!/get\/last[_-]update[_-]date/i.test(raw)) continue;

    raw = raw.replace(/&amp;/g, "&");
    try { raw = decodeURIComponent(raw); } catch {}
    const abs = makeAbsolute(raw, pageUrl);
    const u = new URL(abs);

    let score = 0;
    if (/TramitesVisorWebPortlet/i.test(abs)) score += 2;
    if (/get\/last_update_date/i.test(abs) || /p_p_resource_id=%2Fget%2Flast_update_date/i.test(abs)) score += 1;

    const ut = slugNorm(getParamBySuffix(u, "urlTitle"));
    if (pageSlug && ut && pageSlug === ut) score += 10;

    const pb = getParamBySuffix(u, "pageBackId");
    if (pageBackId && pb && pageBackId === pb) score += 5;

    score += Math.min(3, Math.floor(abs.length / 200));
    cands.push({ url: abs, score });
  }

  if (!cands.length) return buildFallbackAjaxUrl(pageUrl, html);
  cands.sort((a, b) => b.score - a.score);
  const best = cands[0];
  if (DEBUG) console.log("[lastUpdate] ajaxUrl resolved:", best.url);
  return best.url;
}

export async function fetchAjaxLastUpdate(
  ajaxUrl: string,
  referer?: string
): Promise<{ text: string | null; iso: string | null }> {
  try {
    if (DEBUG) console.log("[lastUpdate] fetching ajax:", ajaxUrl);
    const res = await fetch(ajaxUrl, {
      headers: {
        "User-Agent": "AgentRAG/1.0",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "X-Requested-With": "XMLHttpRequest",
        "Accept-Language": "es-ES,es;q=0.9",
        ...(referer ? { "Referer": referer } : {}),
      },
    });

    if (!res.ok) {
      if (DEBUG) console.log("[lastUpdate] ajax status:", res.status, res.statusText);
      return { text: null, iso: null };
    }

    const ct = res.headers.get("content-type") || "";
    const body = await res.text();

    let data: any;
    if (/json/i.test(ct)) {
      data = JSON.parse(body);
      if (DEBUG) console.log("[lastUpdate] ajax JSON:", body.slice(0, 400));
    } else {
      // backend a veces devuelve text/html con JSON dentro
      try { data = JSON.parse(body); }
      catch {
        const m = body.match(/\{.*\}/s);
        if (!m) return { text: null, iso: null };
        try { data = JSON.parse(m[0]); } catch { return { text: null, iso: null }; }
      }
      if (DEBUG) console.log("[lastUpdate] non-JSON content-type:", ct, "body head:", body.slice(0, 200));
    }

    const rawDate = data?.lastUpdateDate || data?.lastUpdateString || null;
    const text = data?.lastUpdateString || data?.lastUpdateDate || null;
    const dt = rawDate ? parseSpanishDate(rawDate) : null;
    return { text, iso: dt ? dt.toISOString() : null };
  } catch (e) {
    if (DEBUG) console.log("[lastUpdate] ajax error:", (e as any)?.message || String(e));
    return { text: null, iso: null };
  }
}

/* =====================
 * API pública
 * ===================== */

/**
 * Prioridad:
 *  1) Visible en HTML (SSR) ← lo que se ve en “Elements”
 *  2) JSON-LD / meta
 *  3) Búsqueda en <script> (var fecha / setter)
 *  4) AJAX del portlet (fallback)
 */
export async function extractLastUpdateOrAjax(
  html: string,
  pageUrl?: string
): Promise<{ text: string | null; iso: string | null; source: "visible" | "jsonld/meta" | "script" | "ajax" | "none"; }> {
  const $ = load(html);

  // 1) Visible (SSR)
  const vis = tryExplicitSelectors($);
  if (vis) {
    const cleaned = norm(vis).replace(/^ultima\s+actualizacion\s*:?\s*/i, "");
    const dt = parseSpanishDate(cleaned);
    if (dt) return { text: vis, iso: dt.toISOString(), source: "visible" };
  }

  // 2) JSON-LD / meta
  const mj = pickFirstNonEmpty(tryJsonLd($), tryMeta($));
  if (mj) {
    const dt = parseSpanishDate(mj);
    if (dt) {
      const iso = dt.toISOString();
      const y = dt.getUTCFullYear();
      const m = dt.toLocaleString("es-ES", { month: "long", timeZone: "UTC" });
      const d = dt.getUTCDate();
      return { text: `Última actualización: ${d} de ${m}, ${y}`, iso, source: "jsonld/meta" };
    }
  }

  // 3) Inline <script> (var fecha / setter)
  const fromScript = tryFromInlineScripts($);
  if (fromScript) {
    const cleaned = norm(fromScript).replace(/^ultima\s+actualizacion\s*:?\s*/i, "");
    const dt = parseSpanishDate(cleaned);
    if (dt) return { text: fromScript, iso: dt.toISOString(), source: "script" };
  }

  // 4) AJAX (fallback)
  const ajaxUrl = extractAjaxUrl(html, pageUrl);
  if (ajaxUrl) {
    const { text, iso } = await fetchAjaxLastUpdate(ajaxUrl, pageUrl);
    if (text || iso) return { text, iso, source: "ajax" };
  }

  return { text: null, iso: null, source: "none" };
}

/** Versión síncrona (solo SSR) */
export function extractLastUpdate(html: string): { text: string | null; iso: string | null } {
  const $ = load(html);

  // Visible
  const vis = tryExplicitSelectors($);
  if (vis) {
    const cleaned = norm(vis).replace(/^ultima\s+actualizacion\s*:?\s*/i, "");
    const dt = parseSpanishDate(cleaned);
    return { text: vis, iso: dt ? dt.toISOString() : null };
  }

  // JSON-LD / meta
  const mj = pickFirstNonEmpty(tryJsonLd($), tryMeta($));
  if (mj) {
    const dt = parseSpanishDate(mj);
    return { text: mj, iso: dt ? dt.toISOString() : null };
  }

  // <script> inline
  const fromScript = tryFromInlineScripts($);
  if (fromScript) {
    const cleaned = norm(fromScript).replace(/^ultima\s+actualizacion\s*:?\s*/i, "");
    const dt = parseSpanishDate(cleaned);
    return { text: fromScript, iso: dt ? dt.toISOString() : null };
  }

  return { text: null, iso: null };
}

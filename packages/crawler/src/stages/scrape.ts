// packages/crawler/src/stages/scrape.ts
import { load, type CheerioAPI } from "cheerio";
import { sha256 } from "../utils/hash";
import { db, schema } from "../db";
import { CFG } from "../config";
import type { ScrapeResult } from "../types";
import { eq } from "drizzle-orm";

const DRY = process.env.CRAWLER_DRY_RUN === "1";

/* =============== Persistencia =============== */
async function safeUpdate(id: number, patch: Record<string, any>) {
  if (DRY) return;
  await db.update(schema.ayudas).set(patch).where(eq(schema.ayudas.id, id));
}
async function audit(ayudaId: number, extra: Record<string, any> = {}) {
  if (!CFG.SCRAPE_AUDIT_ENABLED || DRY) return;
  await db.insert(schema.scrapeAudit).values({
    ayuda_id: ayudaId,
    url: extra.url ?? null,
    ts: new Date(),
    extractor: "navarra.ficha",
    text_hash: extra.text_hash ?? null,
    text_len: extra.text_len ?? null,
    lang: extra.lang ?? null,
    meta: extra.meta ?? null,
    error: extra.error ?? null,
  });
}

/* =============== Normalización =============== */
const squash = (s: string) => s.replace(/\s+/g, " ").trim();
const stripMarks = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const cleanKey = (s: string) =>
  stripMarks(
    squash(
      s
        .toLowerCase()
        .replace(/keyboard_arrow_down|arrow_downward|share|suscribirse.*$/gi, "")
    )
  );

function sameLabel(a: string, b: string) {
  return cleanKey(a) === cleanKey(b);
}
function startsLabel(a: string, b: string) {
  return cleanKey(a).startsWith(cleanKey(b));
}

/* =============== IDs conocidos por sección =============== */
const KNOWN_ID_MAP: Record<string, string[]> = {
  "descripcion": ["#infoDescripcion", "[id*='infoDescripcion' i]"],
  "dirigido a": ["#infoDirigido", "[id*='infoDirigido' i]"],
  "documentacion": [
    "#infoDocu",
    "#infoDocumentacion",
    "[id*='infoDocu' i]",
    "[id*='infoDocumentacion' i]",
  ],
  "normativa": ["#infoNormativa", "[id*='infoNormativa' i]"],
  "tramitacion": ["#infoTramitacion", "[id*='infoTram' i]"],
  "resultados": ["#infoResultados", "[id*='infoResultados' i]"],
};

// secciones “top” para cortar siblings cuando no hay acordeón/details
const KNOWN_TOP = [
  "informacion basica",
  "dirigido a",
  "descripcion",
  "documentacion a presentar",
  "documentacion",
  "normativa",
  "tramitacion",
  "resultados",
];

/* =============== Texto con enlaces inline =============== */
function collectTextWithLinks($: CheerioAPI, root: any | any[] | null): string {
  if (!root) return "";
  const $root = Array.isArray(root) ? $(root as any) : $(root as any);
  $root.find("script,style,noscript").remove();

  const parts: string[] = [];
  $root.find("p,li,dd,div").each((_, el) => {
    const el$ = $(el as any);
    let txt = squash(el$.text());
    if (!txt) return;

    el$.find("a[href]").each((__, a) => {
      const a$ = $(a as any);
      const t = squash(a$.text()) || a$.attr("href") || "";
      const href = a$.attr("href") || "";
      if (href && !txt.includes(href)) {
        txt = txt.replace(t, `${t} (${href})`);
      }
    });

    if (txt) parts.push(txt);
  });

  if (!parts.length) {
    const raw = squash($root.text());
    if (raw) parts.push(raw);
  }
  return parts.join("\n");
}

/* =============== Localización de secciones =============== */
function findByKnownIds($: CheerioAPI, selectors: string[]): any[] | null {
  const $nodes = $(selectors.join(","));
  return $nodes.length ? ($nodes.toArray() as any[]) : null;
}

function findSectionHeading($: CheerioAPI, label: string): any | null {
  const targets = $(
    "h1,h2,h3,h4,summary,button,.collapse-title,.accordion-header,.card-title,strong,div,span,a"
  );
  let best: any | null = null;
  let score = 0;

  targets.each((_, el) => {
    const t = squash($(el as any).text())
      .replace(/keyboard_arrow_down|arrow_downward/gi, "")
      .trim();
    if (!t) return;
    if (sameLabel(t, label)) {
      best = el as any;
      score = 2;
      return false; // break
    }
    if (score < 1 && startsLabel(t, label)) {
      best = el as any;
      score = 1;
    }
  });

  return best;
}

function getSectionContent($: CheerioAPI, headingEl: any | null): any[] | null {
  if (!headingEl) return null;

  const tag = ($(headingEl as any).prop("tagName") as string | undefined)
    ?.toLowerCase?.();

  // <details><summary>...</summary>Contenido</details>
  const parent =
    tag === "summary"
      ? $(headingEl as any).parent("details")
      : $(headingEl as any).closest("details");

  if (parent && parent.length) {
    const box = parent.clone();
    box.find("summary").remove();
    return [box.get(0)! as any];
  }

  // Bloques de acordeón / tarjeta
  const collapse = $(headingEl as any).closest(
    ".collapse,.accordion-item,.card"
  );
  if (collapse.length) {
    const content = collapse.find(
      ".collapse-content,.accordion-content,.card-content"
    );
    if (content.length) return content.toArray() as any;
  }

  // Siblings hasta la siguiente cabecera "top"
  const out: any[] = [];
  let node = $(headingEl as any).next();

  while (node && node.length) {
    const txt = squash(
      node.text().replace(/keyboard_arrow_down|arrow_downward/gi, "")
    );
    const isNewTop = KNOWN_TOP.some(
      (h) => sameLabel(txt, h) || startsLabel(txt, h)
    );
    if (isNewTop) break;

    out.push(node.get(0)! as any);
    node = node.next();
  }

  return out.length ? out : null;
}

/** fallback amplio por id/ancla/aria-label */
function findSectionContainerById($: CheerioAPI, label: string): any[] | null {
  const key = cleanKey(label);
  const nodes: any[] = [];

  $("[id]").each((_, el) => {
    const id = String($(el as any).attr("id") || "");
    if (!id) return;
    const ck = cleanKey(id);
    if (ck === key || ck.includes(key)) nodes.push(el as any);
  });
  if (nodes.length) return nodes;

  $('a[href^="#"]').each((_, a) => {
    const href = String($(a as any).attr("href") || "");
    const frag = href.replace(/^#/, "");
    if (!frag) return;
    const ck = cleanKey(frag);
    if (ck === key || ck.includes(key)) {
      const target = $(`#${frag}`);
      if (target.length) nodes.push(target.get(0)! as any);
    }
  });
  if (nodes.length) return nodes;

  $("[data-section],[aria-label]").each((_, el) => {
    const data = String($(el as any).attr("data-section") || "");
    const aria = String($(el as any).attr("aria-label") || "");
    const c1 = data ? cleanKey(data) : "";
    const c2 = aria ? cleanKey(aria) : "";
    if (
      (c1 && (c1 === key || c1.includes(key))) ||
      (c2 && (c2 === key || c2.includes(key)))
    ) {
      nodes.push(el as any);
    }
  });
  return nodes.length ? nodes : null;
}

/** prioriza IDs fijos; luego heading->contenido; luego fallback por id/ancla */
function findSectionNodes($: CheerioAPI, label: string): any[] | null {
  const key = cleanKey(label);
  if (KNOWN_ID_MAP[key]) {
    const byIdFixed = findByKnownIds($, KNOWN_ID_MAP[key]);
    if (byIdFixed && byIdFixed.length) return byIdFixed;
  }

  const byHeading = getSectionContent($, findSectionHeading($, label));
  if (byHeading && byHeading.length) return byHeading;

  const byId = findSectionContainerById($, label);
  if (byId && byId.length) return byId;

  return null;
}

function extractByIds($: CheerioAPI, labelKey: string): string {
  const selectors = KNOWN_ID_MAP[labelKey];
  if (!selectors) return "";
  const nodes = findByKnownIds($, selectors);
  return collectTextWithLinks($, nodes || null);
}

function extractSectionByTitle($: CheerioAPI, label: string): string {
  const contentEls = findSectionNodes($, label);
  return collectTextWithLinks($, contentEls || null);
}

/* =============== Sub-secciones (acordeones) =============== */
type SubItem = { title: string; text: string };

function extractSubsections($: CheerioAPI, sectionNodes: any[] | null): SubItem[] {
  const items: SubItem[] = [];
  if (!sectionNodes?.length) return items;
  const seen = new Set<string>();

  for (const root of sectionNodes) {
    const $root = $(root as any);

    // details/summary
    $root.find("details").each((_, d) => {
      const title = squash($(d as any).find("summary").first().text());
      const clone = $(d as any).clone();
      clone.find("summary").remove();
      const text = collectTextWithLinks($, clone);
      const key = `${title}::${text.slice(0, 40)}`;
      if (title && text && !seen.has(key)) {
        items.push({ title, text });
        seen.add(key);
      }
    });

    // colapsables/accordion/cards
    $root.find(".collapse,.accordion-item,.card").each((_, c) => {
      const title = squash(
        $(c as any)
          .find(".collapse-title,.accordion-header,.card-title,summary,h3,h4,strong,button")
          .first()
          .text()
      );
      const $content = $(c as any).find(".collapse-content,.accordion-content,.card-content");
      const text = $content.length
        ? collectTextWithLinks($, $content.first())
        : collectTextWithLinks($, $(c as any));
      const key = `${title}::${text.slice(0, 40)}`;
      if (title && text && !seen.has(key)) {
        items.push({ title, text });
        seen.add(key);
      }
    });

    // fallback por headings locales
    $root.find("h2,h3,h4,strong,button,summary").each((_, h) => {
      const title = squash($(h as any).text());
      if (!title) return;

      const siblings: any[] = [];
      let node = $(h as any).next();
      while (node && node.length) {
        const tag = (node.prop("tagName") as string | undefined)?.toLowerCase?.() || "";
        if (/^h[1-6]$/.test(tag) || node.is("summary,button,strong")) break;
        siblings.push(node.get(0)! as any);
        node = node.next();
      }
      const text = collectTextWithLinks($, siblings.length ? siblings : null);
      const key = `${title}::${text.slice(0, 40)}`;
      if (title && text && !seen.has(key)) {
        items.push({ title, text });
        seen.add(key);
      }
    });
  }
  return items;
}

/* =============== Texto global para hash/embedding =============== */
function buildEmbeddingText(payload: {
  nombre?: string;
  descripcion?: string;
  dirigido_a?: string;
  documentacion?: string;
  normativa?: string;
  resultados?: string;
  otros?: string;
  estado_tramite?: string;
  url?: string;
}) {
  const blocks = [
    payload.nombre ? `Nombre: ${payload.nombre}` : "",
    payload.estado_tramite ? `Estado: ${payload.estado_tramite}` : "",
    payload.url ? `URL: ${payload.url}` : "",
    payload.descripcion ? `Descripción:\n${payload.descripcion}` : "",
    payload.dirigido_a ? `Dirigido a:\n${payload.dirigido_a}` : "",
    payload.documentacion ? `Documentación a presentar:\n${payload.documentacion}` : "",
    payload.normativa ? `Normativa:\n${payload.normativa}` : "",
    payload.resultados ? `Resultados:\n${payload.resultados}` : "",
    payload.otros ? `Otros:\n${payload.otros}` : "",
  ].filter(Boolean);
  return blocks.join("\n\n");
}

/* =============== SCRAPE PRINCIPAL =============== */
export async function scrapeOne(ayuda: any, html: string): Promise<ScrapeResult> {
  try {
    const $ = load(html);

    // Campos directos
    const nombre =
      squash($(".title").first().text()) ||
      squash($("h1").first().text()) ||
      (ayuda.nombre ?? "");
    const estado_tramite =
      squash($(".plazo").first().text()) || ayuda.estado_tramite || "";

    // Top blocks — PRIORIDAD por IDs fijos, con fallback a headings
    const descripcion =
      extractByIds($, "descripcion") || extractSectionByTitle($, "descripción");
    const dirigido_a =
      extractByIds($, "dirigido a") || extractSectionByTitle($, "dirigido a");
    const documentacion =
      extractByIds($, "documentacion") ||
      extractSectionByTitle($, "documentación a presentar") ||
      extractSectionByTitle($, "documentación");
    const normativa =
      extractByIds($, "normativa") || extractSectionByTitle($, "normativa");

    // Tramitación/Resultados — primero por ID de contenedor
    const tramNodes = findSectionNodes($, "tramitación");
    const tramSubs = extractSubsections($, tramNodes);

    const resNodes = findSectionNodes($, "resultados");
    const resSubs = extractSubsections($, resNodes);

    // Construir “otros”
    const otrosParts: string[] = [];
    if (tramSubs.length) {
      for (const it of tramSubs) otrosParts.push(`Tramitación — ${it.title}:\n${it.text}`);
    } else if (tramNodes?.length) {
      const tramText = collectTextWithLinks($, tramNodes);
      if (tramText) otrosParts.push(`Tramitación — general:\n${tramText}`);
    }
    if (resSubs.length) {
      for (const it of resSubs) {
        if (it.title && !/^resultados$/i.test(it.title)) {
          otrosParts.push(`Resultados — ${it.title}:\n${it.text}`);
        }
      }
    }
    const otros = otrosParts.join("\n\n");

    // Resultados (general) a su propio campo
    const resultados =
      extractByIds($, "resultados") || extractSectionByTitle($, "resultados");

    // Texto para hash/embedding
    const embText = buildEmbeddingText({
      nombre,
      estado_tramite,
      url: ayuda.url_oficial,
      descripcion,
      dirigido_a,
      documentacion,
      normativa,
      resultados,
      otros,
    });

    if (CFG.SCRAPER_MIN_TEXT_LEN && embText.length < CFG.SCRAPER_MIN_TEXT_LEN) {
      await audit(ayuda.id, {
        url: ayuda.url_oficial,
        error: "text_too_short",
        text_len: embText.length,
      });
      await safeUpdate(ayuda.id, {
        last_scraped_at: new Date(),
        last_scrape_ok: false,
        last_error: "text_too_short",
      });
      return { ok: false, changed: false, error: "text_too_short" };
    }

    // Hash canónico
    const textHash = sha256(embText);
    const changed = !ayuda.text_hash || ayuda.text_hash !== textHash;

    // Persistencia
    const patch: Record<string, any> = {
      nombre: nombre || null,
      estado_tramite: estado_tramite || null,
      dirigido_a: dirigido_a || null,
      descripcion: descripcion || null,
      documentacion: documentacion || null,
      normativa: normativa || null,
      resultados: resultados || null,
      otros: otros || null,
      last_scraped_at: new Date(),
      last_scrape_ok: true,
      last_error: null,
    };
    if (changed) {
      patch.text_hash = textHash;
      patch.content_version = (ayuda.content_version ?? 0) + 1;
    }
    await safeUpdate(ayuda.id, patch);

    await audit(ayuda.id, {
      url: ayuda.url_oficial,
      text_hash: textHash,
      text_len: embText.length,
      lang: "es",
      meta: {
        filled: {
          nombre: !!nombre,
          estado_tramite: !!estado_tramite,
          dirigido_a: !!dirigido_a,
          descripcion: !!descripcion,
          documentacion: !!documentacion,
          normativa: !!normativa,
          resultados: !!resultados,
          otros: !!otros,
        },
        subs: {
          tramitacion: tramSubs.map((s) => s.title),
          resultados: resSubs.map((s) => s.title),
        },
        source: "ids+headings",
      },
    });

    const fields = {
      nombre,
      estado_tramite,
      dirigido_a,
      descripcion,
      documentacion,
      normativa,
      resultados,
      otros,
    };

    return {
      ok: true,
      changed,
      textHash,
      textLen: embText.length,
      lang: "es",
      fields,
      patch,
      // text: embText, // útil para debug si quieres ver lo que hasheamos
    };
  } catch (e: any) {
    await audit(ayuda.id, { url: ayuda.url_oficial, error: e?.message || String(e) });
    await safeUpdate(ayuda.id, {
      last_scraped_at: new Date(),
      last_scrape_ok: false,
      last_error: e?.message || String(e),
    });
    return { ok: false, changed: false, error: e?.message || String(e) };
  }
}

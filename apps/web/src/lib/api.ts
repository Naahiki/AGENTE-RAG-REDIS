// apps/web/src/lib/api.ts
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  return (await res.json()) as T;
}
async function delJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  return (await res.json()) as T;
}
async function postJSON<T>(url: string, body?: any): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  return (await res.json()) as T;
}
async function patchJSON<T>(url: string, body: any): Promise<T> {
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
  return (await res.json()) as T;
}

export const api = {
  admin: {
    health: () => getJSON<{ ok: true }>(`${API_BASE}/admin/health`),
  },
  ayudas: {
    list: (limit = 100, q?: string) =>
      getJSON<any[]>(
        `${API_BASE}/admin/ayudas?limit=${encodeURIComponent(
          String(limit)
        )}${q ? `&q=${encodeURIComponent(q)}` : ""}`
      ),
    create: (row: { nombre: string; url_oficial: string }) =>
      postJSON<any>(`${API_BASE}/admin/ayudas`, row),
    update: (id: number, patch: Record<string, any>) =>
      patchJSON<any>(`${API_BASE}/admin/ayudas/${id}`, patch),
    remove: (id: number) => delJSON<{ ok: boolean }>(`${API_BASE}/admin/ayudas/${id}`),
  },
  audit: {
    list: (kind: "crawl" | "scrape" | "embed", limit = 100, q?: string) =>
      getJSON<any[]>(
        `${API_BASE}/admin/audit/${kind}?limit=${encodeURIComponent(
          String(limit)
        )}${q ? `&q=${encodeURIComponent(q)}` : ""}`
      ),
    remove: (kind: "crawl" | "scrape" | "embed", id: number) =>
      delJSON<{ ok: boolean }>(`${API_BASE}/admin/audit/${kind}/${id}`),
    purge: (kind: "crawl" | "scrape" | "embed", days = 30) =>
      postJSON<{ ok: boolean; deleted: number }>(`${API_BASE}/admin/audit/${kind}/purge?days=${days}`),
  },
  crawler: {
    runOnce: () => postJSON(`${API_BASE}/admin/crawler/run-once`),
    crawlOne: (opts: { url: string; write?: boolean; embed?: boolean; log?: "info" | "debug" }) =>
      postJSON(`${API_BASE}/admin/crawler/crawl-one`, opts),
  },
};

// apps/web/src/lib/api.ts
const BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";

async function parse<T>(res: Response): Promise<T> {
  const txt = await res.text();
  let data: any = null;
  try { data = txt ? JSON.parse(txt) : null; } catch { /* noop */ }
  if (!res.ok) {
    const msg = data?.error || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}

function get<T>(path: string, params?: Record<string, any>) {
  const url = new URL(path, BASE);
  if (params) Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  });
  return fetch(url.toString()).then(parse<T>);
}

function post<T>(path: string, body?: any) {
  return fetch(new URL(path, BASE), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  }).then(parse<T>);
}

function patch<T>(path: string, body: any) {
  return fetch(new URL(path, BASE), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(parse<T>);
}

function del<T>(path: string) {
  return fetch(new URL(path, BASE), { method: "DELETE" }).then(parse<T>);
}

export const api = {
  admin: {
    health: () => get<{ ok: true; ts: string }>("/admin/health"),
  },

  ayudas: {
    list: (limit = 100, q?: string) =>
      get<any[]>("/admin/ayudas", { limit, q }),
    create: (body: { nombre: string; url_oficial: string }) =>
      post<any>("/admin/ayudas", body),
    update: (id: number, patchBody: Record<string, any>) =>
      patch<any>(`/admin/ayudas/${id}`, patchBody),
    remove: (id: number) =>
      del<{ ok: true }>(`/admin/ayudas/${id}`),
  },

  audit: {
    // El backend ya lista por tabla. (El parámetro q es opcional; si el backend lo ignora, no pasa nada.)
    list: (kind: "crawl" | "scrape" | "embed", limit = 100, q?: string) =>
      get<any[]>(`/admin/audit/${kind}`, { limit, q }),
    remove: (kind: "crawl" | "scrape" | "embed", id: number) =>
      del<{ ok: true }>(`/admin/audit/${kind}/${id}`),
    purge: (kind: "crawl" | "scrape" | "embed", days = 30) =>
      post<{ ok: true; deleted: number }>(`/admin/audit/${kind}/purge`, { days }),
  },

  crawler: {
    runOnce: () =>
      post<{ ok: true } | any>("/admin/crawler/run-once"),
    crawlOne: (body: { url: string; write?: boolean; embed?: boolean; log?: "info" | "debug" }) =>
      post<any>("/admin/crawler/crawl-one", body),
  },
};

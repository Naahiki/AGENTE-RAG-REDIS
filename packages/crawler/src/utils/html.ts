// packages/crawler/src/utils/html.ts
export function normalizeHtml(html: string) {
  // Quita scripts/styles/comments y colapsa espacios
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

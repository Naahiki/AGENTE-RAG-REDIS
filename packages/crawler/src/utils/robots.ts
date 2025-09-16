// packages/crawler/src/utils/robots.ts
export async function allowedByRobots(urlStr: string, userAgent: string) {
  try {
    const u = new URL(urlStr);
    const robotsUrl = `${u.protocol}//${u.host}/robots.txt`;
    const res = await fetch(robotsUrl, { redirect: "follow" });
    if (!res.ok) return true; // si no hay robots, permitimos

    const txt = await res.text();
    // Parser super-simple: bloqueos por Disallow para *
    const lines = txt.split(/\r?\n/);
    let applies = false;
    const disallows: string[] = [];
    for (const line of lines) {
      const l = line.trim();
      if (!l || l.startsWith("#")) continue;
      if (/^User-agent:\s*\*/i.test(l)) {
        applies = true;
        continue;
      }
      if (/^User-agent:/i.test(l)) {
        applies = false;
        continue;
      }
      if (applies && /^Disallow:/i.test(l)) {
        const m = l.match(/^Disallow:\s*(.*)$/i);
        if (m) disallows.push(m[1].trim());
      }
    }
    const path = u.pathname || "/";
    return !disallows.some((prefix) => prefix && path.startsWith(prefix));
  } catch {
    return true;
  }
}

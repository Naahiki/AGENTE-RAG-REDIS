// packages/crawler/src/utils/pool.ts
export async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (it: T, idx: number) => Promise<R>
): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  const run = async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  };
  const workers = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workers }, run));
  return out;
}

export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let t: NodeJS.Timeout;
  const killer = new Promise<never>((_, rej) =>
    (t = setTimeout(() => rej(new Error(`Timeout ${ms}ms en ${label}`)), ms))
  );
  return Promise.race([p, killer]).finally(() => clearTimeout(t!)) as Promise<T>;
}

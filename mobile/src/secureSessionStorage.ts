// Only encrypted platform storage holds session data. Chunking avoids iOS value-size limits.
export interface SecureStorage {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}
export function secureSessionStorage(store: SecureStorage, maxLength = 50000) {
  let queue: Promise<unknown> = Promise.resolve();
  const run = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = queue.then(operation); queue = result.catch(() => {}); return result;
  };
  const indexKey = (key: string) => `fq.${key.replace(/[^\w.-]/g, '_')}.index`;
  async function keys(key: string): Promise<string[] | null> {
    const raw = await store.getItemAsync(indexKey(key));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || !parsed || !('generation' in parsed) || !('count' in parsed) ||
        typeof parsed.generation !== 'string' || !/^[a-z0-9.]+$/.test(parsed.generation) ||
        typeof parsed.count !== 'number' || !Number.isInteger(parsed.count) || parsed.count < 0 || parsed.count > Math.max(128,Math.ceil(maxLength/399))) {
      throw new Error('Invalid secure session index.');
    }
    return Array.from({ length: parsed.count }, (_, i) => `${indexKey(key)}.${parsed.generation}.${i}`);
  }
  const cleanup = (items: string[]) => Promise.all(items.map(k => store.deleteItemAsync(k).catch(() => {})));
  return {
    getItem: (key: string) => run(async () => {
      const items = await keys(key);
      if (!items) return null;
      const chunks = await Promise.all(items.map(k => store.getItemAsync(k)));
      if (chunks.some(x => x === null)) {
        // A prior partial deletion must be finished on reopen, not hidden by a null read.
        await Promise.all(items.map(k => store.deleteItemAsync(k)));
        await store.deleteItemAsync(indexKey(key));
        return null;
      }
      return chunks.join('');
    }),
    setItem: (key: string, value: string) => run(async () => {
      if (value.length > maxLength) throw new Error('Session too large.');
      const old = await keys(key) ?? [];
      const generation = `${Date.now()}.${Math.random().toString(36).slice(2)}`;
      const items: string[] = [];
      try {
        for (let i = 0; i < value.length;) {
          let end = Math.min(i + 400, value.length);
          // Keep surrogate pairs intact across native UTF-8 conversion.
          if (end < value.length && value.charCodeAt(end - 1) >= 0xd800 && value.charCodeAt(end - 1) <= 0xdbff) end--;
          const k = `${indexKey(key)}.${generation}.${items.length}`;
          items.push(k); await store.setItemAsync(k, value.slice(i, end)); i = end;
        }
        await store.setItemAsync(indexKey(key), JSON.stringify({ generation, count: items.length }));
      } catch (error) { await cleanup(items); throw error; }
      await cleanup(old);
    }),
    removeItem: (key: string) => run(async () => {
      const old = await keys(key) ?? [];
      // Keep the index until every referenced chunk is removed so a failed deletion
      // remains retryable; never report successful cleanup while private chunks remain.
      await Promise.all(old.map(k => store.deleteItemAsync(k)));
      await store.deleteItemAsync(indexKey(key));
    }),
  };
}

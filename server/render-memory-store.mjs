// Temporary in-memory OTP storage for one Render Node instance.
// Never stores email addresses or plaintext codes. Cleared by process restarts.
export function createVerificationMemoryStore({ maxEntries = 10000, now = Date.now } = {}) {
  const entries = new Map();
  let sequence = 0;
  return {
    async getWithMetadata(key) {
      const entry = entries.get(key);
      return entry ? { data: { ...entry.data }, etag: entry.etag } : null;
    },
    async setJSON(key, data, options = {}) {
      const old = entries.get(key);
      if ((options.onlyIfNew && old) ||
          (options.onlyIfMatch && (!old || old.etag !== options.onlyIfMatch))) {
        return { modified: false };
      }
      if (!old && entries.size >= maxEntries) {
        // Evict expired and stale records first; never permit unbounded growth.
        for (const [entryKey, entry] of entries) {
          if (entry.data.expiresAt < now() - 60_000) entries.delete(entryKey);
        }
        if (entries.size >= maxEntries) {
          entries.delete(entries.keys().next().value);
        }
      }
      const etag = '"' + ++sequence + '"';
      entries.set(key, { data: { ...data }, etag });
      return { modified: true, etag };
    }
  };
}

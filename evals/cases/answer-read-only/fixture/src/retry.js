const RETRYABLE = (status) => status === 429 || status >= 500;

export async function fetchWithRetry(url, { attempts = 4, baseDelayMs = 100, fetchImpl = fetch } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const res = await fetchImpl(url);
      if (res.ok) return res;
      if (!RETRYABLE(res.status)) throw Object.assign(new Error(`HTTP ${res.status}`), { fatal: true });
      lastError = new Error(`HTTP ${res.status}`);
    } catch (err) {
      if (err.fatal) throw err;
      lastError = err;
    }
    if (attempt < attempts) await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** (attempt - 1)));
  }
  throw lastError;
}

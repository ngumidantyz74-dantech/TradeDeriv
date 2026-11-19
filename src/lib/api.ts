const TOKEN_KEY = 'tradederiv_jwt';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore storage errors
  }
}

export function sanitizeUiError(err: unknown, fallback = 'Operation temporarily unavailable. Please try again.'): string {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  const cleaned = String(raw || '').trim();
  if (!cleaned) return fallback;

  // Strip raw JSON payloads (e.g. upstream 503 JSON objects)
  if (cleaned.startsWith('{') || cleaned.startsWith('[') || /"\s*error\s*"\s*:/i.test(cleaned)) {
    if (/503|UNAVAILABLE|high demand|overloaded|quota|rate.?limit|429/i.test(cleaned)) {
      return 'Market intelligence engine is experiencing high demand. Please retry in a moment.';
    }
    return fallback;
  }

  // Strip internal infrastructure, model names, env vars, SQL, or stack details
  if (
    /gemini|genai|google|anthropic|openai|GEMINI_API_KEY|DATABASE_URL|postgres|neon\.tech|SELECT\s+|INSERT\s+|UPDATE\s+|stack|node_modules|TypeError|ReferenceError|ECONNREFUSED|ENOTFOUND/i.test(
      cleaned
    )
  ) {
    if (/503|UNAVAILABLE|high demand|overloaded|429|timeout/i.test(cleaned)) {
      return 'Market intelligence engine is experiencing high demand. Please retry in a moment.';
    }
    return fallback;
  }

  return cleaned.length > 220 ? `${cleaned.slice(0, 217)}...` : cleaned;
}

export async function apiFetch<T = any>(
  path: string,
  options: RequestInit & { skipAuth?: boolean } = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  if (!options.skipAuth) {
    const token = getStoredToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  const resp = await fetch(path, {
    ...options,
    headers,
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(sanitizeUiError(data.error, `Request failed (${resp.status})`));
  }
  return data as T;
}

// Direct Browser Deriv WebSocket Helper (with automatic backend fallback in Market Analyser)
export async function fetchDerivTickHistoryDirect(symbol: string, count = 100): Promise<number[]> {
  try {
    return await new Promise<number[]>((resolve, reject) => {
      const ws = new WebSocket('wss://ws.derivws.com/websockets/v3?app_id=1089&l=EN&brand=deriv');
      const timer = setTimeout(() => {
        try { ws.close(); } catch { /* ignore */ }
        reject(new Error('timeout'));
      }, 3500);

      ws.onopen = () => {
        ws.send(JSON.stringify({ ticks_history: symbol, adjust_start_time: 1, count, end: 'latest', style: 'ticks' }));
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          clearTimeout(timer);
          ws.close();
          if (msg.history?.prices?.length) {
            resolve(msg.history.prices.map((p: any) => Number(p)));
          } else {
            reject(new Error('no prices'));
          }
        } catch (err) {
          clearTimeout(timer);
          ws.close();
          reject(err);
        }
      };
      ws.onerror = (err) => {
        clearTimeout(timer);
        reject(err);
      };
    });
  } catch {
    const res = await apiFetch<{ latestPrice: number; recentDigits: number[] }>(
      `/api/market/digit-analysis?symbol=${encodeURIComponent(symbol)}&count=${count}`
    );
    return res.recentDigits.map((d) => Number(`${Math.floor(res.latestPrice)}.${d}`));
  }
}

export function subscribeDerivTicksDirect(
  symbol: string,
  onTick: (price: number, epoch: number) => void
): () => void {
  let closed = false;
  let ws: WebSocket | null = null;
  try {
    ws = new WebSocket('wss://ws.derivws.com/websockets/v3?app_id=1089&l=EN&brand=deriv');
    ws.onopen = () => {
      if (!closed && ws) {
        ws.send(JSON.stringify({ ticks: symbol, subscribe: 1 }));
      }
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.msg_type === 'tick' && msg.tick) {
          onTick(Number(msg.tick.quote), Number(msg.tick.epoch));
        }
      } catch {
        // ignore
      }
    };
  } catch {
    // ignore
  }
  return () => {
    closed = true;
    try { ws?.close(); } catch { /* ignore */ }
  };
}

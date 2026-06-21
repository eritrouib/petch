# @eritrouib/petchr

A zero-dependency, TypeScript-native fetch wrapper with retry, timeout, rate-limiting, and a clean API.

```bash
npm install @eritrouib/petchr
```

> **Requires Node.js 18+** (uses native `fetch`)

---

## Why petch?

Native `fetch` is now built into Node.js 18+, but it's verbose and missing the quality-of-life features every real-world API client needs. `petch` fills that gap:

| Feature | native `fetch` | axios | **petch** |
|---|---|---|---|
| Zero dependencies | ✅ | ❌ | ✅ |
| TypeScript-native | ❌ | partial | ✅ |
| Auto-retry w/ backoff | ❌ | ❌ | ✅ |
| Request timeout | ❌ | ✅ | ✅ |
| Rate limiting | ❌ | ❌ | ✅ |
| JSON body shorthand | ❌ | ✅ | ✅ |
| Query params object | ❌ | ✅ | ✅ |
| Shared instance config | ❌ | ✅ | ✅ |

---

## Quick Start

```typescript
import { petch } from 'petch';

const { data } = await petch<{ name: string }>('https://api.example.com/users/1');
console.log(data.name);
```

---

## Core API

### `petch(url, options?)`

```typescript
import { petch } from 'petch';

// GET with query params
const { data } = await petch<User[]>('https://api.example.com/users', {
  params: { page: 1, limit: 20 },
});

// POST with JSON body
const { data } = await petch<User>('https://api.example.com/users', {
  method: 'POST',
  json: { name: 'Alice', email: 'alice@example.com' },
});
```

### `createPetch(defaults)` — shared instance

```typescript
import { createPetch } from 'petch';

const api = createPetch({
  baseUrl: 'https://api.example.com',
  timeout: 10_000,
  headers: {
    Authorization: `Bearer ${process.env.API_TOKEN}`,
  },
  retry: { attempts: 3 },
});

// Clean, concise calls
const { data: user } = await api.get<User>('/users/1');
const { data: post } = await api.post<Post>('/posts', { json: { title: 'Hello' } });
await api.del('/posts/123');
```

---

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `method` | `HttpMethod` | `"GET"` | HTTP method |
| `baseUrl` | `string` | — | Prepended to all URLs |
| `timeout` | `number` | `30000` | Request timeout in ms |
| `params` | `object` | — | Query string parameters |
| `json` | `unknown` | — | JSON body (sets `Content-Type` automatically) |
| `headers` | `HeadersInit` | — | Request headers |
| `retry` | `RetryConfig \| false` | see below | Retry configuration |
| `rateLimit` | `RateLimitConfig` | — | Client-side rate limiting |
| `onRequest` | `function` | — | Called before each attempt |
| `onResponse` | `function` | — | Called after each response |
| `onRetry` | `function` | — | Called on each retry |

---

## Retry

By default, petch retries up to **3 times** on status codes `429, 502, 503, 504` with exponential backoff and jitter.

```typescript
await petch('https://api.example.com/data', {
  retry: {
    attempts: 5,        // max retry attempts
    delay: 1000,        // initial delay in ms
    backoff: 2,         // exponential multiplier
    maxDelay: 15_000,   // cap on delay
    retryOn: [429, 503],
    shouldRetry: (response, attempt) => {
      // custom logic — e.g. only retry on 503
      return response.status === 503 && attempt < 3;
    },
  },
  onRetry: (attempt, error, response) => {
    console.warn(`Retry ${attempt}:`, error?.message);
  },
});

// Disable retry entirely
await petch('https://api.example.com/data', { retry: false });
```

---

## Rate Limiting

Prevent hammering an API — petch queues requests and waits when the limit is reached.

```typescript
const api = createPetch({
  baseUrl: 'https://api.example.com',
  rateLimit: {
    maxRequests: 10,   // max 10 requests...
    windowMs: 1000,    // ...per second
  },
});

// These will be automatically throttled
await Promise.all(Array.from({ length: 50 }, (_, i) => api.get(`/item/${i}`)));
```

---

## Timeout

```typescript
// Throws PetchTimeoutError if request takes longer than 5 seconds
await petch('https://slow-api.example.com/data', { timeout: 5_000 });
```

---

## Error Handling

```typescript
import { petch, PetchError, PetchTimeoutError, PetchRateLimitError } from 'petch';

try {
  const { data } = await petch<User>('https://api.example.com/users/1');
} catch (err) {
  if (err instanceof PetchTimeoutError) {
    console.error(`Timed out after ${err.timeoutMs}ms`);
  } else if (err instanceof PetchRateLimitError) {
    console.error(`Rate limited. Retry after ${err.retryAfterMs}ms`);
  } else if (err instanceof PetchError) {
    console.error(`HTTP ${err.status}:`, err.message);
  }
}
```

---

## Lifecycle Hooks

```typescript
const api = createPetch({
  baseUrl: 'https://api.example.com',
  onRequest: (url, init) => {
    console.log(`→ ${init.method} ${url}`);
  },
  onResponse: (response) => {
    console.log(`← ${response.status} ${response.url}`);
  },
  onRetry: (attempt, error, response) => {
    console.warn(`Retry ${attempt} after ${error?.message}`);
  },
});
```

---

## License

MIT

import { PetchOptions, PetchResponse, PetchError, PetchTimeoutError, RetryConfig } from "./types.js";
import { RateLimiter } from "./rate-limiter.js";

const DEFAULT_RETRY: Required<RetryConfig> = {
  attempts: 3,
  delay: 500,
  backoff: 2,
  maxDelay: 10_000,
  retryOn: [429, 502, 503, 504],
  shouldRetry: () => true,
};

function buildUrl(url: string, baseUrl?: string, params?: PetchOptions["params"]): string {
  const fullUrl = baseUrl ? new URL(url, baseUrl).toString() : url;
  if (!params) return fullUrl;

  const u = new URL(fullUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value != null) {
      u.searchParams.set(key, String(value));
    }
  }
  return u.toString();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRetryDelay(attempt: number, config: Required<RetryConfig>): number {
  const raw = config.delay * Math.pow(config.backoff, attempt - 1);
  // Add jitter (±20%)
  const jitter = raw * 0.2 * (Math.random() * 2 - 1);
  return Math.min(raw + jitter, config.maxDelay);
}

export async function petch<T = unknown>(
  url: string,
  options: PetchOptions = {}
): Promise<PetchResponse<T>> {
  const {
    method = "GET",
    timeout = 30_000,
    baseUrl,
    retry,
    rateLimit,
    params,
    json,
    onRequest,
    onResponse,
    onRetry,
    headers: userHeaders = {},
    ...fetchInit
  } = options;

  // Rate limiting
  const limiter = rateLimit ? new RateLimiter(rateLimit) : null;
  if (limiter) await limiter.wait();

  const fullUrl = buildUrl(url, baseUrl, params);

  // Build headers
  const headers = new Headers(userHeaders as HeadersInit);
  if (json !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const init: RequestInit = {
    ...fetchInit,
    method,
    headers,
    body: json !== undefined ? JSON.stringify(json) : fetchInit.body,
  };

  // Resolve retry config
  const retryConfig: Required<RetryConfig> | false =
    retry === false ? false : { ...DEFAULT_RETRY, ...(retry ?? {}) };

  const maxAttempts = retryConfig === false ? 1 : (retryConfig.attempts ?? 1) + 1;

  let lastError: PetchError | null = null;
  let lastResponse: Response | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Abort controller for timeout
    const controller = new AbortController();
    const timer = timeout > 0
      ? setTimeout(() => controller.abort("timeout"), timeout)
      : null;

    if (init.signal) {
      // Chain with existing signal
      const outer = init.signal as AbortSignal;
      outer.addEventListener("abort", () => controller.abort(outer.reason));
    }

    try {
      if (onRequest) await onRequest(fullUrl, init);

      const response = await fetch(fullUrl, {
        ...init,
        signal: controller.signal,
      });

      if (onResponse) await onResponse(response);

      lastResponse = response;

      // Check if we should retry based on status
      if (!response.ok && retryConfig !== false && attempt < maxAttempts) {
        const shouldRetry =
          retryConfig.retryOn.includes(response.status) &&
          (await retryConfig.shouldRetry(response, attempt));

        if (shouldRetry) {
          lastError = new PetchError(
            `Request failed with status ${response.status}`,
            response.status,
            response,
            attempt
          );

          if (onRetry) onRetry(attempt, lastError, response);

          await delay(getRetryDelay(attempt, retryConfig));
          continue;
        }
      }

      if (!response.ok) {
        throw new PetchError(
          `Request failed with status ${response.status}`,
          response.status,
          response,
          attempt
        );
      }

      // Parse response
      const contentType = response.headers.get("Content-Type") ?? "";
      let data: T;

      if (contentType.includes("application/json")) {
        data = await response.json() as T;
      } else {
        data = await response.text() as unknown as T;
      }

      // Attach data to response object
      return Object.assign(response, { data }) as PetchResponse<T>;
    } catch (err) {
      if (err instanceof PetchError) throw err;

      // Timeout
      if (
        err instanceof DOMException && err.message === "timeout" ||
        (err instanceof Error && err.name === "AbortError" && controller.signal.reason === "timeout")
      ) {
        throw new PetchTimeoutError(timeout);
      }

      // Network error — retry
      if (retryConfig !== false && attempt < maxAttempts) {
        lastError = new PetchError(
          err instanceof Error ? err.message : "Network error",
          undefined,
          undefined,
          attempt
        );

        if (onRetry) onRetry(attempt, lastError, null);
        await delay(getRetryDelay(attempt, retryConfig));
        continue;
      }

      throw new PetchError(
        err instanceof Error ? err.message : "Network error",
        undefined,
        undefined,
        attempt
      );
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  // Should not reach here, but TypeScript needs it
  throw lastError ?? new PetchError("Request failed after all retry attempts", lastResponse?.status, lastResponse ?? undefined);
}

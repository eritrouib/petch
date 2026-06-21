export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

export interface RetryConfig {
  /** Number of retry attempts. Default: 3 */
  attempts?: number;
  /** Initial delay in ms before first retry. Default: 500 */
  delay?: number;
  /** Multiplier for exponential backoff. Default: 2 */
  backoff?: number;
  /** Max delay cap in ms. Default: 10000 */
  maxDelay?: number;
  /** HTTP status codes that should trigger a retry. Default: [429, 502, 503, 504] */
  retryOn?: number[];
  /** Custom function to determine if a retry should occur */
  shouldRetry?: (response: Response, attempt: number) => boolean | Promise<boolean>;
}

export interface RateLimitConfig {
  /** Max number of requests per window */
  maxRequests: number;
  /** Window duration in ms. Default: 1000 (1 second) */
  windowMs?: number;
}

export interface PetchOptions extends Omit<RequestInit, "method"> {
  /** HTTP method. Default: "GET" */
  method?: HttpMethod;
  /** Request timeout in ms. Default: 30000 */
  timeout?: number;
  /** Base URL prepended to all requests */
  baseUrl?: string;
  /** Retry configuration */
  retry?: RetryConfig | false;
  /** Rate limit configuration */
  rateLimit?: RateLimitConfig;
  /** Query string parameters */
  params?: Record<string, string | number | boolean | null | undefined>;
  /** JSON body (automatically sets Content-Type: application/json) */
  json?: unknown;
  /** Called before each request attempt */
  onRequest?: (url: string, init: RequestInit) => void | Promise<void>;
  /** Called after each response */
  onResponse?: (response: Response) => void | Promise<void>;
  /** Called on each retry */
  onRetry?: (attempt: number, error: PetchError | null, response: Response | null) => void;
}

export interface PetchResponse<T = unknown> extends Response {
  /** Parsed JSON data */
  data: T;
}

export class PetchError extends Error {
  status?: number;
  readonly response?: Response;
  readonly attempt?: number;

  constructor(
    message: string,
    status?: number,
    response?: Response,
    attempt?: number
  ) {
    super(message);
    this.name = "PetchError";
    this.status = status;
    this.response = response;
    this.attempt = attempt;
  }
}

export class PetchTimeoutError extends PetchError {
  constructor(public readonly timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`);
    this.name = "PetchTimeoutError";
  }
}

export class PetchRateLimitError extends PetchError {
  constructor(public readonly retryAfterMs: number) {
    super(`Rate limit exceeded. Retry after ${retryAfterMs}ms`);
    this.name = "PetchRateLimitError";
    this.status = 429;
  }
}

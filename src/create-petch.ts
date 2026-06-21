import { PetchOptions, PetchResponse } from "./types.js";
import { petch } from "./petch.js";

export interface PetchInstance {
  <T = unknown>(url: string, options?: PetchOptions): Promise<PetchResponse<T>>;
  get<T = unknown>(url: string, options?: Omit<PetchOptions, "method">): Promise<PetchResponse<T>>;
  post<T = unknown>(url: string, options?: Omit<PetchOptions, "method">): Promise<PetchResponse<T>>;
  put<T = unknown>(url: string, options?: Omit<PetchOptions, "method">): Promise<PetchResponse<T>>;
  patch<T = unknown>(url: string, options?: Omit<PetchOptions, "method">): Promise<PetchResponse<T>>;
  del<T = unknown>(url: string, options?: Omit<PetchOptions, "method">): Promise<PetchResponse<T>>;
}

/**
 * Create a petch instance with shared default options.
 *
 * @example
 * const api = createPetch({
 *   baseUrl: 'https://api.example.com',
 *   headers: { Authorization: 'Bearer token' },
 *   retry: { attempts: 3 },
 * });
 *
 * const { data } = await api.get<User>('/users/1');
 */
export function createPetch(defaults: PetchOptions = {}): PetchInstance {
  function instance<T = unknown>(url: string, options: PetchOptions = {}): Promise<PetchResponse<T>> {
    return petch<T>(url, mergeOptions(defaults, options));
  }

  instance.get = <T = unknown>(url: string, options: Omit<PetchOptions, "method"> = {}) =>
    instance<T>(url, { ...options, method: "GET" });

  instance.post = <T = unknown>(url: string, options: Omit<PetchOptions, "method"> = {}) =>
    instance<T>(url, { ...options, method: "POST" });

  instance.put = <T = unknown>(url: string, options: Omit<PetchOptions, "method"> = {}) =>
    instance<T>(url, { ...options, method: "PUT" });

  instance.patch = <T = unknown>(url: string, options: Omit<PetchOptions, "method"> = {}) =>
    instance<T>(url, { ...options, method: "PATCH" });

  instance.del = <T = unknown>(url: string, options: Omit<PetchOptions, "method"> = {}) =>
    instance<T>(url, { ...options, method: "DELETE" });

  return instance as PetchInstance;
}

function mergeOptions(defaults: PetchOptions, options: PetchOptions): PetchOptions {
  return {
    ...defaults,
    ...options,
    headers: {
      ...(defaults.headers as Record<string, string> ?? {}),
      ...(options.headers as Record<string, string> ?? {}),
    },
    retry:
      options.retry === false
        ? false
        : options.retry || defaults.retry
          ? { ...(typeof defaults.retry === "object" ? defaults.retry : {}), ...(typeof options.retry === "object" ? options.retry : {}) }
          : undefined,
  };
}

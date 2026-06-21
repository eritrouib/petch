import { describe, it, expect, beforeEach, vi } from 'vitest'
import { petch, createPetch, PetchError, PetchTimeoutError } from "../src/index.js";

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

function mockResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  const responseHeaders = new Headers({
    "Content-Type": "application/json",
    ...headers,
  });
  return new Response(JSON.stringify(body), { status, headers: responseHeaders });
}

function mockTextResponse(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: new Headers({ "Content-Type": "text/plain" }),
  });
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("petch()", () => {
  it("makes a basic GET request and parses JSON", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ hello: "world" }));

    const res = await petch<{ hello: string }>("https://example.com/api");

    expect(res.data).toEqual({ hello: "world" });
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("sends JSON body and sets Content-Type header", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ ok: true }));

    await petch("https://example.com/api", {
      method: "POST",
      json: { name: "test" },
    });

    const [, init] = mockFetch.mock.calls[0];
    expect(init.body).toBe(JSON.stringify({ name: "test" }));
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
  });

  it("appends query params to the URL", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({}));

    await petch("https://example.com/api", {
      params: { page: 1, q: "hello", empty: null },
    });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("page=1");
    expect(url).toContain("q=hello");
    expect(url).not.toContain("empty");
  });

  it("prepends baseUrl", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({}));

    await petch("/users", { baseUrl: "https://api.example.com" });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.example.com/users");
  });

  it("parses text response when Content-Type is not JSON", async () => {
    mockFetch.mockResolvedValueOnce(mockTextResponse("hello plain"));

    const res = await petch<string>("https://example.com/text");
    expect(res.data).toBe("hello plain");
  });

  it("throws PetchError on non-ok status", async () => {
    mockFetch.mockResolvedValue(mockResponse({ error: "not found" }, 404));

    await expect(petch("https://example.com/api", { retry: false })).rejects.toThrow(PetchError);
    await expect(petch("https://example.com/api", { retry: false })).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("retry", () => {
  it("retries on 503 and succeeds on third attempt", async () => {
    mockFetch
      .mockResolvedValueOnce(mockResponse({}, 503))
      .mockResolvedValueOnce(mockResponse({}, 503))
      .mockResolvedValueOnce(mockResponse({ ok: true }));

    const res = await petch<{ ok: boolean }>("https://example.com/api", {
      retry: { attempts: 3, delay: 1, backoff: 1 },
    });

    expect(res.data.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("throws after exhausting all retries", async () => {
    mockFetch.mockResolvedValue(mockResponse({}, 503));

    await expect(
      petch("https://example.com/api", {
        retry: { attempts: 2, delay: 1, backoff: 1 },
      })
    ).rejects.toThrow(PetchError);

    expect(mockFetch).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it("calls onRetry callback on each retry", async () => {
    mockFetch
      .mockResolvedValueOnce(mockResponse({}, 503))
      .mockResolvedValueOnce(mockResponse({ ok: true }));

    const onRetry = vi.fn();

    await petch("https://example.com/api", {
      retry: { attempts: 2, delay: 1, backoff: 1 },
      onRetry,
    });

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(PetchError), expect.any(Response));
  });

  it("does not retry when retry: false", async () => {
    mockFetch.mockResolvedValue(mockResponse({}, 503));

    await expect(petch("https://example.com/api", { retry: false })).rejects.toThrow(PetchError);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("does not retry on 404 by default", async () => {
    mockFetch.mockResolvedValue(mockResponse({}, 404));

    await expect(
      petch("https://example.com/api", {
        retry: { attempts: 3, delay: 1 },
      })
    ).rejects.toMatchObject({ status: 404 });

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe("timeout", () => {
  it("throws PetchTimeoutError when request exceeds timeout", async () => {
    mockFetch.mockImplementationOnce(
      () => new Promise((_, reject) =>
        setTimeout(() => {
          const err = new Error("timeout");
          err.name = "AbortError";
          reject(err);
        }, 50)
      )
    );

    await expect(
      petch("https://example.com/api", { timeout: 10, retry: false })
    ).rejects.toThrow(PetchTimeoutError);
  }, 10000);
});

describe("lifecycle hooks", () => {
  it("calls onRequest before fetch", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({}));
    const onRequest = vi.fn();

    await petch("https://example.com/api", { onRequest });
    expect(onRequest).toHaveBeenCalledWith("https://example.com/api", expect.any(Object));
  });

  it("calls onResponse after fetch", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({}));
    const onResponse = vi.fn();

    await petch("https://example.com/api", { onResponse });
    expect(onResponse).toHaveBeenCalledWith(expect.any(Response));
  });
});

describe("createPetch()", () => {
  it("creates an instance with default options", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ id: 1 }));

    const api = createPetch({
      baseUrl: "https://api.example.com",
      headers: { Authorization: "Bearer token" },
      retry: false,
    });

    await api.get("/users/1");

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.example.com/users/1");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer token");
  });

  it("merges per-request headers with defaults", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({}));

    const api = createPetch({
      headers: { Authorization: "Bearer token" },
      retry: false,
    });

    await api.get("https://example.com/api", {
      headers: { "X-Custom": "yes" },
    });

    const [, init] = mockFetch.mock.calls[0];
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe("Bearer token");
    expect(headers.get("X-Custom")).toBe("yes");
  });

  it("exposes convenience methods: post, put, patch, del", async () => {
    for (const [method, fn] of [
      ["POST", "post"],
      ["PUT", "put"],
      ["PATCH", "patch"],
      ["DELETE", "del"],
    ] as const) {
      mockFetch.mockResolvedValueOnce(mockResponse({}));
      const api = createPetch({ retry: false });
      await api[fn]("https://example.com/api");
      const [, init] = mockFetch.mock.calls.at(-1)!;
      expect(init.method).toBe(method);
    }
  });
});

/**
 * TypeScript HTTP client for API integration tests.
 * Uses native Node.js fetch (Node 18+). No third-party deps.
 */

export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

export interface ApiResponse<T = JsonValue> {
  status: number;
  body: T;
  headers: Headers;
}

export class ApiClient {
  baseUrl: string;
  cookie: string | null = null;
  bearerToken: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  private buildHeaders(extra?: Record<string, string>): Record<string, string> {
    const h: Record<string, string> = {};
    if (this.cookie) h["Cookie"] = this.cookie;
    if (this.bearerToken) h["Authorization"] = `Bearer ${this.bearerToken}`;
    if (extra) Object.assign(h, extra);
    return h;
  }

  async request<T = JsonValue>(
    method: string,
    path: string,
    opts: {
      body?: unknown;
      headers?: Record<string, string>;
      rawBody?: BodyInit;
      contentType?: string;
    } = {}
  ): Promise<ApiResponse<T>> {
    const url = this.baseUrl + path;
    const headers = this.buildHeaders(opts.headers);

    let body: BodyInit | undefined;
    if (opts.rawBody !== undefined) {
      body = opts.rawBody;
    } else if (opts.body !== undefined) {
      body = JSON.stringify(opts.body);
      headers["Content-Type"] = opts.contentType ?? "application/json";
    }

    const res = await fetch(url, { method, headers, body, redirect: "manual" });

    // Capture Set-Cookie
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) {
      this.cookie = setCookie.split(";")[0].trim();
    }

    let parsed: T;
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      parsed = (await res.json()) as T;
    } else {
      parsed = (await res.text()) as unknown as T;
    }

    return { status: res.status, body: parsed, headers: res.headers };
  }

  async get<T = JsonValue>(path: string, headers?: Record<string, string>): Promise<ApiResponse<T>> {
    return this.request<T>("GET", path, { headers });
  }

  async post<T = JsonValue>(path: string, body?: unknown, headers?: Record<string, string>): Promise<ApiResponse<T>> {
    return this.request<T>("POST", path, { body, headers });
  }

  async put<T = JsonValue>(path: string, body?: unknown, headers?: Record<string, string>): Promise<ApiResponse<T>> {
    return this.request<T>("PUT", path, { body, headers });
  }

  async patch<T = JsonValue>(path: string, body?: unknown, headers?: Record<string, string>): Promise<ApiResponse<T>> {
    return this.request<T>("PATCH", path, { body, headers });
  }

  async delete<T = JsonValue>(path: string, headers?: Record<string, string>): Promise<ApiResponse<T>> {
    return this.request<T>("DELETE", path, { headers });
  }

  /** Login and capture session cookie */
  async login(identifier: string, password: string): Promise<ApiResponse> {
    const res = await this.post("/api/auth/login", { identifier, password });
    return res;
  }

  /** Returns a fresh unauthenticated client pointing at the same base URL */
  anonymous(): ApiClient {
    return new ApiClient(this.baseUrl);
  }

  /** Returns a copy of this client using a Bearer token instead of cookie */
  withBearer(token: string): ApiClient {
    const c = new ApiClient(this.baseUrl);
    c.bearerToken = token;
    return c;
  }
}

import { TaskQueueClientOptions } from "./types";

export class HttpClient {
  private baseUrl: string;
  private headers: Record<string, string>;
  private timeout: number;

  constructor(options: TaskQueueClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.timeout = options.timeout || 10000;
    this.headers = { "Content-Type": "application/json" };
    if (options.apiKey) this.headers["x-api-key"] = options.apiKey;
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: this.headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      return data as T;
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "AbortError")
        throw new Error(`Request timed out after ${this.timeout}ms`);
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
}

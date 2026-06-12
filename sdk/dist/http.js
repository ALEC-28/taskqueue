"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpClient = void 0;
class HttpClient {
    constructor(options) {
        this.baseUrl = options.baseUrl.replace(/\/$/, "");
        this.timeout = options.timeout || 10000;
        this.headers = { "Content-Type": "application/json" };
        if (options.apiKey)
            this.headers["x-api-key"] = options.apiKey;
    }
    async get(path) {
        return this.request("GET", path);
    }
    async post(path, body) {
        return this.request("POST", path, body);
    }
    async request(method, path, body) {
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
            if (!res.ok)
                throw new Error(data.error || `HTTP ${res.status}`);
            return data;
        }
        catch (e) {
            if (e instanceof Error && e.name === "AbortError")
                throw new Error(`Request timed out after ${this.timeout}ms`);
            throw e;
        }
        finally {
            clearTimeout(timer);
        }
    }
}
exports.HttpClient = HttpClient;
//# sourceMappingURL=http.js.map
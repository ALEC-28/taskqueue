"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.api = api;
const DEFAULT_BASE = 'http://localhost:3000';
async function api(path, opts = {}) {
    const base = process.env.TQ_BASE_URL ?? DEFAULT_BASE;
    const res = await fetch(`${base}${path}`, {
        ...opts,
        headers: { 'Content-Type': 'application/json', ...opts.headers },
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`${res.status} ${res.statusText}: ${text}`);
    }
    return res.json();
}

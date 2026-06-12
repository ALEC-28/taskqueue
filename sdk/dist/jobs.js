"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JobsClient = void 0;
class JobsClient {
    constructor(http) {
        this.http = http;
    }
    async enqueue(options) {
        return this.http.post("/jobs", options);
    }
    async get(jobId) {
        return this.http.get(`/jobs/${jobId}`);
    }
    async list(options = {}) {
        const params = new URLSearchParams();
        if (options.status)
            params.set("status", options.status);
        if (options.limit)
            params.set("limit", String(options.limit));
        const qs = params.toString();
        return this.http.get(`/jobs${qs ? "?" + qs : ""}`);
    }
    async requeue(jobId) {
        return this.http.post(`/jobs/${jobId}/requeue`);
    }
}
exports.JobsClient = JobsClient;
//# sourceMappingURL=jobs.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkflowsClient = void 0;
class WorkflowsClient {
    constructor(http) {
        this.http = http;
    }
    async create(options) {
        return this.http.post("/workflows", options);
    }
    async get(workflowId) {
        return this.http.get(`/workflows/${workflowId}`);
    }
    async list() {
        return this.http.get("/workflows");
    }
    async generate(description) {
        return this.http.post("/workflows/generate", { description });
    }
}
exports.WorkflowsClient = WorkflowsClient;
//# sourceMappingURL=workflows.js.map
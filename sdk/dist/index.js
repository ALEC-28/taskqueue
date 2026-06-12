"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskQueueClient = void 0;
const http_1 = require("./http");
const jobs_1 = require("./jobs");
const workflows_1 = require("./workflows");
class TaskQueueClient {
    constructor(options) {
        const http = new http_1.HttpClient(options);
        this.jobs = new jobs_1.JobsClient(http);
        this.workflows = new workflows_1.WorkflowsClient(http);
    }
}
exports.TaskQueueClient = TaskQueueClient;
__exportStar(require("./types"), exports);
//# sourceMappingURL=index.js.map
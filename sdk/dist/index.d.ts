import { JobsClient } from "./jobs";
import { WorkflowsClient } from "./workflows";
import { TaskQueueClientOptions } from "./types";
export declare class TaskQueueClient {
    jobs: JobsClient;
    workflows: WorkflowsClient;
    constructor(options: TaskQueueClientOptions);
}
export * from "./types";
//# sourceMappingURL=index.d.ts.map
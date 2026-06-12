import { HttpClient } from "./http";
import { Workflow, CreateWorkflowOptions } from "./types";
export declare class WorkflowsClient {
    private http;
    constructor(http: HttpClient);
    create(options: CreateWorkflowOptions): Promise<Workflow>;
    get(workflowId: string): Promise<Workflow>;
    list(): Promise<Workflow[]>;
    generate(description: string): Promise<Workflow>;
}
//# sourceMappingURL=workflows.d.ts.map
import { HttpClient } from "./http";
import { Workflow, CreateWorkflowOptions } from "./types";

export class WorkflowsClient {
  constructor(private http: HttpClient) {}

  async create(options: CreateWorkflowOptions): Promise<Workflow> {
    return this.http.post<Workflow>("/workflows", options);
  }

  async get(workflowId: string): Promise<Workflow> {
    return this.http.get<Workflow>(`/workflows/${workflowId}`);
  }

  async list(): Promise<Workflow[]> {
    return this.http.get<Workflow[]>("/workflows");
  }

  async generate(description: string): Promise<Workflow> {
    return this.http.post<Workflow>("/workflows/generate", { description });
  }
}

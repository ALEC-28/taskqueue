import { HttpClient } from "./http";
import { JobsClient } from "./jobs";
import { WorkflowsClient } from "./workflows";
import { TaskQueueClientOptions } from "./types";

export class TaskQueueClient {
  public jobs: JobsClient;
  public workflows: WorkflowsClient;

  constructor(options: TaskQueueClientOptions) {
    const http = new HttpClient(options);
    this.jobs = new JobsClient(http);
    this.workflows = new WorkflowsClient(http);
  }
}

export * from "./types";

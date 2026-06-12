export type JobStatus = "pending" | "running" | "done" | "failed" | "retrying";
export type QueueName = "high" | "default" | "low";
export interface Job {
    id: string;
    name: string;
    queue: QueueName;
    status: JobStatus;
    payload: Record<string, unknown>;
    attempts: number;
    max_attempts: number;
    error?: string;
    worker_id?: string;
    created_at: string;
    updated_at: string;
}
export interface EnqueueOptions {
    name: string;
    queue?: QueueName;
    payload?: Record<string, unknown>;
    delay_seconds?: number;
    max_attempts?: number;
}
export interface ListJobsOptions {
    status?: JobStatus;
    limit?: number;
}
export interface WorkflowStep {
    name: string;
    job_name: string;
    queue?: QueueName;
    depends_on?: string[];
}
export interface Workflow {
    id: string;
    name: string;
    status: JobStatus;
    steps: WorkflowStep[];
    created_at: string;
}
export interface CreateWorkflowOptions {
    name: string;
    steps: WorkflowStep[];
}
export interface TaskQueueClientOptions {
    baseUrl: string;
    apiKey?: string;
    timeout?: number;
}
//# sourceMappingURL=types.d.ts.map
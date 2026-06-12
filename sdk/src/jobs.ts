import { HttpClient } from "./http";
import { Job, EnqueueOptions, ListJobsOptions } from "./types";

export class JobsClient {
  constructor(private http: HttpClient) {}

  async enqueue(options: EnqueueOptions): Promise<Job> {
    return this.http.post<Job>("/jobs", options);
  }

  async get(jobId: string): Promise<Job> {
    return this.http.get<Job>(`/jobs/${jobId}`);
  }

  async list(options: ListJobsOptions = {}): Promise<Job[]> {
    const params = new URLSearchParams();
    if (options.status) params.set("status", options.status);
    if (options.limit)  params.set("limit", String(options.limit));
    const qs = params.toString();
    return this.http.get<Job[]>(`/jobs${qs ? "?" + qs : ""}`);
  }

  async requeue(jobId: string): Promise<Job> {
    return this.http.post<Job>(`/jobs/${jobId}/requeue`);
  }
}

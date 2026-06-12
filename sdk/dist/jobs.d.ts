import { HttpClient } from "./http";
import { Job, EnqueueOptions, ListJobsOptions } from "./types";
export declare class JobsClient {
    private http;
    constructor(http: HttpClient);
    enqueue(options: EnqueueOptions): Promise<Job>;
    get(jobId: string): Promise<Job>;
    list(options?: ListJobsOptions): Promise<Job[]>;
    requeue(jobId: string): Promise<Job>;
}
//# sourceMappingURL=jobs.d.ts.map
import { TaskQueueClientOptions } from "./types";
export declare class HttpClient {
    private baseUrl;
    private headers;
    private timeout;
    constructor(options: TaskQueueClientOptions);
    get<T>(path: string): Promise<T>;
    post<T>(path: string, body?: unknown): Promise<T>;
    private request;
}
//# sourceMappingURL=http.d.ts.map
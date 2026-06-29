"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.jobsCommand = jobsCommand;
const commander_1 = require("commander");
const http_1 = require("../http");
const ui_1 = require("../ui");
function jobsCommand() {
    const cmd = new commander_1.Command('jobs');
    // tq jobs list [--status <status>] [--queue <queue>]
    cmd
        .command('list')
        .description('List jobs')
        .option('-s, --status <status>', 'Filter by status (pending|running|done|retrying|failed)')
        .option('-q, --queue <queue>', 'Filter by queue')
        .option('-n, --limit <n>', 'Max results', '50')
        .action(async (opts) => {
        try {
            const params = new URLSearchParams();
            if (opts.status)
                params.set('status', opts.status);
            if (opts.queue)
                params.set('queue', opts.queue);
            params.set('limit', opts.limit);
            const jobs = await (0, http_1.api)(`/jobs?${params}`);
            if (!jobs.length) {
                console.log('No jobs found.');
                return;
            }
            (0, ui_1.table)(['ID', 'Name', 'Queue', 'Status', 'Attempts', 'Created'], jobs.map((j) => [
                j.id.slice(0, 8),
                j.name,
                j.queue,
                (0, ui_1.statusColor)(j.status),
                String(j.attempts ?? 0),
                new Date(j.created_at).toLocaleString(),
            ]));
        }
        catch (e) {
            (0, ui_1.err)(e.message);
        }
    });
    // tq jobs get <id>
    cmd
        .command('get <id>')
        .description('Get a job by ID')
        .action(async (id) => {
        try {
            const j = await (0, http_1.api)(`/jobs/${id}`);
            console.log(JSON.stringify(j, null, 2));
        }
        catch (e) {
            (0, ui_1.err)(e.message);
        }
    });
    // tq jobs enqueue <name> [--queue <q>] [--payload <json>] [--delay <s>]
    cmd
        .command('enqueue <name>')
        .description('Submit a new job')
        .option('-q, --queue <queue>', 'Queue name', 'default')
        .option('-p, --payload <json>', 'JSON payload', '{}')
        .option('-d, --delay <seconds>', 'Delay in seconds', '0')
        .option('--priority <n>', 'Priority (higher = first)', '0')
        .action(async (name, opts) => {
        try {
            const body = {
                name,
                queue: opts.queue,
                payload: JSON.parse(opts.payload),
                priority: Number(opts.priority),
            };
            if (Number(opts.delay) > 0)
                body.delay_seconds = Number(opts.delay);
            const res = await (0, http_1.api)('/jobs', { method: 'POST', body: JSON.stringify(body) });
            (0, ui_1.ok)(`Job enqueued — ID: ${res.id}`);
        }
        catch (e) {
            (0, ui_1.err)(e.message);
        }
    });
    // tq jobs requeue <id>
    cmd
        .command('requeue <id>')
        .description('Requeue a failed job')
        .action(async (id) => {
        try {
            await (0, http_1.api)(`/jobs/${id}/requeue`, { method: 'POST' });
            (0, ui_1.ok)(`Job ${id} requeued`);
        }
        catch (e) {
            (0, ui_1.err)(e.message);
        }
    });
    return cmd;
}

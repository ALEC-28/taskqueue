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
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.workflowsCommand = workflowsCommand;
const commander_1 = require("commander");
const http_1 = require("../http");
const ui_1 = require("../ui");
const chalk_1 = __importDefault(require("chalk"));
function workflowsCommand() {
    const cmd = new commander_1.Command('workflows');
    // tq workflows list
    cmd
        .command('list')
        .description('List workflows')
        .action(async () => {
        try {
            const wfs = await (0, http_1.api)('/workflows');
            if (!wfs.length) {
                console.log('No workflows found.');
                return;
            }
            (0, ui_1.table)(['ID', 'Name', 'Status', 'Steps', 'Created'], wfs.map((w) => [
                w.id.slice(0, 8),
                w.name,
                (0, ui_1.statusColor)(w.status),
                String(w.step_count ?? '?'),
                new Date(w.created_at).toLocaleString(),
            ]));
        }
        catch (e) {
            (0, ui_1.err)(e.message);
        }
    });
    // tq workflows get <id>
    cmd
        .command('get <id>')
        .description('Get workflow + step status')
        .action(async (id) => {
        try {
            const w = await (0, http_1.api)(`/workflows/${id}`);
            console.log(`\n${chalk_1.default.bold(w.name)} — ${(0, ui_1.statusColor)(w.status)}\n`);
            if (w.steps?.length) {
                (0, ui_1.table)(['Step', 'Job', 'Queue', 'Status', 'Depends On'], w.steps.map((s) => [
                    s.name,
                    s.job_name,
                    s.queue,
                    (0, ui_1.statusColor)(s.status),
                    (s.depends_on ?? []).join(', ') || chalk_1.default.grey('—'),
                ]));
            }
        }
        catch (e) {
            (0, ui_1.err)(e.message);
        }
    });
    // tq workflows generate "plain english description"
    cmd
        .command('generate <description>')
        .description('Generate + run a workflow from plain English')
        .option('--dry-run', 'Print generated DAG without executing', false)
        .action(async (description, opts) => {
        try {
            console.log(chalk_1.default.cyan('⟳') + ' Sending to LLM...');
            const res = await (0, http_1.api)('/workflows/generate', {
                method: 'POST',
                body: JSON.stringify({ description, dry_run: opts.dryRun }),
            });
            if (opts.dryRun) {
                console.log('\nGenerated DAG:');
                console.log(JSON.stringify(res.dag ?? res, null, 2));
            }
            else {
                (0, ui_1.ok)(`Workflow created — ID: ${res.id}`);
                console.log();
                if (res.steps?.length) {
                    (0, ui_1.table)(['Step', 'Job', 'Queue', 'Depends On'], res.steps.map((s) => [
                        s.name,
                        s.job_name,
                        s.queue,
                        (s.depends_on ?? []).join(', ') || chalk_1.default.grey('—'),
                    ]));
                }
            }
        }
        catch (e) {
            (0, ui_1.err)(e.message);
        }
    });
    // tq workflows run <json-file>
    cmd
        .command('run <file>')
        .description('Submit a workflow from a JSON definition file')
        .action(async (file) => {
        try {
            const { readFileSync } = await Promise.resolve().then(() => __importStar(require('fs')));
            const def = JSON.parse(readFileSync(file, 'utf8'));
            const res = await (0, http_1.api)('/workflows', { method: 'POST', body: JSON.stringify(def) });
            (0, ui_1.ok)(`Workflow started — ID: ${res.id}`);
        }
        catch (e) {
            (0, ui_1.err)(e.message);
        }
    });
    return cmd;
}

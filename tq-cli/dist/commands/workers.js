"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.workersCommand = workersCommand;
const commander_1 = require("commander");
const http_1 = require("../http");
const ui_1 = require("../ui");
const chalk_1 = __importDefault(require("chalk"));
function workersCommand() {
    const cmd = new commander_1.Command('workers');
    cmd
        .command('status')
        .description('Show live worker health')
        .action(async () => {
        try {
            const workers = await (0, http_1.api)('/workers');
            if (!workers.length) {
                console.log('No workers found.');
                return;
            }
            (0, ui_1.table)(['Worker ID', 'Current Job', 'Last Heartbeat', 'Health'], workers.map((w) => {
                const secAgo = Math.floor((Date.now() - new Date(w.last_heartbeat).getTime()) / 1000);
                const healthy = secAgo < 30;
                return [
                    w.worker_id.slice(0, 12),
                    w.current_job_id ? w.current_job_id.slice(0, 8) : chalk_1.default.grey('idle'),
                    `${secAgo}s ago`,
                    healthy ? chalk_1.default.green('● alive') : chalk_1.default.red('● stale'),
                ];
            }));
        }
        catch (e) {
            (0, ui_1.err)(e.message);
        }
    });
    return cmd;
}

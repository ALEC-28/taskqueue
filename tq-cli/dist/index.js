#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const jobs_1 = require("./commands/jobs");
const workers_1 = require("./commands/workers");
const workflows_1 = require("./commands/workflows");
const program = new commander_1.Command();
program
    .name('tq')
    .description('TaskQueue CLI')
    .version('0.1.0')
    .option('--base-url <url>', 'API base URL (overrides TQ_BASE_URL env)', '')
    .hook('preAction', (thisCommand) => {
    const url = thisCommand.opts().baseUrl;
    if (url)
        process.env.TQ_BASE_URL = url;
});
program.addCommand((0, jobs_1.jobsCommand)());
program.addCommand((0, workers_1.workersCommand)());
program.addCommand((0, workflows_1.workflowsCommand)());
program.parse();

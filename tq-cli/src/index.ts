#!/usr/bin/env node
import { Command } from 'commander'
import { jobsCommand } from './commands/jobs'
import { workersCommand } from './commands/workers'
import { workflowsCommand } from './commands/workflows'

const program = new Command()

program
  .name('tq')
  .description('TaskQueue CLI')
  .version('0.1.0')
  .option('--base-url <url>', 'API base URL (overrides TQ_BASE_URL env)', '')
  .hook('preAction', (thisCommand) => {
    const url = thisCommand.opts().baseUrl
    if (url) process.env.TQ_BASE_URL = url
  })

program.addCommand(jobsCommand())
program.addCommand(workersCommand())
program.addCommand(workflowsCommand())

program.parse()

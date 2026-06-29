import { Command } from 'commander'
import { api } from '../http'
import { table, ok, err, statusColor } from '../ui'
import chalk from 'chalk'

export function workflowsCommand(): Command {
  const cmd = new Command('workflows')

  // tq workflows list
  cmd
    .command('list')
    .description('List workflows')
    .action(async () => {
      try {
        const wfs = await api('/workflows')
        if (!wfs.length) { console.log('No workflows found.'); return }
        table(
          ['ID', 'Name', 'Status', 'Steps', 'Created'],
          wfs.map((w: any) => [
            w.id.slice(0, 8),
            w.name,
            statusColor(w.status),
            String(w.step_count ?? '?'),
            new Date(w.created_at).toLocaleString(),
          ])
        )
      } catch (e: any) { err(e.message) }
    })

  // tq workflows get <id>
  cmd
    .command('get <id>')
    .description('Get workflow + step status')
    .action(async (id) => {
      try {
        const w = await api(`/workflows/${id}`)
        console.log(`\n${chalk.bold(w.name)} — ${statusColor(w.status)}\n`)
        if (w.steps?.length) {
          table(
            ['Step', 'Job', 'Queue', 'Status', 'Depends On'],
            w.steps.map((s: any) => [
              s.name,
              s.job_name,
              s.queue,
              statusColor(s.status),
              (s.depends_on ?? []).join(', ') || chalk.grey('—'),
            ])
          )
        }
      } catch (e: any) { err(e.message) }
    })

  // tq workflows generate "plain english description"
  cmd
    .command('generate <description>')
    .description('Generate + run a workflow from plain English')
    .option('--dry-run', 'Print generated DAG without executing', false)
    .action(async (description, opts) => {
      try {
        console.log(chalk.cyan('⟳') + ' Sending to LLM...')
        const res = await api('/workflows/generate', {
          method: 'POST',
          body: JSON.stringify({ description, dry_run: opts.dryRun }),
        })
        if (opts.dryRun) {
          console.log('\nGenerated DAG:')
          console.log(JSON.stringify(res.dag ?? res, null, 2))
        } else {
          ok(`Workflow created — ID: ${res.id}`)
          console.log()
          if (res.steps?.length) {
            table(
              ['Step', 'Job', 'Queue', 'Depends On'],
              res.steps.map((s: any) => [
                s.name,
                s.job_name,
                s.queue,
                (s.depends_on ?? []).join(', ') || chalk.grey('—'),
              ])
            )
          }
        }
      } catch (e: any) { err(e.message) }
    })

  // tq workflows run <json-file>
  cmd
    .command('run <file>')
    .description('Submit a workflow from a JSON definition file')
    .action(async (file) => {
      try {
        const { readFileSync } = await import('fs')
        const def = JSON.parse(readFileSync(file, 'utf8'))
        const res = await api('/workflows', { method: 'POST', body: JSON.stringify(def) })
        ok(`Workflow started — ID: ${res.id}`)
      } catch (e: any) { err(e.message) }
    })

  return cmd
}

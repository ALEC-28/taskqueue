import { Command } from 'commander'
import { api } from '../http'
import { table, err } from '../ui'
import chalk from 'chalk'

export function workersCommand(): Command {
  const cmd = new Command('workers')

  cmd
    .command('status')
    .description('Show live worker health')
    .action(async () => {
      try {
        const workers = await api('/workers')
        if (!workers.length) { console.log('No workers found.'); return }
        table(
          ['Worker ID', 'Current Job', 'Last Heartbeat', 'Health'],
          workers.map((w: any) => {
            const secAgo = Math.floor((Date.now() - new Date(w.last_heartbeat).getTime()) / 1000)
            const healthy = secAgo < 30
            return [
              w.worker_id.slice(0, 12),
              w.current_job_id ? w.current_job_id.slice(0, 8) : chalk.grey('idle'),
              `${secAgo}s ago`,
              healthy ? chalk.green('● alive') : chalk.red('● stale'),
            ]
          })
        )
      } catch (e: any) { err(e.message) }
    })

  return cmd
}

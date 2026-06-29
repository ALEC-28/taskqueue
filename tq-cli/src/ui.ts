import chalk from 'chalk'
import Table from 'cli-table3'

export function table(head: string[], rows: string[][]): void {
  const t = new Table({
    head: head.map(h => chalk.cyan(h)),
    style: { border: ['grey'] },
  })
  rows.forEach(r => t.push(r))
  console.log(t.toString())
}

export function ok(msg: string): void {
  console.log(chalk.green('✓') + ' ' + msg)
}

export function err(msg: string): void {
  console.error(chalk.red('✗') + ' ' + msg)
}

export function statusColor(s: string): string {
  const map: Record<string, chalk.Chalk> = {
    done: chalk.green,
    running: chalk.yellow,
    pending: chalk.blue,
    retrying: chalk.magenta,
    failed: chalk.red,
  }
  return (map[s] ?? chalk.white)(s)
}

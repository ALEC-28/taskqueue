const DEFAULT_BASE = 'http://localhost:3000'

export async function api(path: string, opts: RequestInit = {}): Promise<any> {
  const base = process.env.TQ_BASE_URL ?? DEFAULT_BASE
  const res = await fetch(`${base}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts.headers },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${res.status} ${res.statusText}: ${text}`)
  }
  return res.json()
}

import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * FB-S5: a search keyword is behaviour data — what a reader looked for, not just what they stored —
 * so it must not reach the logs. The audit behind this test found two layers and only one of them is
 * ours to hold:
 *
 * - In the Worker, no music route writes the query or the request URL anywhere. Every `console.*`
 *   call in `src/worker/routes/music` logs an error object and a fixed `[inkstone] ...` label; the
 *   keyword is read from `c.req.query` and handed straight to the upstream. This test keeps the next
 *   log line from quietly starting to include it — an error object is the whole of what may be
 *   printed.
 * - Outside the Worker, the keyword travels in the URL (`/api/music/provider/search?keywords=…`,
 *   `/api/music/lyric-search?q=…`, `/api/music/alist?keywords=…`), so any HTTP log layer records it
 *   as request metadata — `wrangler dev` does not print request lines here (checked: the ephemeral
 *   instance's log holds none), but a deployment with `[observability] enabled = true` attaches the
 *   request to each log line. That residual exposure is stated in `SECURITY.md` rather than left
 *   implicit; this test is about the layer that is ours.
 *
 * The scan is asserted to find the calls it is about, so a reorganisation that empties it fails as a
 * missing audit instead of passing as a clean one.
 */
const MUSIC_ROOT = path.resolve('src/worker/routes/music')
const LOG_CALL = /console\.(?:log|info|warn|error|debug)\(/g
// Anything that would put the reader's own text (or the URL that carries it) into a log line.
const LEAKS_REQUEST_TEXT = /keywords|c\.req\.query|c\.req\.url|c\.req\.path|req\.url|searchParams/

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(full)
    if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) return []
    return [full]
  })
}

/** Each log call as it is written: the line it starts on, which is where the arguments are. */
function logLines(source: string): string[] {
  return [...source.matchAll(LOG_CALL)].map((match) => {
    const start = match.index ?? 0
    const end = source.indexOf('\n', start)
    return source.slice(start, end === -1 ? source.length : end)
  })
}

describe('music request logs (FB-S5)', () => {
  it('never writes the reader’s query or the request URL into a log line', () => {
    const files = sourceFiles(MUSIC_ROOT)
    expect(files.length).toBeGreaterThan(10)
    const calls = files.flatMap((file) => logLines(fs.readFileSync(file, 'utf8')))
    // The audit is only meaningful over the calls that exist; a scan that found none would pass
    // for the wrong reason.
    expect(calls.length).toBeGreaterThan(5)
    expect(calls.filter((line) => LEAKS_REQUEST_TEXT.test(line))).toEqual([])
  })

  it('reads the keyword from the query so the log contract above is the one under test', () => {
    const provider = fs.readFileSync(path.join(MUSIC_ROOT, 'provider.ts'), 'utf8')
    // If this stops being true, the endpoint stopped carrying the keyword in the URL — revisit the
    // SECURITY.md note about request metadata rather than deleting this case on the way past.
    expect(provider).toContain("c.req.query('keywords')")
  })
})

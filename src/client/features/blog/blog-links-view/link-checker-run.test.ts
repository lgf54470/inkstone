import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BlogLink } from '@shared/types'
import { api } from '../../../lib/api'
import { runCheckerLoop, type HealthResult } from './use-link-checker'

vi.mock('../../../lib/api', () => ({
  api: { blog: { links: { check: vi.fn() } } },
}))

const check = api.blog.links.check as unknown as ReturnType<typeof vi.fn>

function link(id: string): BlogLink {
  return {
    id, url: `https://${id}.example.com`, name: id, description: '', avatar: '',
    categoryId: null, status: 'approved', isPinned: false, pinnedOrder: 0, isFavorite: false,
    sortOrder: 0, isActive: true, clicks: 0, createdAt: 0, updatedAt: 0,
  }
}

function okResult(url: string) {
  return { url, status: 200, ok: true, level: 'ok' as const, durationMs: 1 }
}

function makeRun(links: BlogLink[]) {
  const writes: Array<Record<string, HealthResult>> = []
  const stop = { current: false }
  const controller = new AbortController()
  let progress = 0
  return {
    writes,
    stop,
    controller,
    progress: () => progress,
    run: () => runCheckerLoop({
      links,
      applyResults: (update) => writes.push(update(writes.at(-1) ?? {})),
      setProgressIndex: (n) => {
        progress = n
      },
      stopRequested: stop,
      signal: controller.signal,
    }),
  }
}

beforeEach(() => {
  check.mockReset()
})

/**
 * The checker walked the list eight addresses at a time while the server accepts fifteen.
 */
describe('blog link checker batches', () => {
  it('asks the server in batches as large as it accepts', async () => {
    // 15 is `blogLinkCheckSchema`'s maximum; 35 addresses used to take five calls instead of three.
    check.mockImplementation((urls: string[]) => Promise.resolve({ results: urls.map(okResult) }))
    const run = makeRun(Array.from({ length: 35 }, (_, i) => link(`l${i}`)))

    await run.run()

    expect(check).toHaveBeenCalledTimes(3)
    expect(check.mock.calls.map((call) => (call[0] as string[]).length)).toEqual([15, 15, 5])
    expect(run.progress()).toBe(35)
    expect(Object.keys(run.writes.at(-1) ?? {})).toHaveLength(35)
  })
})

/**
 * The stop button used to take effect only between batches: the request already in flight kept
 * going, and its answer — including a failure that says nothing about the sites — was written after
 * the reader had stopped the run.
 */
describe('blog link checker stops', () => {
  it('aborts the batch in flight and writes no verdict for it', async () => {
    check.mockImplementation((_urls: string[], signal: AbortSignal) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')))
    }))
    const run = makeRun([link('l0'), link('l1'), link('l2')])

    const pending = run.run()
    await Promise.resolve()
    run.stop.current = true
    run.controller.abort()
    await pending

    expect(check).toHaveBeenCalledTimes(1)
    // The rows keep the "checking" marker: an aborted request is not a verdict, and it is certainly
    // not the 'error' verdict the bulk delete filters apart from one.
    expect(Object.values(run.writes.at(-1) ?? {}).map((r) => r.level)).toEqual(['checking', 'checking', 'checking'])
  })

  it('still records a failed batch that was not stopped as an error', async () => {
    check.mockRejectedValueOnce(new Error('offline'))
    const run = makeRun([link('l0'), link('l1')])

    await run.run()

    expect(Object.values(run.writes.at(-1) ?? {}).map((r) => r.level)).toEqual(['error', 'error'])
  })
})

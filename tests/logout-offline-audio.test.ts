import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Offline audio is private content the service worker caches on this device
 * (features/music plan FEAT-10). It must not outlive the account that saved
 * it, so the logout flow has to clear that cache — and it has to happen after
 * the local database wipe, never inside a branch that logout can return from
 * early. logoutImpl itself is tangled in settings flushing, session caching
 * and location.reload, none of which is cheap to mount; this source-order
 * guard keeps the privacy invariant pinned the same way the fullscreen policy
 * test pins its ownership rule.
 */
describe('logout offline-audio clearing', () => {
  const source = fs.readFileSync(path.resolve('src/client/store/session.ts'), 'utf8')
  const start = source.indexOf('async function logoutImpl')
  const end = source.indexOf('\nasync function', start + 1)
  const body = source.slice(start, end)

  it('clears the offline audio cache once the local database is wiped', () => {
    expect(start).toBeGreaterThan(-1)
    const dbWipe = body.indexOf('await localDb.clear()')
    const audioWipe = body.indexOf('await clearOfflineAudioTracks()')
    expect(dbWipe).toBeGreaterThan(-1)
    expect(audioWipe).toBeGreaterThan(dbWipe)
  })

  it('keeps the clear on the unconditional logout path, not in a catch', () => {
    const line = body.split('\n').find((entry) => entry.includes('await clearOfflineAudioTracks()'))
    expect(line).toBeDefined()
    expect(line).not.toMatch(/catch/)
  })
})

import { describe, expect, it } from 'vitest'

import type { OutboxItem } from '../../lib/db'
import { outboxRetryDue } from './outbox-replay'

function outboxItem(overrides: Partial<OutboxItem>): OutboxItem {
  return {
    id: 'o1',
    clientId: 'c1',
    writeId: 'w1',
    noteId: 'n1',
    payload: {},
    attempts: 0,
    createdAt: 0,
    ...overrides,
  }
}

describe('outboxRetryDue', () => {
  it('retries fresh items immediately', () => {
    expect(outboxRetryDue(outboxItem({ attempts: 0 }), 1000)).toBe(true)
    expect(outboxRetryDue(outboxItem({ attempts: 5 }), 1000)).toBe(true)
  })

  it('applies exponential backoff after a failed attempt', () => {
    const now = 10_000_000
    const first = outboxItem({ attempts: 1, lastAttemptAt: now - 29_000 })
    expect(outboxRetryDue(first, now)).toBe(false)
    expect(outboxRetryDue(outboxItem({ attempts: 1, lastAttemptAt: now - 31_000 }), now)).toBe(true)

    const third = outboxItem({ attempts: 3, lastAttemptAt: now - 119_000 })
    expect(outboxRetryDue(third, now)).toBe(false)
    expect(outboxRetryDue(outboxItem({ attempts: 3, lastAttemptAt: now - 121_000 }), now)).toBe(true)
  })

  it('caps the backoff so long-dead items keep retrying', () => {
    const now = 10_000_000
    const capped = outboxItem({ attempts: 40, lastAttemptAt: now - 29 * 60_000 })
    expect(outboxRetryDue(capped, now)).toBe(false)
    expect(outboxRetryDue(outboxItem({ attempts: 40, lastAttemptAt: now - 31 * 60_000 }), now)).toBe(true)
  })
})

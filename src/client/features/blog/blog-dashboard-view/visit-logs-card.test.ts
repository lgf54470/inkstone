import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import type { BlogVisitLog } from '@shared/types'
import { renderElement } from '../../../lib/test-render'
import { VisitLogsCard } from './visit-logs-card'

/**
 * The locale is not loaded in this harness, so `t()` echoes the key and the assertions read keys.
 * What they pin is that the card no longer prints the UA parser's raw `'Other'` sentinel, nor the
 * English word `'Bot'`, on either language.
 */
function visitLog(overrides: Partial<BlogVisitLog>): BlogVisitLog {
  return {
    id: 1,
    postId: 'post-1',
    postTitle: 'A post',
    slug: 'a-post',
    visitedAt: Date.UTC(2026, 8, 30, 10, 0),
    country: null,
    region: null,
    city: null,
    referrer: null,
    referrerHost: null,
    deviceType: null,
    os: null,
    browser: null,
    isBot: false,
    ...overrides,
  }
}

describe('blog visit log device labels', () => {
  it('words the parser sentinel and a missing name as the localized unknown, not as Other', () => {
    const { container, unmount } = renderElement(createElement(VisitLogsCard, {
      visits: [visitLog({ browser: 'Other', os: null, isBot: true, botName: null })],
      locale: 'en-US',
    }))
    const text = container.textContent ?? ''
    expect(text).toContain('blog.env_unknown / blog.env_unknown')
    expect(text).toContain('blog.bot_fallback')
    expect(text).not.toContain('Other')
    unmount()
  })

  it('keeps a browser and OS name the parser did read', () => {
    const { container, unmount } = renderElement(createElement(VisitLogsCard, {
      visits: [visitLog({ browser: 'Chrome', os: 'Windows' })],
      locale: 'en-US',
    }))
    expect(container.textContent ?? '').toContain('Chrome / Windows')
    unmount()
  })
})

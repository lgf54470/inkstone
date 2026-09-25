import { act, createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderElement } from '../../lib/test-render'
import { initI18n, setLocale } from '../../lib/i18n'
import { api } from '../../lib/api'
import { ShareAuditHistory } from './share-audit-history'

vi.mock('../../lib/api', () => ({
  api: {
    share: {
      noteAudit: vi.fn(async () => ({ entries: [] })),
    },
  },
}))

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

function auditFixture() {
  return {
    entries: [
      {
        id: 'entry-2',
        slug: 'renamed-audit',
        action: 'update' as const,
        changed: [
          { field: 'slug', from: 'old-slug', to: 'renamed-audit' },
          { field: 'password', from: true, to: false },
        ],
        createdAt: 1_700_000_000_000,
      },
    ],
  }
}

beforeEach(() => {
  vi.mocked(api.share.noteAudit).mockClear()
  vi.mocked(api.share.noteAudit).mockResolvedValue({ entries: [] })
})

describe('share audit history section (audit #6)', () => {
  it('reads the note audit log when it mounts', async () => {
    const rendered = renderElement(createElement(ShareAuditHistory, { noteId: 'n-1' }))
    await flush()

    expect(api.share.noteAudit).toHaveBeenCalledWith('n-1')
    expect(rendered.container.textContent).toContain('share.audit_empty')
    rendered.unmount()
  })

  it('names each change and keeps the passcode as set/cleared only', async () => {
    await initI18n()
    await setLocale('en-US')
    vi.mocked(api.share.noteAudit).mockResolvedValue(auditFixture())
    const rendered = renderElement(createElement(ShareAuditHistory, { noteId: 'n-1' }))
    await flush()

    const text = rendered.container.textContent ?? ''
    expect(text).toContain('Link updated')
    // The stored from/to for the passcode are booleans; the label must be the cleared/set word,
    // never a value that could pretend to be the passcode.
    expect(text).toContain('Slug: old-slug → renamed-audit')
    expect(text).toContain('Access passcode: Set → Cleared')
    rendered.unmount()
  })

  it('says so when the read fails, with a way back', async () => {
    vi.mocked(api.share.noteAudit).mockRejectedValueOnce(new Error('offline'))
    const rendered = renderElement(createElement(ShareAuditHistory, { noteId: 'n-1' }))
    await flush()

    expect(rendered.container.querySelector('[role="alert"]')?.textContent).toContain('Could not load the change history.')

    vi.mocked(api.share.noteAudit).mockResolvedValue(auditFixture())
    // The locale is en-US at this point (the previous test set it), so the affordance is its word.
    const retry = [...rendered.container.querySelectorAll('button')]
      .find((button) => button.textContent === 'Retry')
    await act(async () => {
      retry!.click()
    })
    await flush()
    expect(rendered.container.textContent).toContain('Link updated')
    rendered.unmount()
  })
})

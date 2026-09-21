import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ShareInfo } from '@shared/types'

const H = vi.hoisted(() => ({ downloadTextFile: vi.fn() }))

vi.mock('../../lib/export-note', () => ({ downloadTextFile: H.downloadTextFile }))

import { initI18n, t } from '../../lib/i18n'
import { useUi } from '../../store/ui'
import { buildShareLinkList, copyShareLinksFlow, exportShareLinksFlow, selectedShareRows } from './share-batch-links'

/**
 * SH-69: a selection is a set of note ids while the rows are what the list holds, so the batch link
 * actions have to say what they left out — a list that quietly drops entries looks complete.
 */
function shareRow(noteId: string, overrides: Partial<ShareInfo> = {}): ShareInfo {
  return {
    slug: `slug-${noteId}`,
    noteId,
    url: `https://example.test/s/${noteId}`,
    hasPassword: false,
    expiresAt: null,
    views: 1,
    createdAt: 0,
    isEnabled: true,
    lastViewedAt: null,
    noteTitle: `Note ${noteId}`,
    ...overrides,
  }
}

function lastToast() {
  const { toasts } = useUi.getState()
  return toasts[toasts.length - 1]
}

let writeText: ReturnType<typeof vi.fn>

beforeEach(async () => {
  vi.clearAllMocks()
  await initI18n()
  useUi.setState({ toasts: [] })
  writeText = vi.fn(async () => undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
})

describe('batch link list (SH-69)', () => {
  it('writes one markdown link per share, escaping a bracket in the title', () => {
    const list = buildShareLinkList([
      shareRow('a', { noteTitle: 'Plain' }),
      shareRow('b', { noteTitle: 'Draft [v2]' }),
    ])

    expect(list).toBe([
      '- [Plain](https://example.test/s/a)',
      '- [Draft \\[v2\\]](https://example.test/s/b)',
    ].join('\n'))
  })

  it('counts the selected ids the list is not holding', () => {
    const { rows, missing } = selectedShareRows([shareRow('a')], new Set(['a', 'gone']))

    expect(rows.map((row) => row.noteId)).toEqual(['a'])
    expect(missing).toBe(1)
  })

})

describe('batch link feedback (SH-69)', () => {
  it('copies every selected link and reports the count', async () => {
    const rows = [shareRow('a'), shareRow('b')]

    await copyShareLinksFlow({ rows, missing: 0, toast: useUi.getState().toast })

    expect(writeText).toHaveBeenCalledWith(buildShareLinkList(rows))
    expect(lastToast()?.title).toBe(t('share.batch_links_copied', { count: 2 }))
    expect(lastToast()?.description).toBeUndefined()
  })

  it('reports the clipboard failure instead of going quiet', async () => {
    writeText.mockRejectedValue(new Error('permission denied'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    await copyShareLinksFlow({ rows: [shareRow('a')], missing: 0, toast: useUi.getState().toast })

    expect(lastToast()?.title).toBe(t('common.action_failed'))
    expect(lastToast()?.tone).toBe('danger')
  })

  it('names the shares it left out when the selection outruns the list', async () => {
    await copyShareLinksFlow({ rows: [shareRow('a')], missing: 3, toast: useUi.getState().toast })

    expect(writeText).toHaveBeenCalledWith(buildShareLinkList([shareRow('a')]))
    expect(lastToast()?.description).toBe(t('share.batch_links_missing', { count: 3 }))
  })

  it('exports the same list as a dated markdown file', () => {
    exportShareLinksFlow({ rows: [shareRow('a')], missing: 0, toast: useUi.getState().toast })

    const [filename, text, mime] = H.downloadTextFile.mock.calls[0]
    expect(filename).toMatch(/^inkstone-share-links-\d{4}-\d{2}-\d{2}\.md$/)
    expect(text).toBe(buildShareLinkList([shareRow('a')]))
    expect(mime).toContain('markdown')
    expect(lastToast()?.title).toBe(t('share.batch_links_exported', { count: 1 }))
  })

  it('acts on nothing when no selected share is on screen, and says so', () => {
    exportShareLinksFlow({ rows: [], missing: 2, toast: useUi.getState().toast })

    expect(H.downloadTextFile).not.toHaveBeenCalled()
    expect(lastToast()?.title).toBe(t('share.batch_links_none'))
    expect(lastToast()?.tone).toBe('warning')
  })
})

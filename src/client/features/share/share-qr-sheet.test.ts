import { act, createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ShareInfo } from '@shared/types'
import { initI18n, t } from '../../lib/i18n'
import { renderElement } from '../../lib/test-render'
import { ShareQrSheet, buildQrSheetEntries, qrSheetChannelLabel, useShareQrSheet } from './share-qr-sheet'

/**
 * SH-69's printable sheet: what a batch of codes carries, and that it reaches the printer drawn —
 * a sheet of codes that lost its marker, or that opens before it is drawn, is worse than no sheet,
 * because nothing about it looks wrong.
 */

/** Real time: the sheet's own wait for fonts and its paint beat are what the assertions watch. */
const SETTLE_WAIT_MS = 400

function shareRow(noteId: string, overrides: Partial<ShareInfo> = {}): ShareInfo {
  return {
    slug: `slug-${noteId}`,
    noteId,
    url: `/s/${noteId}`,
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

function absolute(path: string): string {
  return new URL(path, window.location.origin).href
}

let printCalls = 0
let mounted: ReturnType<typeof renderElement> | null = null

beforeEach(async () => {
  await initI18n()
  printCalls = 0
  vi.spyOn(window, 'print').mockImplementation(() => {
    printCalls += 1
  })
})

afterEach(() => {
  mounted?.unmount()
  mounted = null
  vi.restoreAllMocks()
  document.querySelector('[data-share-qr-sheet]')?.remove()
})

function sheet(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-share-qr-sheet]')
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, SETTLE_WAIT_MS))
  })
}

/** One share, no marker and nothing left out unless a test says otherwise. */
function mountSheet(overrides: Partial<Parameters<typeof ShareQrSheet>[0]> = {}): void {
  mounted = renderElement(createElement(ShareQrSheet, {
    rows: [shareRow('a')],
    channel: '',
    missing: 0,
    onDone: () => {},
    ...overrides,
  }))
}

describe('the entries a sheet prints', () => {
  it('names each code with its note and carries the batch marker in the code itself', () => {
    const entries = buildQrSheetEntries([shareRow('a'), shareRow('b', { url: '/s/b' })], 'launch')

    expect(entries).toEqual([
      { noteId: 'a', title: 'Note a', url: absolute('/s/a?ref=launch') },
      { noteId: 'b', title: 'Note b', url: absolute('/s/b?ref=launch') },
    ])
  })

  it('falls back to the slug for a share whose note has no title', () => {
    const entries = buildQrSheetEntries([shareRow('a', { noteTitle: '' })], '')

    expect(entries[0]?.title).toBe('slug-a')
  })

  it('leaves the marker off every code when the field does not hold a token', () => {
    const entries = buildQrSheetEntries([shareRow('a')], 'not a token')

    expect(entries[0]?.url).toBe(absolute('/s/a'))
  })

  it('keeps the selected order, so the sheet can be read against the list it came from', () => {
    const entries = buildQrSheetEntries([shareRow('c'), shareRow('a'), shareRow('b')], '')

    expect(entries.map((entry) => entry.noteId)).toEqual(['c', 'a', 'b'])
  })
})

describe('the marker line of a sheet', () => {
  it('states the token the codes carry', () => {
    expect(qrSheetChannelLabel('launch')).toBe(t('share.qr_sheet_channel', { value: 'launch' }))
  })

  it('states nothing for an empty field, because the codes carry nothing', () => {
    expect(qrSheetChannelLabel('')).toBeNull()
  })

  it('states nothing for a value the codes themselves would refuse', () => {
    expect(qrSheetChannelLabel('Launch Party')).toBeNull()
  })
})

describe('the sheet itself', () => {
  it('draws one code per share, under the note it opens', () => {
    mountSheet({ rows: [shareRow('a'), shareRow('b')], channel: 'launch' })

    const node = sheet()
    expect(node?.querySelectorAll('.share-qr-sheet-cell')).toHaveLength(2)
    expect(node?.querySelectorAll('svg')).toHaveLength(2)
    const urls = [...(node?.querySelectorAll('.share-qr-sheet-url') ?? [])].map((url) => url.textContent)
    expect(urls).toEqual([absolute('/s/a?ref=launch'), absolute('/s/b?ref=launch')])
  })

  it('encodes a different URL per row instead of repeating one code', () => {
    mountSheet({ rows: [shareRow('a'), shareRow('b')] })

    const codes = [...(sheet()?.querySelectorAll('svg') ?? [])].map((code) => code.outerHTML)
    expect(codes[0]).not.toBe(codes[1])
  })

  it('prints what it left out on the sheet, because the print dialog covers any toast about it', () => {
    mountSheet({ missing: 2 })

    expect(sheet()?.textContent).toContain(t('share.batch_links_missing', { count: 2 }))
  })

  it('lays the sheet out off-screen and out of the tab order until the reader prints it', () => {
    mountSheet()

    const node = sheet()
    expect(node?.className).toContain('share-qr-sheet')
    expect(node?.getAttribute('aria-hidden')).toBe('true')
    expect(node?.hasAttribute('inert')).toBe(true)
  })
})

describe('handing the sheet to the browser', () => {
  it('waits for the sheet to be drawn, hands it over once, and finishes on afterprint', async () => {
    const onDone = vi.fn()
    mountSheet({ onDone })
    expect(printCalls).toBe(0)

    await settle()
    expect(printCalls).toBe(1)
    expect(onDone).not.toHaveBeenCalled()

    act(() => {
      window.dispatchEvent(new Event('afterprint'))
    })
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(printCalls).toBe(1)
  })
})

describe('the control behind the sheet', () => {
  it('puts nothing in the document until it is asked, and takes it away when the dialog closes', async () => {
    function SheetHost() {
      const { requestPrint, sheet: node } = useShareQrSheet()
      const print = () => requestPrint({ rows: [shareRow('a')], channel: '', missing: 0 })
      return createElement('div', null, createElement('button', { type: 'button', onClick: print }, 'print'), node)
    }

    mounted = renderElement(createElement(SheetHost))
    expect(sheet()).toBeNull()

    const button = [...document.querySelectorAll('button')].find((candidate) => candidate.textContent === 'print')
    act(() => {
      button?.click()
    })
    expect(sheet()).not.toBeNull()

    await settle()
    expect(printCalls).toBe(1)

    act(() => {
      window.dispatchEvent(new Event('afterprint'))
    })
    expect(sheet()).toBeNull()
  })
})

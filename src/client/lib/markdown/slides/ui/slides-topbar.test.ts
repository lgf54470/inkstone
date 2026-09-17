import { createElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderElement } from '../../../test-render'
import { SlidesFullscreen } from './slides-fullscreen'
import { t } from '../../../i18n'
import { flushSlidesEntry } from '../write'
import { parseSlidesOutline } from '../outline'
import type { SlidesBlockEntry } from '../entry'
import type { BentoDoc, SlidesWriteResult } from '../types'
import type { SlidesSession } from '../session'

function makeEntry(data: BentoDoc, source: string) {
  const writes: string[] = []
  const pending: boolean[] = []
  const entry: SlidesBlockEntry = {
    key: 'scope#0',
    scope: 'scope',
    noteId: 'note-1',
    index: 0,
    host: document.createElement('div'),
    source,
    data,
    mode: 'outline',
    editable: true,
    owner: 'overlay',
    dark: false,
    locale: 'en-US',
    container: null,
    root: null,
    ref: { line: 1, body: source },
    write: (_ref, nextBody): SlidesWriteResult => {
      writes.push(nextBody)
      return 'written'
    },
    notice: null,
    report: (value) => pending.push(value),
    dirty: false,
    timer: null,
  }
  return { entry, writes, pending }
}

function sessionFor(entry: SlidesBlockEntry): SlidesSession {
  return {
    key: entry.key,
    noteId: () => entry.noteId,
    isReady: () => Boolean(entry.data),
    isEditable: () => Boolean(entry.editable),
    isDirty: () => entry.dirty || entry.timer !== null,
    getData: () => entry.data,
    updateData: (updater) => {
      entry.data = updater(entry.data as BentoDoc)
      entry.dirty = true
      entry.report?.(true)
    },
    getMode: () => entry.mode,
    moveInto: () => {},
    moveBack: () => {},
    title: () => entry.data?.title ?? 'Slides',
    serialize: () => null,
    flush: () => flushSlidesEntry(entry),
  }
}

const source = '# Title\nBody text'

describe('SlidesFullscreen save control', () => {
  it('calls back when Save is pressed and announces the saved state', () => {
    const { entry } = makeEntry(parseSlidesOutline(source), source)
    const session = sessionFor(entry)
    const onSave = vi.fn()
    const view = renderElement(
      createElement(SlidesFullscreen, { session, isSaved: true, onSave, onClose: () => {} }),
    )
    // The overlay is a modal: it portals into the body, not into the render container.
    const button = document.querySelector<HTMLButtonElement>(
      `button[title="${t('slides.tool_save')}"]`,
    )
    expect(button).not.toBeNull()
    button?.click()
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(document.querySelector('[data-bento-slides-unsaved]')).toBeNull()
    expect(document.querySelector('[data-bento-slides-save-status]')?.textContent).toBe(
      t('slides.saved'),
    )
    view.unmount()
  })

  it('marks the deck unsaved while an edit is still pending', () => {
    const { entry } = makeEntry(parseSlidesOutline(source), source)
    const session = sessionFor(entry)
    entry.dirty = true
    const view = renderElement(
      createElement(SlidesFullscreen, { session, isSaved: false, onSave: () => {}, onClose: () => {} }),
    )
    expect(document.querySelector('[data-bento-slides-unsaved]')).not.toBeNull()
    expect(document.querySelector('[data-bento-slides-save-status]')?.textContent).toBe(
      t('slides.unsaved_changes'),
    )
    view.unmount()
  })
})

describe('SlidesFullscreen print control', () => {
  it('offers no print button while printing a deck has no pipeline behind it', () => {
    const { entry } = makeEntry(parseSlidesOutline(source), source)
    const view = renderElement(
      createElement(SlidesFullscreen, {
        session: sessionFor(entry),
        isSaved: true,
        onSave: () => {},
        onClose: () => {},
      }),
    )
    const print = document.querySelector<HTMLButtonElement>(
      `button[title="${t('slides.print_unavailable')}"]`,
    )
    expect(print?.disabled).toBe(true)
    view.unmount()
  })
})

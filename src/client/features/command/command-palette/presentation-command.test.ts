/**
 * The current note's palette items. What is pinned is the entry the review found missing: a reader
 * who typed "presentation" got the command that *writes a slides code block* and nothing that puts
 * the note on the projector — two different things wearing the same word.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const start = vi.hoisted(() => vi.fn(() => true))

vi.mock('../../presentation', () => ({
  startPresentationFromNote: start,
}))

import { initI18n, t } from '../../../lib/i18n'
import { currentNoteCommands } from './use-commands'

beforeAll(async () => {
  await initI18n()
})

function deps() {
  return { setStarred: vi.fn(), setArchived: vi.fn(), openPanel: vi.fn(), deleteNote: vi.fn() }
}

function commands() {
  return new Map(currentNoteCommands({ id: 'note-1', isStarred: false, isArchived: false }, deps()).map((item) => [item.id, item]))
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('presentation command (P-22)', () => {
  it('offers presenting the current note under its own name', () => {
    const item = commands().get('cmd-presentation-mode')
    expect(item).toBeDefined()
    expect(item?.label).toBe(t('workspace.presentation_mode'))
    expect(item?.combo).toBe('mod+alt+p')
    expect(item?.group).toBe(t('common.current_note'))
  })

  it('keeps presenting distinct from generating a slides block', () => {
    const ids = [...commands().keys()]
    expect(ids).toContain('cmd-slides-from-outline')
    expect(ids).toContain('cmd-presentation-mode')
    expect(ids.indexOf('cmd-presentation-mode')).toBeGreaterThan(ids.indexOf('cmd-slides-from-outline'))
  })

  it('runs the shared start path against the note the palette was opened on', () => {
    commands().get('cmd-presentation-mode')?.run()
    expect(start).toHaveBeenCalledTimes(1)
    expect(start).toHaveBeenCalledWith('note-1')
  })
})

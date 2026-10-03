// N-17: the row that starts a show was the one row in the editor's right-click menu with no key on it,
// while its neighbours spelled out `mod+z`. The key exists — it is the registered app shortcut — so the
// row has to print the same spelling, taken from the same constant the shortcut is registered with.
import { describe, expect, it, vi } from 'vitest'
import { PRESENTATION_HOTKEYS, PRESENTATION_START_COMBO } from '../presentation'
import { buildPreviewCanvasItems } from './context-menu/canvas'
import type { MenuCtx } from './context-menu/types'

const ctx = (): MenuCtx => ({
  content: '',
  onEditContent: vi.fn(),
  onJumpToLine: vi.fn(),
  createNote: vi.fn(),
  openNote: vi.fn(),
  setWorkspaceNote: vi.fn(),
  runStateCommand: vi.fn(),
  replaceTableInEditor: vi.fn(),
  modifyTableInContent: vi.fn(),
  handleCopy: vi.fn(),
  handlePasteIntoEditor: vi.fn(),
  handleCutFromEditor: vi.fn(),
  onPresent: vi.fn(),
})

describe('the editor canvas menu and the presentation shortcut', () => {
  it('spells the app shortcut on the row that starts the show', () => {
    const row = buildPreviewCanvasItems(ctx()).find((item) => item.id === 'presentation')
    expect(row?.combo).toBe(PRESENTATION_START_COMBO)
    expect(row?.combo).toBe('mod+alt+p')
  })

  it('offers the row only when something can be presented', () => {
    const withoutAction = buildPreviewCanvasItems({ ...ctx(), onPresent: undefined }).find((item) => item.id === 'presentation')
    expect(withoutAction).toBeUndefined()
  })

  it('registers the shortcut under the very key the row prints', () => {
    expect(PRESENTATION_HOTKEYS.map((hotkey) => hotkey.combo)).toContain(PRESENTATION_START_COMBO)
  })
})

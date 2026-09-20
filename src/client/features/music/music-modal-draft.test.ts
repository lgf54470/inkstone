import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement, useState, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import type { MusicPlaylistDetail, MusicTrack } from '@shared/types'
import { t } from '../../lib/i18n'
import { MusicEditTrackModal } from './music-edit-track-modal'
import { MusicPlaylistModal } from './music-playlist-modal'
import { useMusic } from './music-store'

beforeAll(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
  if (typeof (globalThis as Record<string, unknown>).ResizeObserver === 'undefined') {
    ;(globalThis as Record<string, unknown>).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
})

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
})

// The dialogs are driven by the store actions they call, so the actions are the seam to stub.
const realActions = useMusic.getState()

let root: Root | null = null

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
  useMusic.setState({
    patchTrack: realActions.patchTrack,
    ensureTrackLyric: realActions.ensureTrackLyric,
    createPlaylist: realActions.createPlaylist,
    renamePlaylist: realActions.renamePlaylist,
  })
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function track(): MusicTrack {
  return {
    id: 't1', title: 'Old title', artist: 'Old artist', album: '', durationMs: 1000, source: 'r2',
    format: 'mp3', webdavPath: null, mime: 'audio/mpeg', sizeBytes: 10, coverUrl: null, lyric: null,
    hasLyric: false, tagIds: [], isFavorite: false, isPinned: false, playCount: 0, lastPlayedAt: null,
    contentHash: null, createdAt: 0, updatedAt: 0,
  }
}

function playlist(): MusicPlaylistDetail {
  return {
    id: 'pl1', name: 'Old name', description: 'old note', isPinned: false, isFavorite: false,
    shareSlug: null, trackCount: 0, sortOrder: 0, createdAt: 0, updatedAt: 0, items: [],
  }
}

// A close is only real if the surface goes away, so the harness owns the same
// open/close pair the hub does.
function TrackEditorHarness({ track: value, onClose }: { track: MusicTrack; onClose: () => void }): ReactElement {
  const [open, setOpen] = useState(true)
  return createElement(MusicEditTrackModal, {
    track: value,
    open,
    onClose: () => {
      onClose()
      setOpen(false)
    },
  })
}

function PlaylistEditorHarness({ playlist: value, onClose }: { playlist: MusicPlaylistDetail | null; onClose: () => void }): ReactElement {
  const [open, setOpen] = useState(true)
  return createElement(MusicPlaylistModal, {
    playlist: value,
    open,
    onClose: () => {
      onClose()
      setOpen(false)
    },
  })
}

async function mount(element: ReactElement): Promise<void> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(element)
  })
}

function dialog(): HTMLElement | null {
  return document.querySelector('[role="dialog"]')
}

function button(label: string): HTMLElement | undefined {
  return [...(dialog()?.querySelectorAll('button') ?? [])].find((entry) => entry.textContent?.trim() === label)
}

function input(index = 0): HTMLInputElement {
  return dialog()?.querySelectorAll('input')[index] as HTMLInputElement
}

function textarea(): HTMLTextAreaElement {
  return dialog()?.querySelector('textarea') as HTMLTextAreaElement
}

function typeInto(field: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = field instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  act(() => {
    setter?.call(field, value)
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function click(element: HTMLElement | undefined): Promise<void> {
  await act(async () => {
    element?.click()
  })
}

describe('track edit dialog save failure', () => {
  it('keeps the dialog and the edited draft when the save is rejected', async () => {
    const patchTrack = vi.fn(async () => false)
    useMusic.setState({ patchTrack, ensureTrackLyric: vi.fn(async () => {}) })
    const onClose = vi.fn()
    await mount(createElement(TrackEditorHarness, { track: track(), onClose }))

    typeInto(input(), 'Edited title')
    await click(button(t('music.save')))

    expect(patchTrack).toHaveBeenCalledWith('t1', expect.objectContaining({ title: 'Edited title' }))
    expect(dialog()).not.toBeNull()
    expect(input().value).toBe('Edited title')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes the dialog once the save is accepted', async () => {
    const patchTrack = vi.fn(async () => true)
    useMusic.setState({ patchTrack, ensureTrackLyric: vi.fn(async () => {}) })
    const onClose = vi.fn()
    await mount(createElement(TrackEditorHarness, { track: track(), onClose }))

    typeInto(input(), 'Edited title')
    await click(button(t('music.save')))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(dialog()).toBeNull()
  })
})

describe('playlist dialog save failure', () => {
  it('keeps the typed name and description when creating is rejected', async () => {
    const createPlaylist = vi.fn(async () => false)
    useMusic.setState({ createPlaylist })
    const onClose = vi.fn()
    await mount(createElement(PlaylistEditorHarness, { playlist: null, onClose }))

    typeInto(input(), 'Late night')
    typeInto(textarea(), 'for the commute')
    await click(button(t('music.save')))

    expect(createPlaylist).toHaveBeenCalledWith('Late night', 'for the commute')
    expect(dialog()).not.toBeNull()
    expect(input().value).toBe('Late night')
    expect(textarea().value).toBe('for the commute')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('keeps the dialog open when renaming is rejected', async () => {
    const renamePlaylist = vi.fn(async () => false)
    useMusic.setState({ renamePlaylist })
    const onClose = vi.fn()
    await mount(createElement(PlaylistEditorHarness, { playlist: playlist(), onClose }))

    typeInto(input(), 'Renamed')
    await click(button(t('music.save')))

    expect(renamePlaylist).toHaveBeenCalledWith('pl1', 'Renamed', 'old note')
    expect(dialog()).not.toBeNull()
    expect(input().value).toBe('Renamed')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes the dialog once the rename is accepted', async () => {
    const renamePlaylist = vi.fn(async () => true)
    useMusic.setState({ renamePlaylist })
    const onClose = vi.fn()
    await mount(createElement(PlaylistEditorHarness, { playlist: playlist(), onClose }))

    typeInto(input(), 'Renamed')
    await click(button(t('music.save')))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(dialog()).toBeNull()
  })
})

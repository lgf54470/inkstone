import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  togglePlay: vi.fn().mockResolvedValue(undefined),
  playNext: vi.fn().mockResolvedValue(undefined),
  playPrevious: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../music', () => ({
  useMusic: { getState: () => state },
}))

import { playbackCommands } from './use-commands'

describe('palette playback commands (FEAT-8)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lists play-pause, previous and next with their key hints', () => {
    const items = playbackCommands()
    expect(items.map((item) => item.id)).toEqual(['cmd-music-play-pause', 'cmd-music-previous', 'cmd-music-next'])
    expect(items.map((item) => item.combo)).toEqual(['space', 'mod+arrowleft', 'mod+arrowright'])
    expect(items.every((item) => item.kind === 'command')).toBe(true)
  })

  it('runs the music store actions', () => {
    const items = new Map(playbackCommands().map((item) => [item.id, item]))
    items.get('cmd-music-play-pause')?.run()
    expect(state.togglePlay).toHaveBeenCalledTimes(1)
    items.get('cmd-music-previous')?.run()
    expect(state.playPrevious).toHaveBeenCalledTimes(1)
    items.get('cmd-music-next')?.run()
    expect(state.playNext).toHaveBeenCalledTimes(1)
  })
})

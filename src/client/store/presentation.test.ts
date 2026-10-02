import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePresentation } from './presentation'

const IDLE = { open: false, noteId: null, title: '', snapshot: '', following: true, startedAt: 0 }

beforeEach(() => {
  usePresentation.setState(IDLE)
})

describe('presentation show lifecycle', () => {
  it('starting a show snapshots the note and follows it', () => {
    usePresentation.getState().start({ noteId: 'note-1', content: '# Opening', title: 'Script' })
    expect(usePresentation.getState()).toMatchObject({
      open: true,
      noteId: 'note-1',
      title: 'Script',
      snapshot: '# Opening',
      following: true,
    })
  })

  it('captures the presented content so freezing pins what is on screen', () => {
    const { start, capture, setFollowing } = usePresentation.getState()
    start({ noteId: 'note-1', content: '# Opening', title: 'Script' })
    capture('# Opening\n\nRevised')
    setFollowing(false)
    expect(usePresentation.getState()).toMatchObject({ following: false, snapshot: '# Opening\n\nRevised' })
  })

  it('resuming follows the note again without closing the show', () => {
    const { start, setFollowing } = usePresentation.getState()
    start({ noteId: 'note-1', content: '# Opening', title: 'Script' })
    setFollowing(false)
    setFollowing(true)
    expect(usePresentation.getState()).toMatchObject({ following: true, open: true, noteId: 'note-1' })
  })

  it('stopping clears the snapshot so the next show cannot open a stale deck', () => {
    const { start, capture, setFollowing, stop } = usePresentation.getState()
    start({ noteId: 'note-1', content: '# Opening', title: 'Script' })
    capture('# Frozen')
    setFollowing(false)
    stop()
    expect(usePresentation.getState()).toMatchObject(IDLE)
  })

  it('starting a new show follows again after a frozen talk', () => {
    const { start, setFollowing, stop } = usePresentation.getState()
    start({ noteId: 'note-1', content: '# Opening', title: 'Script' })
    setFollowing(false)
    stop()
    usePresentation.getState().start({ noteId: 'note-2', content: '# Second talk', title: 'Next talk' })
    expect(usePresentation.getState()).toMatchObject({ noteId: 'note-2', snapshot: '# Second talk', following: true })
  })
})

describe('presentation show clock', () => {
  it('stamps the moment the show started and restamps it for the next one', () => {
    vi.useFakeTimers()
    vi.setSystemTime(5000)
    usePresentation.getState().start({ noteId: 'note-1', content: '# Opening', title: 'Script' })
    expect(usePresentation.getState().startedAt).toBe(5000)
    usePresentation.getState().stop()
    vi.setSystemTime(90_000)
    usePresentation.getState().start({ noteId: 'note-2', content: '# Second talk', title: 'Next talk' })
    expect(usePresentation.getState().startedAt).toBe(90_000)
    vi.useRealTimers()
  })

  it('keeps one clock while the show freezes, captures and follows again', () => {
    vi.useFakeTimers()
    vi.setSystemTime(5000)
    const { start, capture, setFollowing } = usePresentation.getState()
    start({ noteId: 'note-1', content: '# Opening', title: 'Script' })
    vi.setSystemTime(45_000)
    setFollowing(false)
    capture('# Opening revised')
    setFollowing(true)
    expect(usePresentation.getState().startedAt).toBe(5000)
    vi.useRealTimers()
  })

  it('restamps when a new note takes over a show that is still open', () => {
    vi.useFakeTimers()
    vi.setSystemTime(5000)
    usePresentation.getState().start({ noteId: 'note-1', content: '# Opening', title: 'Script' })
    vi.setSystemTime(240_000)
    // The command palette can put a different note on the projector without the first show being
    // stopped; that is a new talk, so its elapsed time starts over rather than adding up.
    usePresentation.getState().start({ noteId: 'note-2', content: '# Second talk', title: 'Next talk' })
    expect(usePresentation.getState().startedAt).toBe(240_000)
    vi.useRealTimers()
  })
})

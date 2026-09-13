import { beforeEach, describe, expect, it } from 'vitest'
import { usePresentation } from './presentation'

const IDLE = { open: false, noteId: null, title: '', snapshot: '', following: true }

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

import { create } from 'zustand'

// Presenting belongs to the shell, not to a workspace pane: crossing the mobile
// breakpoint swaps the whole shell subtree, and a show owned by the workspace
// would be torn down mid-presentation. The show follows the note it was started
// from by default, so an edit reaching this tab (another tab, another device, an
// MCP write) lands on the projector; freezing pins the deck for a talk that must
// not move.
interface PresentationState {
  open: boolean
  noteId: string | null
  title: string
  /**
   * Last content the show put on screen. While following, the overlay keeps this
   * current so freezing pins exactly what the presenter is looking at; once frozen
   * it is the presented content and stops changing.
   */
  snapshot: string
  following: boolean
  start: (note: { noteId: string; content: string; title: string }) => void
  stop: () => void
  capture: (content: string) => void
  setFollowing: (following: boolean) => void
}

export const usePresentation = create<PresentationState>((set) => ({
  open: false,
  noteId: null,
  title: '',
  snapshot: '',
  following: true,

  start({ noteId, content, title }) {
    set({ open: true, noteId, title, snapshot: content, following: true })
  },

  stop() {
    set({ open: false, noteId: null, title: '', snapshot: '', following: true })
  },

  capture(content) {
    set({ snapshot: content })
  },

  setFollowing(following) {
    set({ following })
  },
}))

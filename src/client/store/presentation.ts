import { create } from 'zustand'

// Presenting belongs to the shell, not to a workspace pane: crossing the mobile
// breakpoint swaps the whole shell subtree, and a show owned by the workspace
// would be torn down mid-presentation. The deck is snapshotted at start() so a
// breakpoint switch (or an autosave landing meanwhile) cannot re-split the slides
// under the presenter's feet.
interface PresentationState {
  open: boolean
  content: string
  title: string
  start: (snapshot: { content: string; title: string }) => void
  stop: () => void
}

export const usePresentation = create<PresentationState>((set) => ({
  open: false,
  content: '',
  title: '',

  start({ content, title }) {
    set({ open: true, content, title })
  },

  stop() {
    set({ open: false, content: '', title: '' })
  },
}))

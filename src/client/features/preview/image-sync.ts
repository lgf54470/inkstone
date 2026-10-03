import type { ImageAttrs } from '../../lib/markdown/renderer'
import { useNotes } from '../../store/notes'
import { updateImageAttrsAtSource, type ImageRef } from './image-source'

export type ImageWriteResult = 'written' | 'conflict' | 'missing'

/**
 * Applies an image's own controls to the note store. The change is resolved against the note's
 * *current* text rather than against the markup the preview rendered from: the user may have
 * typed since, and writing on top of that snapshot would throw those edits away. When the image
 * can no longer be found where the rendered node said it was, nothing is written.
 */
export function writeImageAttrs(
  noteId: string | null,
  ref: ImageRef,
  updater: (attrs: ImageAttrs) => ImageAttrs,
): ImageWriteResult {
  if (!noteId) return 'missing'
  const state = useNotes.getState()
  const current = state.contents[noteId]
  if (current === undefined) return 'missing'
  const next = updateImageAttrsAtSource(current, ref, updater)
  if (next === null) return 'conflict'
  if (next !== current) state.editContent(noteId, next)
  return 'written'
}

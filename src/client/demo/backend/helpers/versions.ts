import type { Note, NoteVersion } from '@shared/types'
import { newDemoId } from '../../state'
import type { DemoState } from '../../state'

export function saveVersion(state: DemoState, note: Note): void {
  const version: NoteVersion = {
    id: newDemoId(),
    noteId: note.id,
    title: note.title,
    size: new TextEncoder().encode(note.content).byteLength,
    createdAt: Date.now(),
    content: note.content,
  }
  state.versions.set(note.id, [version, ...(state.versions.get(note.id) ?? [])].slice(0, 50))
}

export function findVersion(state: DemoState, noteId: string, versionId: string): NoteVersion | null {
  return state.versions.get(noteId)?.find((version) => version.id === versionId) ?? null
}

export function purgeNote(state: DemoState, id: string): void {
  state.notes.delete(id)
  state.versions.delete(id)
  state.shares.delete(id)
  state.cursor++
}


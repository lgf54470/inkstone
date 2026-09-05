import type { LibraryContext } from '../types';
import { organizeMcpNote } from '../../writes';

export async function bulkOrganizeMcpNotes(
  context: LibraryContext,
  operationId: string,
  items: Array<{
    noteId: string
    expectedRev: number
    folderId?: string | null
    starred?: boolean
    archived?: boolean
    pinned?: boolean
  }>,
) {
  const results = []
  for (let index = 0; index < items.length; index++) {
    const item = items[index]!
    try {
      const note = await organizeMcpNote(context, {
        operationId: `${operationId.slice(0, 88)}:${String(index).padStart(2, '0')}`,
        ...item,
      })
      results.push({ note_id: item.noteId, ok: true, rev: note.rev })
    } catch (error) {
      results.push({
        note_id: item.noteId,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return { results }
}

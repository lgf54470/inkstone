import type { BoardLibraryList, BoardLibrarySnapshot } from '@shared/types'
import { publishBroadcast } from '../db'
import { CLIENT_ID, request } from './transport'

/**
 * Whiteboard libraries (lib/markdown/excalidraw/library.ts) are a set of named documents
 * per account, so the API hands each one back verbatim and stores whatever it is given:
 * keeping the format knowledge on the client is what lets an `.excalidrawlib` body
 * round-trip with excalidraw.com untouched.
 */
export const boardLibrary = {
  list: () => request<BoardLibraryList>('/api/board-library'),
  get: (name: string) => request<BoardLibrarySnapshot>(`/api/board-library?name=${encodeURIComponent(name)}`),
  save: async (name: string, items: string) => {
    const snapshot = await request<BoardLibrarySnapshot>('/api/board-library', { method: 'PUT', body: { name, items } })
    publishBroadcast({ type: 'board-library-changed', clientId: CLIENT_ID })
    return snapshot
  },
  remove: async (name: string) => {
    const result = await request<{ removed: boolean }>(`/api/board-library?name=${encodeURIComponent(name)}`, { method: 'DELETE' })
    publishBroadcast({ type: 'board-library-changed', clientId: CLIENT_ID })
    return result
  },
}

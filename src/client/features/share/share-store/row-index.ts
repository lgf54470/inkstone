import type { ShareInfo } from '@shared/types'
import { useShareStore } from './index'

const rowIndexCache = new WeakMap<ShareInfo[], Map<string, ShareInfo>>()

export function shareRowIndex(shares: ShareInfo[]): Map<string, ShareInfo> {
  let index = rowIndexCache.get(shares)
  if (!index) {
    index = new Map(shares.map((share) => [share.noteId, share]))
    rowIndexCache.set(shares, index)
  }
  return index
}

export function selectShareRow(shares: ShareInfo[], noteId: string): ShareInfo | null {
  return shareRowIndex(shares).get(noteId) ?? null
}

// The selector result is the row object itself, so a write touching other rows
// keeps this subscriber's value referentially equal and skips its re-render.
export function useShareRowForNote(noteId: string): ShareInfo | null {
  return useShareStore((s) => selectShareRow(s.shares, noteId))
}

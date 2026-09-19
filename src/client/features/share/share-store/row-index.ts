import type { ShareInfo } from '@shared/types'
import { useShareStore } from './index'
import type { ShareSummaryState } from './types'

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

export function isNoteShared(state: { shares: ShareInfo[]; summary: ShareSummaryState | null }, noteId: string): boolean {
  if (selectShareRow(state.shares, noteId)) return true
  return state.summary?.sharedNoteIds.has(noteId) ?? false
}

// The selector result is the row object itself, so a write touching other rows
// keeps this subscriber's value referentially equal and skips its re-render.
export function useShareRowForNote(noteId: string): ShareInfo | null {
  return useShareStore((s) => selectShareRow(s.shares, noteId))
}

// A boolean derived from either truth source: the startup summary until the
// hub (or a submenu action) has loaded the full list.
export function useNoteIsShared(noteId: string): boolean {
  return useShareStore((s) => isNoteShared(s, noteId))
}

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ShareInfo } from '@shared/types'
import { useShareStore } from './share-store'

export type ShareHubModalBundle = ReturnType<typeof useShareHubModal>


type ShareHubQrData = { url: string; title: string; slug: string }

type ShareHubEditData = { share: ShareInfo | null; noteId: string; title: string }

export function useShareHubModal(open: boolean, initialNoteId?: string) {
  const category = useShareStore((s) => s.category)
  const viewMode = useShareStore((s) => s.viewMode)
  const shares = useShareStore((s) => s.shares)
  const loading = useShareStore((s) => s.loading)
  const error = useShareStore((s) => s.error)
  const selectedNoteIds = useShareStore((s) => s.selectedNoteIds)
  const clearSelection = useShareStore((s) => s.clearSelection)
  const loadShares = useShareStore((s) => s.loadShares)

  const [qrShare, setQrShare] = useState<ShareHubQrData | null>(null)
  const [editShare, setEditShare] = useState<ShareHubEditData | null>(null)
  const [analyticsNoteId, setAnalyticsNoteId] = useState<string | null>(null)
  const [isLogsOpen, setIsLogsOpen] = useState(false)
  const [logsNoteId, setLogsNoteId] = useState<string | null>(null)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  const closeOverlays = useCallback(() => {
    setQrShare(null)
    setEditShare(null)
    setAnalyticsNoteId(null)
    setLogsNoteId(null)
    setIsLogsOpen(false)
    setIsSettingsOpen(false)
  }, [])

  useHubOpenLifecycle({ open, initialNoteId, clearSelection, closeOverlays })
  useInitialNoteEdit({ open, initialNoteId, shares, setEditShare })

  const openQr = useCallback((share: ShareInfo) => setQrShare({ url: share.url, title: share.noteTitle || '', slug: share.slug }), [])
  const openAnalytics = useCallback((share: ShareInfo) => setAnalyticsNoteId(share.noteId), [])
  const openEdit = useCallback((share: ShareInfo) => setEditShare({ share: share.slug ? share : null, noteId: share.noteId, title: share.noteTitle || '' }), [])
  const openLogs = useCallback((noteId?: string) => {
    setLogsNoteId(noteId ?? null)
    setIsLogsOpen(true)
  }, [])

  return {
    category, viewMode, shares, loading, error, selectedNoteIds, clearSelection, loadShares,
    qrShare, setQrShare, editShare, setEditShare,
    openQr, openAnalytics, openEdit, openLogs,
    analyticsNoteId, setAnalyticsNoteId, isLogsOpen, setIsLogsOpen, logsNoteId, setLogsNoteId, isSettingsOpen, setIsSettingsOpen,
  }
}

/**
 * What opening and closing the hub means: closing drops the selection and every overlay,
 * opening fetches what this session will read first. The hub lands on the dashboard, which
 * paints the sidebar counters but none of the rows — and both come from the same list
 * response, so the counters are asked for alone unless the list is really needed (a note
 * handed in to edit, or a list category as the landing view). Picking a category loads the
 * list through the store either way.
 */
function useHubOpenLifecycle({ open, initialNoteId, clearSelection, closeOverlays }: {
  open: boolean
  initialNoteId: string | undefined
  clearSelection: () => void
  closeOverlays: () => void
}) {
  const loadShares = useShareStore((s) => s.loadShares)
  const loadStats = useShareStore((s) => s.loadStats)
  useEffect(() => {
    if (!open) {
      clearSelection()
      closeOverlays()
      return
    }
    if (initialNoteId || useShareStore.getState().category !== 'dashboard') void loadShares()
    else void loadStats()
  }, [open, initialNoteId, loadShares, loadStats, clearSelection, closeOverlays])
}

function useInitialNoteEdit({ open, initialNoteId, shares, setEditShare }: {
  open: boolean
  initialNoteId: string | undefined
  shares: ShareInfo[]
  setEditShare: (data: ShareHubEditData) => void
}) {
  const consumedRef = useRef(false)
  useEffect(() => {
    if (!open) {
      consumedRef.current = false
      return
    }
    if (!initialNoteId || consumedRef.current) return
    const match = shares.find((s) => s.noteId === initialNoteId)
    if (match) {
      // One auto-open per hub session: `shares` refreshes after saving or a
      // manual reload, and re-firing would reopen the modal the user closed.
      consumedRef.current = true
      setEditShare({
        share: match,
        noteId: match.noteId,
        title: match.noteTitle || '',
      })
    }
  }, [open, initialNoteId, shares, setEditShare])
}

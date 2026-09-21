import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ShareInfo } from '@shared/types'
import { useShareStore } from './share-store'
import { SHARE_HUB_VIEWS, type ShareHubViewProps } from './share-hub-views'

export type ShareHubModalBundle = ReturnType<typeof useShareHubModal>


type ShareHubQrData = { url: string; title: string; slug: string }

type ShareHubEditData = { share: ShareInfo | null; noteId: string; title: string }

/**
 * The overlays the hub can open, and the callbacks a view opens them through. It is its own hook
 * because a view never touches this state: it asks the shell to open something, and the shell holds
 * the one of each that is open.
 */
function useHubOverlays() {
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

  const openQr = useCallback((share: ShareInfo) => setQrShare({ url: share.url, title: share.noteTitle || '', slug: share.slug }), [])
  const openEdit = useCallback((share: ShareInfo) => setEditShare({ share: share.slug ? share : null, noteId: share.noteId, title: share.noteTitle || '' }), [])
  const openLogs = useCallback((noteId?: string) => {
    setLogsNoteId(noteId ?? null)
    setIsLogsOpen(true)
  }, [])

  // One object, built once: the rows it reaches are memoized, so a fresh callback per render would
  // redraw every one of them.
  const viewProps: ShareHubViewProps = useMemo(() => ({
    onOpenQr: openQr,
    onOpenEdit: openEdit,
    onOpenNoteAnalytics: setAnalyticsNoteId,
    onOpenLogs: openLogs,
    onOpenSettings: () => setIsSettingsOpen(true),
  }), [openQr, openEdit, openLogs])

  return {
    viewProps, closeOverlays, openQr, openEdit, openLogs,
    qrShare, setQrShare, editShare, setEditShare,
    analyticsNoteId, setAnalyticsNoteId, isLogsOpen, setIsLogsOpen, logsNoteId, setLogsNoteId, isSettingsOpen, setIsSettingsOpen,
  }
}

export function useShareHubModal(open: boolean, initialNoteId?: string) {
  const category = useShareStore((s) => s.category)
  const shares = useShareStore((s) => s.shares)
  const clearSelection = useShareStore((s) => s.clearSelection)
  const loadShares = useShareStore((s) => s.loadShares)
  const overlays = useHubOverlays()
  const { closeOverlays, setEditShare } = overlays

  useHubOpenLifecycle({ open, initialNoteId, clearSelection, closeOverlays })
  useInitialNoteEdit({ open, initialNoteId, shares, setEditShare })

  // The view comes from the registry, so the hub never decides what a category looks like — only that
  // this is the one that is open.
  return {
    ...overlays,
    category,
    view: SHARE_HUB_VIEWS[category],
    shares, clearSelection, loadShares,
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
    // What to fetch first is the open view's own declaration, not a list of category names kept here:
    // a note handed in to edit needs the list itself, since that is where the row to edit lives.
    const { preload } = SHARE_HUB_VIEWS[useShareStore.getState().category]
    if (initialNoteId || preload === 'list') void loadShares()
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

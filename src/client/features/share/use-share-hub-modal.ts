import { useCallback, useEffect, useState } from 'react'
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
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  useEffect(() => {
    if (open) {
      void loadShares()
    } else {
      clearSelection()
      setQrShare(null)
      setEditShare(null)
      setAnalyticsNoteId(null)
    }
  }, [open, loadShares, clearSelection])

  useInitialNoteEdit({ open, initialNoteId, shares, setEditShare })

  const openQr = useCallback((share: ShareInfo) => {
    setQrShare({ url: share.url, title: share.noteTitle || '', slug: share.slug })
  }, [])
  const openAnalytics = useCallback((share: ShareInfo) => {
    setAnalyticsNoteId(share.noteId)
  }, [])
  const openEdit = useCallback((share: ShareInfo) => {
    setEditShare({ share: share.slug ? share : null, noteId: share.noteId, title: share.noteTitle || '' })
  }, [])

  return {
    category, viewMode, shares, loading, error, selectedNoteIds, clearSelection, loadShares,
    qrShare, setQrShare, editShare, setEditShare,
    openQr, openAnalytics, openEdit,
    analyticsNoteId, setAnalyticsNoteId, isLogsOpen, setIsLogsOpen, isSettingsOpen, setIsSettingsOpen,
  }
}

function useInitialNoteEdit({ open, initialNoteId, shares, setEditShare }: {
  open: boolean
  initialNoteId: string | undefined
  shares: ShareInfo[]
  setEditShare: (data: ShareHubEditData) => void
}) {
  useEffect(() => {
    if (open && initialNoteId) {
      const match = shares.find((s) => s.noteId === initialNoteId)
      if (match) {
        setEditShare({
          share: match,
          noteId: match.noteId,
          title: match.noteTitle || '',
        })
      }
    }
  }, [open, initialNoteId, shares, setEditShare])
}
import { useEffect, useState } from 'react'
import type { ShareInfo } from '@shared/types'
import { useShareStore } from './share-store'

export type ShareHubModalBundle = ReturnType<typeof useShareHubModal>

export type ShareHubQrData = { url: string; title: string; slug: string }
export type ShareHubEditData = { share: ShareInfo | null; noteId: string; title: string }

export function useShareHubModal(open: boolean, initialNoteId?: string) {
  const category = useShareStore((s) => s.category)
  const viewMode = useShareStore((s) => s.viewMode)
  const shares = useShareStore((s) => s.shares)
  const loading = useShareStore((s) => s.loading)
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
  }, [open, initialNoteId, shares])

  return {
    category, viewMode, shares, loading, selectedNoteIds, clearSelection, loadShares,
    qrShare, setQrShare, editShare, setEditShare,
    analyticsNoteId, setAnalyticsNoteId, isLogsOpen, setIsLogsOpen, isSettingsOpen, setIsSettingsOpen,
  }
}
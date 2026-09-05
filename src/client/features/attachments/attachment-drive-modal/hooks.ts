import { useCallback, useEffect, useRef, useState } from 'react'
import type { AttachmentStats, AttachmentWithUsage } from '@shared/types'
import { t } from '../../../lib/i18n'
import { api } from '../../../lib/api'
import { useUi } from '../../../store/ui'
import { confirm } from '../../../components/overlay'
import { useAttachmentStore } from '../attachment-store'
import type { AttachmentCategory } from '../attachment-helpers'

/** All state + async actions behind the attachment drive modal, so the modal component stays a thin JSX shell. */
export function useAttachmentDriveModal(open: boolean) {
  const attachmentFolders = useAttachmentStore((s) => s.folders)
  const toast = useUi((s) => s.toast)

  const [files, setFiles] = useState<AttachmentWithUsage[]>([])
  const [stats, setStats] = useState<AttachmentStats | undefined>(undefined)
  const [isLoading, setIsLoading] = useState(false)
  const [isPruning, setIsPruning] = useState(false)

  const [category, setCategory] = useState<AttachmentCategory>('all')
  const [folderId, setFolderId] = useState<string | null>(null)
  const [tag, setTag] = useState<string | null>(null)
  const [extension, setExtension] = useState('all')
  const [search, setSearch] = useState('')
  const [sizeRange, setSizeRange] = useState('all')
  const [sort, setSort] = useState('date_desc')

  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [zoom, setZoom] = useState<'sm' | 'md' | 'lg'>('md')

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [activeFile, setActiveFile] = useState<AttachmentWithUsage | null>(null)

  const [previewFile, setPreviewFile] = useState<AttachmentWithUsage | null>(null)
  const [qrFile, setQrFile] = useState<AttachmentWithUsage | null>(null)
  const [renameFile, setRenameFile] = useState<AttachmentWithUsage | null>(null)
  const [movingFileIds, setMovingFileIds] = useState<string[] | null>(null)

  const [isDragOverMain, setIsDragOverMain] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadFiles = useCallback(async () => {
    setIsLoading(true)
    try {
      let typeParam: string | undefined
      if (category === 'image') typeParam = 'image'
      else if (category === 'document') typeParam = 'document'
      else if (category === 'media') typeParam = 'media'
      else if (category === 'archive') typeParam = 'archive'

      const starredParam = category === 'starred' ? true : undefined
      const pinnedParam = category === 'pinned' ? true : undefined

      const res = await api.files.list({
        folderId: folderId ?? undefined,
        type: typeParam,
        extension: extension !== 'all' ? extension : undefined,
        sizeRange: sizeRange !== 'all' ? sizeRange : undefined,
        tag: tag ?? undefined,
        starred: starredParam,
        pinned: pinnedParam,
        search: search.trim() || undefined,
        sort,
        limit: 500,
      })

      let finalFiles = res.files
      if (category === 'unreferenced') {
        finalFiles = finalFiles.filter((f) => f.references === 0)
      }

      setFiles(finalFiles)
      setStats(res.stats)
    } catch {
      toast({ title: t('attachments.load_failed'), tone: 'danger' })
    } finally {
      setIsLoading(false)
    }
  }, [category, folderId, tag, extension, search, sizeRange, sort, toast])

  useEffect(() => {
    if (open) {
      void loadFiles()
    } else {
      setSelectedIds(new Set())
      setActiveFile(null)
    }
  }, [open, loadFiles])

  const handleUploadFiles = async (uploadList: FileList | File[]) => {
    if (!uploadList.length) return
    const fileArray = Array.from(uploadList)
    setIsLoading(true)
    try {
      for (const file of fileArray) {
        await api.files.upload(file, undefined, folderId)
      }
      toast({ title: t('attachments.total_value0', { value0: fileArray.length }), tone: 'success' })
      await loadFiles()
    } catch {
      toast({ title: t('common.action_failed'), tone: 'danger' })
    } finally {
      setIsLoading(false)
    }
  }

  const handleDownloadFile = (file: AttachmentWithUsage) => {
    const a = document.createElement('a')
    a.href = file.url
    a.download = file.filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const handleToggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleToggleSelectAll = () => {
    if (selectedIds.size === files.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(files.map((f) => f.id)))
    }
  }

  const handleToggleStar = async (file: AttachmentWithUsage) => {
    const nextVal = !file.isStarred
    try {
      await api.files.patch(file.id, { isStarred: nextVal })
      setFiles((prev) =>
        prev.map((f) => (f.id === file.id ? { ...f, isStarred: nextVal } : f)),
      )
      if (activeFile?.id === file.id) {
        setActiveFile((prev) => (prev ? { ...prev, isStarred: nextVal } : null))
      }
    } catch {
      toast({ title: t('common.action_failed'), tone: 'danger' })
    }
  }

  const handleTogglePin = async (file: AttachmentWithUsage) => {
    const nextVal = !file.isPinned
    try {
      await api.files.patch(file.id, { isPinned: nextVal })
      setFiles((prev) =>
        prev.map((f) => (f.id === file.id ? { ...f, isPinned: nextVal } : f)),
      )
      if (activeFile?.id === file.id) {
        setActiveFile((prev) => (prev ? { ...prev, isPinned: nextVal } : null))
      }
    } catch {
      toast({ title: t('common.action_failed'), tone: 'danger' })
    }
  }

  const handleRename = async (newName: string, updateNoteReferences: boolean) => {
    if (!renameFile) return
    try {
      const updated = await api.files.patch(renameFile.id, {
        filename: newName,
        updateNoteReferences,
      })
      setFiles((prev) =>
        prev.map((f) => (f.id === renameFile.id ? { ...f, filename: updated.filename } : f)),
      )
      if (activeFile?.id === renameFile.id) {
        setActiveFile((prev) => (prev ? { ...prev, filename: updated.filename } : null))
      }
      toast({ title: t('common.saved'), tone: 'success' })
    } catch {
      toast({ title: t('common.save_failed'), tone: 'danger' })
    }
  }

  const handleUpdateTags = async (file: AttachmentWithUsage, newTags: string[]) => {
    try {
      await api.files.patch(file.id, { tags: newTags })
      setFiles((prev) =>
        prev.map((f) => (f.id === file.id ? { ...f, tags: newTags } : f)),
      )
      if (activeFile?.id === file.id) {
        setActiveFile((prev) => (prev ? { ...prev, tags: newTags } : null))
      }
    } catch {
      toast({ title: t('common.save_failed'), tone: 'danger' })
    }
  }

  const handleDeleteFile = async (file: AttachmentWithUsage) => {
    const ok = await confirm({
      title: t('attachments.delete_confirm_value0', { value0: file.filename }),
      description: file.references > 0
        ? t('attachments.referenced_value0', { value0: file.references })
        : undefined,
      confirmLabel: t('common.delete'),
      tone: 'danger',
    })
    if (!ok) return

    try {
      await api.files.remove(file.id)
      setFiles((prev) => prev.filter((f) => f.id !== file.id))
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(file.id)
        return next
      })
      if (activeFile?.id === file.id) {
        setActiveFile(null)
      }
      toast({ title: t('attachments.deleted'), tone: 'success' })
    } catch {
      toast({ title: t('attachments.delete_failed'), tone: 'danger' })
    }
  }

  const handleBatchDelete = async () => {
    const ids = Array.from(selectedIds)
    if (!ids.length) return
    const ok = await confirm({
      title: t('attachments.batch_delete_confirm', { value0: ids.length }),
      confirmLabel: t('common.delete'),
      tone: 'danger',
    })
    if (!ok) return

    try {
      await api.files.batch({ action: 'delete', ids })
      setFiles((prev) => prev.filter((f) => !selectedIds.has(f.id)))
      setSelectedIds(new Set())
      if (activeFile && selectedIds.has(activeFile.id)) {
        setActiveFile(null)
      }
      toast({ title: t('attachments.deleted'), tone: 'success' })
    } catch {
      toast({ title: t('attachments.delete_failed'), tone: 'danger' })
    }
  }

  const handleBatchStar = async () => {
    const ids = Array.from(selectedIds)
    if (!ids.length) return
    try {
      await api.files.batch({ action: 'star', ids, isStarred: true })
      setFiles((prev) =>
        prev.map((f) => (selectedIds.has(f.id) ? { ...f, isStarred: true } : f)),
      )
      toast({ title: t('common.saved'), tone: 'success' })
    } catch {
      toast({ title: t('common.action_failed'), tone: 'danger' })
    }
  }

  const handleBatchDownload = () => {
    const selectedFiles = files.filter((f) => selectedIds.has(f.id))
    for (const file of selectedFiles) {
      const a = document.createElement('a')
      a.href = file.url
      a.download = file.filename
      a.click()
    }
  }

  const handlePrune = async () => {
    const ok = await confirm({
      title: t('attachments.cleanup_confirm'),
      description: t('attachments.cleanup_confirm_description'),
      confirmLabel: t('attachments.cleanup'),
      tone: 'danger',
    })
    if (!ok) return

    setIsPruning(true)
    try {
      const res = await api.files.prune()
      if (res.removed > 0) {
        toast({
          title: t('attachments.cleaned_value0', { value0: res.removed }),
          tone: 'success',
        })
        await loadFiles()
      } else {
        toast({ title: t('attachments.nothing_to_clean'), tone: 'default' })
      }
    } catch {
      toast({ title: t('attachments.cleanup_failed'), tone: 'danger' })
    } finally {
      setIsPruning(false)
    }
  }

  const handleDropFilesToFolder = async (fileIds: string[], targetFolderId: string | null) => {
    try {
      await api.files.batch({ action: 'move', ids: fileIds, folderId: targetFolderId })
      setFiles((prev) =>
        prev.map((f) => (fileIds.includes(f.id) ? { ...f, folderId: targetFolderId } : f)),
      )
      toast({ title: t('common.saved'), tone: 'success' })
    } catch {
      toast({ title: t('common.action_failed'), tone: 'danger' })
    }
  }
    return {
        files,
        setFiles,
        stats,
        setStats,
        isLoading,
        setIsLoading,
        isPruning,
        setIsPruning,
        category,
        setCategory,
        folderId,
        setFolderId,
        tag,
        setTag,
        extension,
        setExtension,
        search,
        setSearch,
        sizeRange,
        setSizeRange,
        sort,
        setSort,
        viewMode,
        setViewMode,
        zoom,
        setZoom,
        selectedIds,
        setSelectedIds,
        activeFile,
        setActiveFile,
        previewFile,
        setPreviewFile,
        qrFile,
        setQrFile,
        renameFile,
        setRenameFile,
        movingFileIds,
        setMovingFileIds,
        isDragOverMain,
        setIsDragOverMain,
        fileInputRef,
        handleUploadFiles,
        handleDownloadFile,
        handleToggleSelect,
        handleToggleSelectAll,
        handleToggleStar,
        handleTogglePin,
        handleRename,
        handleUpdateTags,
        handleDeleteFile,
        handleBatchDelete,
        handleBatchStar,
        handleBatchDownload,
        handlePrune,
        handleDropFilesToFolder,
        attachmentFolders,
        toast,
    };
}

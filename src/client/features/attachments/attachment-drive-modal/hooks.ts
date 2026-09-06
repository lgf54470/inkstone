import { useCallback, useEffect, useRef, useState } from 'react'
import type { AttachmentStats, AttachmentWithUsage } from '@shared/types'
import { t } from '../../../lib/i18n'
import { api } from '../../../lib/api'
import { useUi, type UiState } from '../../../store/ui'
import { confirm } from '../../../components/overlay'
import { useAttachmentStore } from '../attachment-store'
import type { AttachmentCategory } from '../attachment-helpers'

type Setter<T> = React.Dispatch<React.SetStateAction<T>>
type ToastFn = UiState['toast']

function typeParamOf(category: AttachmentCategory): string | undefined {
  if (category === 'image') return 'image'
  if (category === 'document') return 'document'
  if (category === 'media') return 'media'
  if (category === 'archive') return 'archive'
  return undefined
}

function downloadFlow(file: AttachmentWithUsage) {
  const a = document.createElement('a')
  a.href = file.url
  a.download = file.filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

async function toggleStarFlow(file: AttachmentWithUsage, setFiles: Setter<AttachmentWithUsage[]>, activeFile: AttachmentWithUsage | null, setActiveFile: Setter<AttachmentWithUsage | null>, toast: ToastFn) {
  const nextVal = !file.isStarred
  try {
    await api.files.patch(file.id, { isStarred: nextVal })
    setFiles((prev) => prev.map((f) => (f.id === file.id ? { ...f, isStarred: nextVal } : f)))
    if (activeFile?.id === file.id) setActiveFile((prev) => (prev ? { ...prev, isStarred: nextVal } : null))
  } catch {
    toast({ title: t('common.action_failed'), tone: 'danger' })
  }
}

async function togglePinFlow(file: AttachmentWithUsage, setFiles: Setter<AttachmentWithUsage[]>, activeFile: AttachmentWithUsage | null, setActiveFile: Setter<AttachmentWithUsage | null>, toast: ToastFn) {
  const nextVal = !file.isPinned
  try {
    await api.files.patch(file.id, { isPinned: nextVal })
    setFiles((prev) => prev.map((f) => (f.id === file.id ? { ...f, isPinned: nextVal } : f)))
    if (activeFile?.id === file.id) setActiveFile((prev) => (prev ? { ...prev, isPinned: nextVal } : null))
  } catch {
    toast({ title: t('common.action_failed'), tone: 'danger' })
  }
}

async function renameFlow(renameFile: AttachmentWithUsage | null, newName: string, updateNoteReferences: boolean, setFiles: Setter<AttachmentWithUsage[]>, activeFile: AttachmentWithUsage | null, setActiveFile: Setter<AttachmentWithUsage | null>, toast: ToastFn) {
  if (!renameFile) return
  try {
    const updated = await api.files.patch(renameFile.id, { filename: newName, updateNoteReferences })
    setFiles((prev) => prev.map((f) => (f.id === renameFile.id ? { ...f, filename: updated.filename } : f)))
    if (activeFile?.id === renameFile.id) setActiveFile((prev) => (prev ? { ...prev, filename: updated.filename } : null))
    toast({ title: t('common.saved'), tone: 'success' })
  } catch {
    toast({ title: t('common.save_failed'), tone: 'danger' })
  }
}

async function updateTagsFlow(file: AttachmentWithUsage, newTags: string[], setFiles: Setter<AttachmentWithUsage[]>, activeFile: AttachmentWithUsage | null, setActiveFile: Setter<AttachmentWithUsage | null>, toast: ToastFn) {
  try {
    await api.files.patch(file.id, { tags: newTags })
    setFiles((prev) => prev.map((f) => (f.id === file.id ? { ...f, tags: newTags } : f)))
    if (activeFile?.id === file.id) setActiveFile((prev) => (prev ? { ...prev, tags: newTags } : null))
  } catch {
    toast({ title: t('common.save_failed'), tone: 'danger' })
  }
}

async function deleteFileFlow(file: AttachmentWithUsage, setFiles: Setter<AttachmentWithUsage[]>, setSelectedIds: Setter<Set<string>>, activeFile: AttachmentWithUsage | null, setActiveFile: Setter<AttachmentWithUsage | null>, toast: ToastFn) {
  const ok = await confirm({
    title: t('attachments.delete_confirm_value0', { value0: file.filename }),
    description: file.references > 0 ? t('attachments.referenced_value0', { value0: file.references }) : undefined,
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
    if (activeFile?.id === file.id) setActiveFile(null)
    toast({ title: t('attachments.deleted'), tone: 'success' })
  } catch {
    toast({ title: t('attachments.delete_failed'), tone: 'danger' })
  }
}

async function batchDeleteFlow(selectedIds: Set<string>, setFiles: Setter<AttachmentWithUsage[]>, setSelectedIds: Setter<Set<string>>, activeFile: AttachmentWithUsage | null, setActiveFile: Setter<AttachmentWithUsage | null>, toast: ToastFn) {
  const ids = Array.from(selectedIds)
  if (!ids.length) return
  const ok = await confirm({ title: t('attachments.batch_delete_confirm', { value0: ids.length }), confirmLabel: t('common.delete'), tone: 'danger' })
  if (!ok) return
  try {
    await api.files.batch({ action: 'delete', ids })
    setFiles((prev) => prev.filter((f) => !selectedIds.has(f.id)))
    setSelectedIds(new Set())
    if (activeFile && selectedIds.has(activeFile.id)) setActiveFile(null)
    toast({ title: t('attachments.deleted'), tone: 'success' })
  } catch {
    toast({ title: t('attachments.delete_failed'), tone: 'danger' })
  }
}

async function batchStarFlow(selectedIds: Set<string>, setFiles: Setter<AttachmentWithUsage[]>, toast: ToastFn) {
  const ids = Array.from(selectedIds)
  if (!ids.length) return
  try {
    await api.files.batch({ action: 'star', ids, isStarred: true })
    setFiles((prev) => prev.map((f) => (selectedIds.has(f.id) ? { ...f, isStarred: true } : f)))
    toast({ title: t('common.saved'), tone: 'success' })
  } catch {
    toast({ title: t('common.action_failed'), tone: 'danger' })
  }
}

function batchDownloadFlow(files: AttachmentWithUsage[], selectedIds: Set<string>) {
  for (const file of files.filter((f) => selectedIds.has(f.id))) {
    const a = document.createElement('a')
    a.href = file.url
    a.download = file.filename
    a.click()
  }
}

async function pruneFlow(toast: ToastFn, setIsPruning: Setter<boolean>, loadFiles: () => Promise<void>) {
  const ok = await confirm({ title: t('attachments.cleanup_confirm'), description: t('attachments.cleanup_confirm_description'), confirmLabel: t('attachments.cleanup'), tone: 'danger' })
  if (!ok) return
  setIsPruning(true)
  try {
    const res = await api.files.prune()
    if (res.removed > 0) {
      toast({ title: t('attachments.cleaned_value0', { value0: res.removed }), tone: 'success' })
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

async function dropFilesFlow(fileIds: string[], targetFolderId: string | null, setFiles: Setter<AttachmentWithUsage[]>, toast: ToastFn) {
  try {
    await api.files.batch({ action: 'move', ids: fileIds, folderId: targetFolderId })
    setFiles((prev) => prev.map((f) => (fileIds.includes(f.id) ? { ...f, folderId: targetFolderId } : f)))
    toast({ title: t('common.saved'), tone: 'success' })
  } catch {
    toast({ title: t('common.action_failed'), tone: 'danger' })
  }
}

async function uploadFilesFlow(uploadList: FileList | File[], folderId: string | null, setIsLoading: Setter<boolean>, loadFiles: () => Promise<void>, toast: ToastFn) {
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

function useDriveFilters() {
  const [category, setCategory] = useState<AttachmentCategory>('all')
  const [folderId, setFolderId] = useState<string | null>(null)
  const [tag, setTag] = useState<string | null>(null)
  const [extension, setExtension] = useState('all')
  const [search, setSearch] = useState('')
  const [sizeRange, setSizeRange] = useState('all')
  const [sort, setSort] = useState('date_desc')
  return { category, setCategory, folderId, setFolderId, tag, setTag, extension, setExtension, search, setSearch, sizeRange, setSizeRange, sort, setSort }
}

function useDriveView() {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [zoom, setZoom] = useState<'sm' | 'md' | 'lg'>('md')
  return { viewMode, setViewMode, zoom, setZoom }
}

function useDriveFiles(open: boolean, filters: ReturnType<typeof useDriveFilters>, toast: ToastFn) {
  const [files, setFiles] = useState<AttachmentWithUsage[]>([])
  const [stats, setStats] = useState<AttachmentStats | undefined>(undefined)
  const [isLoading, setIsLoading] = useState(false)
  const [isPruning, setIsPruning] = useState(false)

  const loadFiles = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await api.files.list({
        folderId: filters.folderId ?? undefined,
        type: typeParamOf(filters.category),
        extension: filters.extension !== 'all' ? filters.extension : undefined,
        sizeRange: filters.sizeRange !== 'all' ? filters.sizeRange : undefined,
        tag: filters.tag ?? undefined,
        starred: filters.category === 'starred' ? true : undefined,
        pinned: filters.category === 'pinned' ? true : undefined,
        search: filters.search.trim() || undefined,
        sort: filters.sort,
        limit: 500,
      })
      setFiles(filters.category === 'unreferenced' ? res.files.filter((f) => f.references === 0) : res.files)
      setStats(res.stats)
    } catch {
      toast({ title: t('attachments.load_failed'), tone: 'danger' })
    } finally {
      setIsLoading(false)
    }
  }, [filters.category, filters.folderId, filters.tag, filters.extension, filters.search, filters.sizeRange, filters.sort, toast])

  useEffect(() => {
    if (open) void loadFiles()
  }, [open, loadFiles])

  const handleUploadFiles = (uploadList: FileList | File[]) => uploadFilesFlow(uploadList, filters.folderId, setIsLoading, loadFiles, toast)
  const handlePrune = () => pruneFlow(toast, setIsPruning, loadFiles)

  return { files, setFiles, stats, setStats, isLoading, setIsLoading, isPruning, setIsPruning, loadFiles, handleUploadFiles, handlePrune }
}

function useDriveSelection(open: boolean, files: AttachmentWithUsage[]) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [activeFile, setActiveFile] = useState<AttachmentWithUsage | null>(null)

  useEffect(() => {
    if (!open) {
      setSelectedIds(new Set())
      setActiveFile(null)
    }
  }, [open])

  const handleToggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleToggleSelectAll = () => {
    if (selectedIds.size === files.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(files.map((f) => f.id)))
  }

  return { selectedIds, setSelectedIds, activeFile, setActiveFile, handleToggleSelect, handleToggleSelectAll }
}

function useDriveDialogs() {
  const [previewFile, setPreviewFile] = useState<AttachmentWithUsage | null>(null)
  const [qrFile, setQrFile] = useState<AttachmentWithUsage | null>(null)
  const [renameFile, setRenameFile] = useState<AttachmentWithUsage | null>(null)
  const [movingFileIds, setMovingFileIds] = useState<string[] | null>(null)
  return { previewFile, setPreviewFile, qrFile, setQrFile, renameFile, setRenameFile, movingFileIds, setMovingFileIds }
}

type DriveFiles = ReturnType<typeof useDriveFiles>
type DriveSelection = ReturnType<typeof useDriveSelection>
type DriveDialogs = ReturnType<typeof useDriveDialogs>

function useDriveHandlers(files: DriveFiles, selection: DriveSelection, dialogs: DriveDialogs, toast: ToastFn) {
  const handleDownloadFile = (file: AttachmentWithUsage) => downloadFlow(file)
  const handleToggleStar = (file: AttachmentWithUsage) => toggleStarFlow(file, files.setFiles, selection.activeFile, selection.setActiveFile, toast)
  const handleTogglePin = (file: AttachmentWithUsage) => togglePinFlow(file, files.setFiles, selection.activeFile, selection.setActiveFile, toast)
  const handleRename = (newName: string, updateNoteReferences: boolean) => renameFlow(dialogs.renameFile, newName, updateNoteReferences, files.setFiles, selection.activeFile, selection.setActiveFile, toast)
  const handleUpdateTags = (file: AttachmentWithUsage, newTags: string[]) => updateTagsFlow(file, newTags, files.setFiles, selection.activeFile, selection.setActiveFile, toast)
  const handleDeleteFile = (file: AttachmentWithUsage) => deleteFileFlow(file, files.setFiles, selection.setSelectedIds, selection.activeFile, selection.setActiveFile, toast)
  const handleBatchDelete = () => batchDeleteFlow(selection.selectedIds, files.setFiles, selection.setSelectedIds, selection.activeFile, selection.setActiveFile, toast)
  const handleBatchStar = () => batchStarFlow(selection.selectedIds, files.setFiles, toast)
  const handleBatchDownload = () => batchDownloadFlow(files.files, selection.selectedIds)
  const handleDropFilesToFolder = (fileIds: string[], targetFolderId: string | null) => dropFilesFlow(fileIds, targetFolderId, files.setFiles, toast)
  return { handleDownloadFile, handleToggleStar, handleTogglePin, handleRename, handleUpdateTags, handleDeleteFile, handleBatchDelete, handleBatchStar, handleBatchDownload, handleDropFilesToFolder }
}

/** All state + async actions behind the attachment drive modal, so the modal component stays a thin JSX shell. */
export function useAttachmentDriveModal(open: boolean) {
  const attachmentFolders = useAttachmentStore((s) => s.folders)
  const toast = useUi((s) => s.toast)
  const filters = useDriveFilters()
  const view = useDriveView()
  const files = useDriveFiles(open, filters, toast)
  const selection = useDriveSelection(open, files.files)
  const dialogs = useDriveDialogs()
  const handlers = useDriveHandlers(files, selection, dialogs, toast)
  const [isDragOverMain, setIsDragOverMain] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  return { ...files, ...filters, ...view, ...selection, ...dialogs, ...handlers, isDragOverMain, setIsDragOverMain, fileInputRef, attachmentFolders, toast }
}
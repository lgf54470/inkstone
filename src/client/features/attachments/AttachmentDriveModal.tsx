import { useCallback, useEffect, useRef, useState } from 'react'
import { HardDrive, Loader2, Upload, X } from 'lucide-react'
import type { AttachmentStats, AttachmentWithUsage } from '@shared/types'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import { api } from '../../lib/api'
import { useUi } from '../../store/ui'
import { useAttachmentStore } from './attachment-store'
import { Modal, confirm } from '../../components/overlay'
import { IconButton } from '../../components/primitives'
import { FolderPicker } from '../folders'
import { FilePreviewModal } from '../preview'
import { AttachmentDriveSidebar } from './AttachmentDriveSidebar'
import { AttachmentDriveToolbar } from './AttachmentDriveToolbar'
import { AttachmentDashboardView } from './AttachmentDashboardView'
import { AttachmentGridView } from './AttachmentGridView'
import { AttachmentListView } from './AttachmentListView'
import { AttachmentBatchBar } from './AttachmentBatchBar'
import { AttachmentInspector } from './AttachmentInspector'
import { AttachmentQrModal } from './AttachmentQrModal'
import { AttachmentRenameModal } from './AttachmentRenameModal'
import type { AttachmentCategory } from './attachment-helpers'

export function AttachmentDriveModal({
  open,
  onClose,
  onInsertFile,
}: {
  open: boolean
  onClose: () => void
  onInsertFile?: (file: AttachmentWithUsage) => void
}) {
  const attachmentFolders = useAttachmentStore((s) => s.folders)
  const toast = useUi((s) => s.toast)

  const [files, setFiles] = useState<AttachmentWithUsage[]>([])
  const [stats, setStats] = useState<AttachmentStats | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [pruning, setPruning] = useState(false)

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

  const [dragOverMain, setDragOverMain] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadFiles = useCallback(async () => {
    setLoading(true)
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
      setLoading(false)
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
    setLoading(true)
    try {
      for (const file of fileArray) {
        await api.files.upload(file, undefined, folderId)
      }
      toast({ title: t('attachments.total_value0', { value0: fileArray.length }), tone: 'success' })
      await loadFiles()
    } catch {
      toast({ title: t('common.action_failed'), tone: 'danger' })
    } finally {
      setLoading(false)
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

    setPruning(true)
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
      setPruning(false)
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

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        width={1300}
        className="h-[82vh] min-h-[560px] max-h-[860px] p-0 overflow-hidden flex flex-col"
        bodyClassName="p-0 flex-1 min-h-0 flex flex-col overflow-hidden"
      >
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-4 bg-[var(--bg-surface)]">
          <div className="flex items-center gap-2">
            <HardDrive size={16} className="text-[var(--accent)]" />
            <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">
              {t('attachments.drive_title')}
            </h2>
          </div>
          <IconButton label={t('common.close')} size="sm" onClick={onClose}>
            <X size={15} />
          </IconButton>
        </div>

        <div className="flex min-h-0 flex-1">
          <AttachmentDriveSidebar
            selectedCategory={category}
            onSelectCategory={(cat) => {
              setCategory(cat)
              setFolderId(null)
              setTag(null)
            }}
            selectedFolderId={folderId}
            onSelectFolder={(id) => {
              setFolderId(id)
              setCategory('all')
              setTag(null)
            }}
            selectedTag={tag}
            onSelectTag={(tName) => {
              setTag(tName)
              setCategory('all')
              setFolderId(null)
            }}
            stats={stats}
            onDropFilesToFolder={handleDropFilesToFolder}
          />

          <div
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes('Files')) {
                e.preventDefault()
                setDragOverMain(true)
              }
            }}
            onDragLeave={() => setDragOverMain(false)}
            onDrop={(e) => {
              if (e.dataTransfer.files.length) {
                e.preventDefault()
                setDragOverMain(false)
                void handleUploadFiles(e.dataTransfer.files)
              }
            }}
            className={cn(
              'relative flex min-w-0 flex-1 flex-col bg-[var(--bg-base)]',
              dragOverMain && 'ring-2 ring-inset ring-[var(--accent)] bg-[var(--accent-soft)]/20',
            )}
          >
            <AttachmentDriveToolbar
              search={search}
              onSearchChange={setSearch}
              extension={extension}
              onExtensionChange={setExtension}
              sizeRange={sizeRange}
              onSizeRangeChange={setSizeRange}
              sort={sort}
              onSortChange={setSort}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              zoom={zoom}
              onZoomChange={setZoom}
              stats={stats}
              onUploadClick={() => fileInputRef.current?.click()}
              onPruneClick={() => void handlePrune()}
              pruning={pruning}
            />

            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) void handleUploadFiles(e.target.files)
              }}
            />

            <div className="min-h-0 flex-1 overflow-y-auto">
              {category === 'dashboard' ? (
                <AttachmentDashboardView
                  stats={stats}
                  onSelectCategory={(cat) => {
                    setCategory(cat)
                    setFolderId(null)
                    setTag(null)
                  }}
                  onSelectExtension={(ext) => {
                    setExtension(ext)
                    setCategory('all')
                    setFolderId(null)
                    setTag(null)
                  }}
                  onPreviewFile={setPreviewFile}
                  onDownloadFile={handleDownloadFile}
                  onDeleteFile={(f) => void handleDeleteFile(f)}
                  onPrune={() => void handlePrune()}
                />
              ) : loading && files.length === 0 ? (
                <div className="flex h-full items-center justify-center py-20 text-[var(--text-tertiary)]">
                  <Loader2 size={24} className="animate-spin text-[var(--accent)]" />
                </div>
              ) : files.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center py-24 text-center px-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--bg-sunken)] text-[var(--text-quaternary)] mb-3">
                    <Upload size={24} />
                  </div>
                  <p className="text-[13px] font-medium text-[var(--text-secondary)] max-w-sm">
                    {search ? t('attachments.none_match') : t('attachments.drag_drop_hint')}
                  </p>
                </div>
              ) : viewMode === 'grid' ? (
                <AttachmentGridView
                  files={files}
                  selectedIds={selectedIds}
                  onToggleSelect={handleToggleSelect}
                  activeFile={activeFile}
                  onSelectActive={setActiveFile}
                  zoom={zoom}
                  onPreview={setPreviewFile}
                  onRename={setRenameFile}
                  onShowQr={setQrFile}
                  onInsertToNote={onInsertFile}
                  onToggleStar={(f) => void handleToggleStar(f)}
                  onTogglePin={(f) => void handleTogglePin(f)}
                  onMoveToFolder={(f) => setMovingFileIds([f.id])}
                  onDelete={(f) => void handleDeleteFile(f)}
                  onUploadClick={() => fileInputRef.current?.click()}
                />
              ) : (
                <AttachmentListView
                  files={files}
                  selectedIds={selectedIds}
                  onToggleSelect={handleToggleSelect}
                  onToggleSelectAll={handleToggleSelectAll}
                  allSelected={files.length > 0 && selectedIds.size === files.length}
                  activeFile={activeFile}
                  onSelectActive={setActiveFile}
                  onPreview={setPreviewFile}
                  onRename={setRenameFile}
                  onShowQr={setQrFile}
                  onInsertToNote={onInsertFile}
                  onToggleStar={(f) => void handleToggleStar(f)}
                  onTogglePin={(f) => void handleTogglePin(f)}
                  onMoveToFolder={(f) => setMovingFileIds([f.id])}
                  onDelete={(f) => void handleDeleteFile(f)}
                  onUploadClick={() => fileInputRef.current?.click()}
                />
              )}
            </div>

            <AttachmentBatchBar
              selectedCount={selectedIds.size}
              onClearSelection={() => setSelectedIds(new Set())}
              onBatchDownload={handleBatchDownload}
              onBatchMove={() => setMovingFileIds(Array.from(selectedIds))}
              onBatchStar={() => void handleBatchStar()}
              onBatchDelete={() => void handleBatchDelete()}
            />
          </div>

          <AttachmentInspector
            file={activeFile}
            onClose={() => setActiveFile(null)}
            onRename={setRenameFile}
            onShowQr={setQrFile}
            onInsertToNote={onInsertFile}
            onDelete={(f) => void handleDeleteFile(f)}
            onUpdateTags={handleUpdateTags}
            onPreview={setPreviewFile}
          />
        </div>
      </Modal>

      {qrFile && (
        <AttachmentQrModal
          open={Boolean(qrFile)}
          onClose={() => setQrFile(null)}
          url={qrFile.url}
          filename={qrFile.filename}
        />
      )}

      {renameFile && (
        <AttachmentRenameModal
          open={Boolean(renameFile)}
          onClose={() => setRenameFile(null)}
          currentFilename={renameFile.filename}
          onRename={handleRename}
        />
      )}

      {movingFileIds && (
        <FolderPicker
          open={Boolean(movingFileIds)}
          title={t('attachments.move_to')}
          folders={attachmentFolders.map((f) => ({
            id: f.id,
            parentId: f.parentId,
            name: f.name,
            icon: f.icon ?? null,
            color: f.color ?? null,
            position: f.position ?? 0,
            createdAt: f.createdAt,
            updatedAt: f.updatedAt,
          }))}
          currentId={null}
          onSelect={(targetId) => {
            void handleDropFilesToFolder(movingFileIds, targetId)
          }}
          onClose={() => setMovingFileIds(null)}
        />
      )}

      {previewFile && (
        <FilePreviewModal
          open={Boolean(previewFile)}
          onClose={() => setPreviewFile(null)}
          url={previewFile.url}
          filename={previewFile.filename}
        />
      )}
    </>
  )
}

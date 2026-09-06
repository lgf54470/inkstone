import { HardDrive, Loader2, Upload, X } from 'lucide-react'
import type { AttachmentWithUsage } from '@shared/types'
import { useAttachmentDriveModal } from './hooks'
import { cn } from '../../../lib/cn'
import { t } from '../../../lib/i18n'
import { Modal } from '../../../components/overlay'
import { IconButton } from '../../../components/primitives'
import { FolderPicker } from '../../folders'
import { FilePreviewModal } from '../../preview'
import { AttachmentDriveSidebar } from '../attachment-drive-sidebar'
import { AttachmentDriveToolbar } from '../attachment-drive-toolbar'
import { AttachmentDashboardView } from '../attachment-dashboard-view'
import { AttachmentGridView } from '../attachment-grid-view'
import { AttachmentListView } from '../attachment-list-view'
import { AttachmentBatchBar } from '../attachment-batch-bar'
import { AttachmentInspector } from '../attachment-inspector'
import { AttachmentQrModal } from '../attachment-qr-modal'
import { AttachmentRenameModal } from '../attachment-rename-modal'

type DriveBundle = ReturnType<typeof useAttachmentDriveModal>


interface AttachmentDriveModalProps {
  open: boolean
  onClose: () => void
  onInsertFile?: (file: AttachmentWithUsage) => void
}

export function AttachmentDriveModal(props: AttachmentDriveModalProps) {
  const { open, onClose, onInsertFile } = props
  const b = useAttachmentDriveModal(open)

  return (
    <>
      <Modal open={open} onClose={onClose} width={1300} className="h-[82vh] min-h-[560px] max-h-[860px] p-0 overflow-hidden flex flex-col" bodyClassName="p-0 flex-1 min-h-0 flex flex-col overflow-hidden">
        <DriveHeader onClose={onClose} />
        <div className="flex min-h-0 flex-1">
          <DriveSidebar b={b} />
          <MainDropZone b={b} onInsertFile={onInsertFile} />
          <DriveInspector b={b} onInsertFile={onInsertFile} />
        </div>
      </Modal>
      <DriveDialogs b={b} />
    </>
  )
}

function DriveSidebar({ b }: { b: DriveBundle }) {
  return (
    <AttachmentDriveSidebar
      selectedCategory={b.category}
      onSelectCategory={(cat) => {
        b.setCategory(cat)
        b.setFolderId(null)
        b.setTag(null)
      }}
      selectedFolderId={b.folderId}
      onSelectFolder={(id) => {
        b.setFolderId(id)
        b.setCategory('all')
        b.setTag(null)
      }}
      selectedTag={b.tag}
      onSelectTag={(tName) => {
        b.setTag(tName)
        b.setCategory('all')
        b.setFolderId(null)
      }}
      stats={b.stats}
      onDropFilesToFolder={b.handleDropFilesToFolder}
    />
  )
}

function DriveInspector({ b, onInsertFile }: { b: DriveBundle; onInsertFile?: (file: AttachmentWithUsage) => void }) {
  return (
    <AttachmentInspector
      file={b.activeFile}
      onClose={() => b.setActiveFile(null)}
      onRename={b.setRenameFile}
      onShowQr={b.setQrFile}
      onInsertToNote={onInsertFile}
      onDelete={b.handleDeleteFile}
      onUpdateTags={b.handleUpdateTags}
      onPreview={b.setPreviewFile}
    />
  )
}

function DriveDialogs({ b }: { b: DriveBundle }) {
  return (
    <>
      {b.qrFile && <AttachmentQrModal open={Boolean(b.qrFile)} onClose={() => b.setQrFile(null)} url={b.qrFile.url} filename={b.qrFile.filename} />}
      {b.renameFile && <AttachmentRenameModal open={Boolean(b.renameFile)} onClose={() => b.setRenameFile(null)} currentFilename={b.renameFile.filename} onRename={b.handleRename} />}
      {b.movingFileIds && <MoveFilesPicker b={b} />}
      {b.previewFile && <FilePreviewModal open={Boolean(b.previewFile)} onClose={() => b.setPreviewFile(null)} url={b.previewFile.url} filename={b.previewFile.filename} />}
    </>
  )
}

function DriveHeader({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex h-11 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-4 bg-[var(--bg-surface)]">
      <div className="flex items-center gap-2">
        <HardDrive size={16} className="text-[var(--accent)]" />
        <h2 className="text-[length:var(--text-14)] font-semibold text-[var(--text-primary)]">
          {t('attachments.drive_title')}
        </h2>
      </div>
      <IconButton label={t('common.close')} size="sm" onClick={onClose}>
        <X size={15} />
      </IconButton>
    </div>
  )
}

function MainDropZone({ b, onInsertFile }: { b: DriveBundle; onInsertFile?: (file: AttachmentWithUsage) => void }) {
  return (
    <div
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault()
          b.setIsDragOverMain(true)
        }
      }}
      onDragLeave={() => b.setIsDragOverMain(false)}
      onDrop={(e) => {
        if (e.dataTransfer.files.length) {
          e.preventDefault()
          b.setIsDragOverMain(false)
          void b.handleUploadFiles(e.dataTransfer.files)
        }
      }}
      className={cn(
        'relative flex min-w-0 flex-1 flex-col bg-[var(--bg-base)]',
        b.isDragOverMain && 'ring-2 ring-inset ring-[var(--accent)] bg-[var(--accent-soft)]/20',
      )}
    >
      <DriveToolbar b={b} />
      <input
        ref={b.fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) void b.handleUploadFiles(e.target.files)
        }}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <DriveContent b={b} onInsertFile={onInsertFile} />
      </div>
      <AttachmentBatchBar
        selectedCount={b.selectedIds.size}
        onClearSelection={() => b.setSelectedIds(new Set())}
        onBatchDownload={b.handleBatchDownload}
        onBatchMove={() => b.setMovingFileIds(Array.from(b.selectedIds))}
        onBatchStar={() => void b.handleBatchStar()}
        onBatchDelete={() => void b.handleBatchDelete()}
      />
    </div>
  )
}

function DriveToolbar({ b }: { b: DriveBundle }) {
  return (
    <AttachmentDriveToolbar
      search={b.search}
      onSearchChange={b.setSearch}
      extension={b.extension}
      onExtensionChange={b.setExtension}
      sizeRange={b.sizeRange}
      onSizeRangeChange={b.setSizeRange}
      sort={b.sort}
      onSortChange={b.setSort}
      viewMode={b.viewMode}
      onViewModeChange={b.setViewMode}
      zoom={b.zoom}
      onZoomChange={b.setZoom}
      stats={b.stats}
      onUploadClick={() => b.fileInputRef.current?.click()}
      onPruneClick={() => void b.handlePrune()}
      pruning={b.isPruning}
    />
  )
}

function DriveContent({ b, onInsertFile }: { b: DriveBundle; onInsertFile?: (file: AttachmentWithUsage) => void }) {
  if (b.category === 'dashboard') return <DriveDashboard b={b} />
  if (b.isLoading && b.files.length === 0) return <LoadingState />
  if (b.files.length === 0) return <EmptyState hasSearch={Boolean(b.search)} />
  return <DriveFileView b={b} onInsertFile={onInsertFile} />
}

function DriveDashboard({ b }: { b: DriveBundle }) {
  return (
    <AttachmentDashboardView
      stats={b.stats}
      onSelectCategory={(cat) => {
        b.setCategory(cat)
        b.setFolderId(null)
        b.setTag(null)
      }}
      onSelectExtension={(ext) => {
        b.setExtension(ext)
        b.setCategory('all')
        b.setFolderId(null)
        b.setTag(null)
      }}
      onPreviewFile={b.setPreviewFile}
      onDownloadFile={b.handleDownloadFile}
      onDeleteFile={(f) => void b.handleDeleteFile(f)}
      onPrune={() => void b.handlePrune()}
    />
  )
}

function LoadingState() {
  return (
    <div className="flex h-full items-center justify-center py-20 text-[var(--text-tertiary)]">
      <Loader2 size={24} className="animate-spin text-[var(--accent)]" />
    </div>
  )
}

function EmptyState({ hasSearch }: { hasSearch: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center py-24 text-center px-4">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--bg-sunken)] text-[var(--text-quaternary)] mb-3">
        <Upload size={24} />
      </div>
      <p className="text-[length:var(--text-13)] font-medium text-[var(--text-secondary)] max-w-sm">
        {hasSearch ? t('attachments.none_match') : t('attachments.drag_drop_hint')}
      </p>
    </div>
  )
}

function DriveFileView({ b, onInsertFile }: { b: DriveBundle; onInsertFile?: (file: AttachmentWithUsage) => void }) {
  const commonProps = {
    files: b.files,
    selectedIds: b.selectedIds,
    onToggleSelect: b.handleToggleSelect,
    activeFile: b.activeFile,
    onSelectActive: b.setActiveFile,
    onPreview: b.setPreviewFile,
    onRename: b.setRenameFile,
    onShowQr: b.setQrFile,
    onInsertToNote: onInsertFile,
    onToggleStar: b.handleToggleStar,
    onTogglePin: b.handleTogglePin,
    onMoveToFolder: (f: AttachmentWithUsage) => b.setMovingFileIds([f.id]),
    onDelete: b.handleDeleteFile,
    onUploadClick: () => b.fileInputRef.current?.click(),
  }
  return b.viewMode === 'grid' ? (
    <AttachmentGridView {...commonProps} zoom={b.zoom} />
  ) : (
    <AttachmentListView {...commonProps} onToggleSelectAll={b.handleToggleSelectAll} allSelected={b.files.length > 0 && b.selectedIds.size === b.files.length} />
  )
}

function MoveFilesPicker({ b }: { b: DriveBundle }) {
  return (
    <FolderPicker
      open={Boolean(b.movingFileIds)}
      title={t('attachments.move_to')}
      folders={b.attachmentFolders.map((f) => ({
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
        if (b.movingFileIds) void b.handleDropFilesToFolder(b.movingFileIds, targetId)
      }}
      onClose={() => b.setMovingFileIds(null)}
    />
  )
}
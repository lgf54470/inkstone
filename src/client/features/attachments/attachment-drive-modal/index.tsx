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

export function AttachmentDriveModal({
  open,
  onClose,
  onInsertFile,
}: {
  open: boolean
  onClose: () => void
  onInsertFile?: (file: AttachmentWithUsage) => void
}) {
  const { files, stats, isLoading, isPruning, category, setCategory, folderId, setFolderId, tag, setTag, extension, setExtension, search, setSearch, sizeRange, setSizeRange, sort, setSort, viewMode, setViewMode, zoom, setZoom, selectedIds, setSelectedIds, activeFile, setActiveFile, previewFile, setPreviewFile, qrFile, setQrFile, renameFile, setRenameFile, movingFileIds, setMovingFileIds, isDragOverMain, setIsDragOverMain, fileInputRef, handleUploadFiles, handleDownloadFile, handleToggleSelect, handleToggleSelectAll, handleToggleStar, handleTogglePin, handleRename, handleUpdateTags, handleDeleteFile, handleBatchDelete, handleBatchStar, handleBatchDownload, handlePrune, handleDropFilesToFolder, attachmentFolders } = useAttachmentDriveModal(open)

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
            <h2 className="text-[length:var(--text-14)] font-semibold text-[var(--text-primary)]">
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
                setIsDragOverMain(true)
              }
            }}
            onDragLeave={() => setIsDragOverMain(false)}
            onDrop={(e) => {
              if (e.dataTransfer.files.length) {
                e.preventDefault()
                setIsDragOverMain(false)
                void handleUploadFiles(e.dataTransfer.files)
              }
            }}
            className={cn(
              'relative flex min-w-0 flex-1 flex-col bg-[var(--bg-base)]',
              isDragOverMain && 'ring-2 ring-inset ring-[var(--accent)] bg-[var(--accent-soft)]/20',
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
              pruning={isPruning}
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
              ) : isLoading && files.length === 0 ? (
                <div className="flex h-full items-center justify-center py-20 text-[var(--text-tertiary)]">
                  <Loader2 size={24} className="animate-spin text-[var(--accent)]" />
                </div>
              ) : files.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center py-24 text-center px-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--bg-sunken)] text-[var(--text-quaternary)] mb-3">
                    <Upload size={24} />
                  </div>
                  <p className="text-[length:var(--text-13)] font-medium text-[var(--text-secondary)] max-w-sm">
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

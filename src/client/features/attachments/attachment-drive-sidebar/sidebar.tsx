import { useEffect, useMemo, useState } from 'react';
import { Archive, ChevronsDownUp, ChevronsUpDown, Film, FileText, HardDrive, Images, LayoutDashboard, Link2Off, Pin, Plus, Star } from 'lucide-react';
import type { ReactNode } from 'react';
import type { AttachmentFolder, AttachmentStats, Folder, Tag } from '@shared/types';
import { cn } from '../../../lib/cn';
import { t } from '../../../lib/i18n';
import type { FolderNode } from '../../../store/notes';
import type { TagTreeNode } from '../../../lib/tag-tree';
import { IconButton } from '../../../components/primitives';
import { Tooltip } from '../../../components/overlay';
import { FolderPicker } from '../../folders';
import { DEFAULT_QUOTA_BYTES, formatFileSize, type AttachmentCategory } from '../attachment-helpers';
import { useAttachmentFolderTree, useAttachmentStore, useAttachmentTagTree } from '../attachment-store';
import { SectionLabel } from './label';
import { DriveFolderRow } from './folder-row';
import { DriveTagRow } from './tag-row';


interface AttachmentDriveSidebarProps {
  selectedCategory: AttachmentCategory
  onSelectCategory: (cat: AttachmentCategory) => void
  selectedFolderId: string | null
  onSelectFolder: (folderId: string | null) => void
  selectedTag: string | null
  onSelectTag: (tag: string | null) => void
  stats?: AttachmentStats
  onDropFilesToFolder: (fileIds: string[], targetFolderId: string | null) => Promise<void>
}

function categoryList(): { id: AttachmentCategory; label: string; icon: ReactNode }[] {
  return [
    { id: 'dashboard', label: t('attachments.dashboard'), icon: <LayoutDashboard size={14} /> },
    { id: 'all', label: t('attachments.all_files'), icon: <HardDrive size={14} /> },
    { id: 'image', label: t('attachments.photos'), icon: <Images size={14} /> },
    { id: 'document', label: t('attachments.documents'), icon: <FileText size={14} /> },
    { id: 'media', label: t('attachments.media'), icon: <Film size={14} /> },
    { id: 'archive', label: t('attachments.archives'), icon: <Archive size={14} /> },
    { id: 'starred', label: t('attachments.starred_files'), icon: <Star size={14} /> },
    { id: 'pinned', label: t('attachments.pinned_files'), icon: <Pin size={14} /> },
    { id: 'unreferenced', label: t('attachments.unreferenced_files'), icon: <Link2Off size={14} /> },
  ]
}

function useAttachmentSidebarStore() {
  const tree = useAttachmentFolderTree()
  const { tree: tagTree, flatTree: flattenedTags } = useAttachmentTagTree()
  const folders = useAttachmentStore((s) => s.folders)
  const load = useAttachmentStore((s) => s.load)
  const createFolder = useAttachmentStore((s) => s.createFolder)
  const patchFolder = useAttachmentStore((s) => s.patchFolder)
  const deleteFolder = useAttachmentStore((s) => s.deleteFolder)
  const createTag = useAttachmentStore((s) => s.createTag)
  const patchTag = useAttachmentStore((s) => s.patchTag)
  const deleteTag = useAttachmentStore((s) => s.deleteTag)
  const expandedFolders = useAttachmentStore((s) => s.expandedFolders)
  const toggleFolderExpanded = useAttachmentStore((s) => s.toggleFolderExpanded)
  const setExpandedFolders = useAttachmentStore((s) => s.setExpandedFolders)
  const expandedTagPaths = useAttachmentStore((s) => s.expandedTagPaths)
  const toggleTagExpanded = useAttachmentStore((s) => s.toggleTagExpanded)
  const setExpandedTagPaths = useAttachmentStore((s) => s.setExpandedTagPaths)

  useEffect(() => {
    void load()
  }, [load])

  return { tree, tagTree, flattenedTags, folders, createFolder, patchFolder, deleteFolder, createTag, patchTag, deleteTag, expandedFolders, toggleFolderExpanded, setExpandedFolders, expandedTagPaths, toggleTagExpanded, setExpandedTagPaths }
}

function useSidebarExpansion(tagTree: TagTreeNode[], expandedTagPaths: Set<string>, setExpandedTagPaths: (updater: Set<string> | ((prev: Set<string>) => Set<string>)) => void, tree: FolderNode[], expandedFolders: string[], setExpandedFolders: (updater: string[] | ((prev: string[]) => string[])) => void) {
  const parentTagPaths = useMemo(() => {
    const result: string[] = []
    const visit = (nodes: readonly TagTreeNode[]) => {
      for (const node of nodes) {
        if (node.children.length > 0) {
          result.push(node.fullPath)
          visit(node.children)
        }
      }
    }
    visit(tagTree)
    return result
  }, [tagTree])

  const allTagsExpanded = parentTagPaths.length > 0 && parentTagPaths.every((p) => expandedTagPaths.has(p))
  const toggleAllTags = () => {
    if (allTagsExpanded) setExpandedTagPaths(new Set())
    else setExpandedTagPaths(new Set(parentTagPaths))
  }

  const allFoldersExpanded = tree.length > 0 && tree.every((f) => expandedFolders.includes(f.id))
  const toggleAllFolders = () => {
    if (allFoldersExpanded) setExpandedFolders([])
    else {
      const allIds: string[] = []
      const collect = (nodes: FolderNode[]) => {
        for (const n of nodes) {
          allIds.push(n.id)
          if (n.children?.length) collect(n.children)
        }
      }
      collect(tree)
      setExpandedFolders(allIds)
    }
  }

  return { allTagsExpanded, toggleAllTags, allFoldersExpanded, toggleAllFolders }
}

export function AttachmentDriveSidebar(props: AttachmentDriveSidebarProps) {
  const { selectedCategory, onSelectCategory, selectedFolderId, onSelectFolder, selectedTag, onSelectTag, stats, onDropFilesToFolder } = props
  const store = useAttachmentSidebarStore()
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null)
  const [movingFolderId, setMovingFolderId] = useState<string | null>(null)
  const expansion = useSidebarExpansion(store.tagTree, store.expandedTagPaths, store.setExpandedTagPaths, store.tree, store.expandedFolders, store.setExpandedFolders)

  const handleCreateRootFolder = async () => {
    const created = await store.createFolder()
    if (created) setRenamingFolderId(created.id)
  }

  const handleCreateNewTag = async () => {
    const name = window.prompt(t('tags.new_placeholder'))
    if (name?.trim()) await store.createTag(name.trim())
  }

  return (
    <div className="flex h-full w-60 shrink-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[length:var(--text-12\\.5)] select-none">
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3 space-y-4">
        <CategoryList selectedCategory={selectedCategory} selectedFolderId={selectedFolderId} selectedTag={selectedTag} onSelectCategory={onSelectCategory} />
        <FolderSection tree={store.tree} selectedFolderId={selectedFolderId} renamingFolderId={renamingFolderId} expandedFolders={store.expandedFolders} allFoldersExpanded={expansion.allFoldersExpanded} toggleAllFolders={expansion.toggleAllFolders} handleCreateRootFolder={handleCreateRootFolder} toggleFolderExpanded={store.toggleFolderExpanded} setRenamingFolderId={setRenamingFolderId} patchFolder={store.patchFolder} onSelectFolder={onSelectFolder} setMovingFolderId={setMovingFolderId} onDropFilesToFolder={onDropFilesToFolder} createFolder={store.createFolder} deleteFolder={store.deleteFolder} />
        <TagSection flatTree={store.flattenedTags} selectedTag={selectedTag} expandedTagPaths={store.expandedTagPaths} allTagsExpanded={expansion.allTagsExpanded} toggleAllTags={expansion.toggleAllTags} handleCreateNewTag={handleCreateNewTag} toggleTagExpanded={store.toggleTagExpanded} onSelectTag={onSelectTag} patchTag={store.patchTag} deleteTag={store.deleteTag} />
      </div>
      {stats && <StatsFooter stats={stats} />}
      {movingFolderId && (
        <MoveFolderPicker folderId={movingFolderId} folders={store.folders} patchFolder={store.patchFolder} onClose={() => setMovingFolderId(null)} />
      )}
    </div>
  )
}

function CategoryList({ selectedCategory, selectedFolderId, selectedTag, onSelectCategory }: {
  selectedCategory: AttachmentCategory
  selectedFolderId: string | null
  selectedTag: string | null
  onSelectCategory: (cat: AttachmentCategory) => void
}) {
  return (
    <div>
      <SectionLabel>{t('attachments.categories')}</SectionLabel>
      <div className="space-y-0.5">
        {categoryList().map((cat) => {
          const active = selectedCategory === cat.id && !selectedFolderId && !selectedTag
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => onSelectCategory(cat.id)}
              className={cn(
                'flex h-7.5 w-full items-center gap-2 rounded-[var(--r-md)] px-2 text-left font-medium transition-colors',
                active ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
              )}
            >
              <span className={cn('shrink-0', active ? 'text-[var(--accent)]' : 'text-[var(--text-tertiary)]')}>
                {cat.icon}
              </span>
              <span className="truncate flex-1">{cat.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function SectionHeader({ title, expandLabel, isExpanded, onToggleAll, addLabel, onAdd }: {
  title: string
  expandLabel: string
  isExpanded: boolean
  onToggleAll: () => void
  addLabel: string
  onAdd: () => void
}) {
  return (
    <div className="group/head flex items-center justify-between px-2 pb-1">
      <SectionLabel>{title}</SectionLabel>
      <div className="flex items-center gap-0.5">
        <Tooltip label={expandLabel} side="left">
          <IconButton label={expandLabel} size="sm" onClick={onToggleAll}>
            {isExpanded ? <ChevronsDownUp size={13} /> : <ChevronsUpDown size={13} />}
          </IconButton>
        </Tooltip>
        <Tooltip label={addLabel} side="right">
          <IconButton label={addLabel} size="sm" onClick={onAdd}>
            <Plus size={13} />
          </IconButton>
        </Tooltip>
      </div>
    </div>
  )
}

function FolderSection({ tree, selectedFolderId, renamingFolderId, expandedFolders, allFoldersExpanded, toggleAllFolders, handleCreateRootFolder, toggleFolderExpanded, setRenamingFolderId, patchFolder, onSelectFolder, setMovingFolderId, onDropFilesToFolder, createFolder, deleteFolder }: {
  tree: FolderNode[]
  selectedFolderId: string | null
  renamingFolderId: string | null
  expandedFolders: string[]
  allFoldersExpanded: boolean
  toggleAllFolders: () => void
  handleCreateRootFolder: () => Promise<void>
  toggleFolderExpanded: (id: string) => void
  setRenamingFolderId: (id: string | null) => void
  patchFolder: (id: string, patch: Partial<Folder>) => Promise<void>
  onSelectFolder: (folderId: string | null) => void
  setMovingFolderId: (id: string | null) => void
  onDropFilesToFolder: (fileIds: string[], targetFolderId: string | null) => Promise<void>
  createFolder: (name?: string, parentId?: string | null) => Promise<unknown>
  deleteFolder: (id: string) => Promise<void>
}) {
  return (
    <div>
      <SectionHeader title={t('navigation.folder')} expandLabel={allFoldersExpanded ? t('folders.collapse_all') : t('folders.expand_all')} isExpanded={allFoldersExpanded} onToggleAll={toggleAllFolders} addLabel={t('common.new_folder')} onAdd={() => void handleCreateRootFolder()} />
      <div className="space-y-px">
        {tree.map((node) => (
          <DriveFolderRow
            key={node.id}
            node={node}
            selectedFolderId={selectedFolderId}
            renamingFolderId={renamingFolderId}
            expandedFolders={expandedFolders}
            onToggleExpand={toggleFolderExpanded}
            onStartRename={setRenamingFolderId}
            onFinishRename={(id, name) => {
              void patchFolder(id, { name })
              setRenamingFolderId(null)
            }}
            onSelectFolder={onSelectFolder}
            onChooseParent={setMovingFolderId}
            onDropFilesToFolder={onDropFilesToFolder}
            createFolder={createFolder}
            patchFolder={patchFolder}
            deleteFolder={deleteFolder}
          />
        ))}
        {tree.length === 0 && (
          <div className="px-2 py-1.5 text-xs text-[var(--text-tertiary)] italic">
            {t('folders.no_folders')}
          </div>
        )}
      </div>
    </div>
  )
}

function TagSection({ flatTree, selectedTag, expandedTagPaths, allTagsExpanded, toggleAllTags, handleCreateNewTag, toggleTagExpanded, onSelectTag, patchTag, deleteTag }: {
  flatTree: TagTreeNode[]
  selectedTag: string | null
  expandedTagPaths: Set<string>
  allTagsExpanded: boolean
  toggleAllTags: () => void
  handleCreateNewTag: () => Promise<void>
  toggleTagExpanded: (fullPath: string) => void
  onSelectTag: (tag: string | null) => void
  patchTag: (id: string, patch: Partial<Tag>) => Promise<void>
  deleteTag: (id: string) => Promise<void>
}) {
  return (
    <div>
      <SectionHeader title={t('navigation.tag')} expandLabel={allTagsExpanded ? t('folders.collapse_all') : t('folders.expand_all')} isExpanded={allTagsExpanded} onToggleAll={toggleAllTags} addLabel={t('tags.new')} onAdd={() => void handleCreateNewTag()} />
      <div className="space-y-px">
        {flatTree.map((node) => (
          <DriveTagRow
            key={node.fullPath}
            node={node}
            selectedTag={selectedTag}
            expandedTagPaths={expandedTagPaths}
            onToggleExpand={() => toggleTagExpanded(node.fullPath)}
            onSelectTag={onSelectTag}
            patchTag={patchTag}
            deleteTag={deleteTag}
          />
        ))}
        {flatTree.length === 0 && (
          <div className="px-2 py-1.5 text-xs text-[var(--text-tertiary)] italic">
            {t('tags.no_match')}
          </div>
        )}
      </div>
    </div>
  )
}

function StatsFooter({ stats }: { stats: AttachmentStats }) {
  const totalQuota = stats.totalQuotaBytes || DEFAULT_QUOTA_BYTES
  const usedRatio = Math.min(1, Math.max(0, (stats.totalBytes ?? 0) / totalQuota))
  const usedWidthPct = (usedRatio * 100).toFixed(2)

  return (
    <div className="mt-auto shrink-0 border-t border-[var(--border-subtle)] p-3 bg-[var(--bg-sunken)]/40 text-[length:var(--text-11)] space-y-1.5">
      <div className="flex items-center justify-between font-semibold text-[var(--text-secondary)]">
        <span>{t('attachments.stats_title')}</span>
        <span className="font-mono text-[length:var(--text-10\\.5)]">
          {`${formatFileSize(stats.totalBytes)} / 10 GB`}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--border-subtle)]">
        <div
          style={{ width: `${Math.max(stats.totalBytes > 0 ? 1 : 0, Number(usedWidthPct))}%` }}
          className="h-full bg-[var(--accent)] rounded-full transition-all duration-[var(--dur-slow)]"
        />
      </div>
      <div className="text-[length:var(--text-10)] text-[var(--text-quaternary)] flex justify-between">
        <span>{t('attachments.total_value0', { value0: stats.totalCount })}</span>
        <span>{t('attachments.unreferenced_count_value0', { value0: stats.unreferencedCount })}</span>
      </div>
    </div>
  )
}

function MoveFolderPicker({ folderId, folders, patchFolder, onClose }: {
  folderId: string
  folders: AttachmentFolder[]
  patchFolder: (id: string, patch: Partial<Folder>) => Promise<void>
  onClose: () => void
}) {
  return (
    <FolderPicker
      open
      title={t('folders.move_to')}
      folders={folders.map((f) => ({
        id: f.id,
        parentId: f.parentId,
        name: f.name,
        icon: f.icon ?? null,
        color: f.color ?? null,
        position: f.position ?? 0,
        createdAt: f.createdAt,
        updatedAt: f.updatedAt,
      }))}
      currentId={folderId}
      onSelect={(parentId) => {
        void patchFolder(folderId, { parentId })
        onClose()
      }}
      onClose={onClose}
    />
  )
}
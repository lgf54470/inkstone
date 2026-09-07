import type { ReactNode } from 'react'
import { ChevronDown, ChevronRight, ExternalLink, Plus, Settings } from 'lucide-react'
import type { BlogStats } from '@shared/types'
import { cn } from '../../../lib/cn'
import { t } from '../../../lib/i18n'
import { IconButton } from '../../../components/primitives'
import { Tooltip } from '../../../components/overlay'
import { HubTagItem } from '../../../components/hub-tag-item'
import type { TagTreeNode } from '../../../lib/tag-tree'
import {
  batchToggleTag, deleteTagFlow, finishTagRename,
  renderFolderNodes, tagColorChange, toggleTagExpand,
  useBlogHubSidebar,
  type SidebarNavItem, type TagRowCtx,
} from './use-blog-hub-sidebar'

export function BlogHubSidebar({
  onOpenCategoriesModal,
  onOpenSettingsModal,
}: {
  onOpenCategoriesModal: () => void
  onOpenSettingsModal: () => void
}) {
  const {
    stats, folders, frontendBase,
    handleCreateNewTag, handleCreateRootFolder, navItems,
    isFoldersSectionOpen, setIsFoldersSectionOpen,
    isTagsSectionOpen, setIsTagsSectionOpen,
    folderTree, flattenedTagNodes, folderRowCtx, tagRowCtx,
  } = useBlogHubSidebar()

  return (
    <aside className='flex w-60 shrink-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-sunken)] select-none'>
      <div className='flex-1 overflow-y-auto px-2 py-3 space-y-4'>
        <SidebarNav items={navItems} />

        <FolderSection
          open={isFoldersSectionOpen}
          onToggle={() => setIsFoldersSectionOpen(!isFoldersSectionOpen)}
          onCreate={() => void handleCreateRootFolder()}
          hasItems={folders.length > 0}
          renderNodes={() => renderFolderNodes(folderTree, folderRowCtx)}
        />

        <TagSection
          open={isTagsSectionOpen}
          onToggle={() => setIsTagsSectionOpen(!isTagsSectionOpen)}
          onCreate={() => void handleCreateNewTag()}
          nodes={flattenedTagNodes}
          rowCtx={tagRowCtx}
        />
      </div>

      <SidebarFooter
        stats={stats}
        frontendBase={frontendBase}
        onOpenCategoriesModal={onOpenCategoriesModal}
        onOpenSettingsModal={onOpenSettingsModal}
      />
    </aside>
  )
}

function SidebarNav({ items }: { items: SidebarNavItem[] }) {
  return (
    <div className='space-y-0.5'>
      {items.map((item) => (
        <button
          key={item.id}
          type='button'
          onClick={item.onClick}
          className={cn(
            'group flex w-full h-8 items-center justify-between rounded-[var(--r-md)] px-2.5 text-[length:var(--text-12)] font-medium transition-colors text-left',
            item.active
              ? 'bg-[var(--accent-subtle)] text-[var(--accent)] font-semibold'
              : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
          )}
        >
          <div className='flex items-center gap-2 truncate'>
            {item.icon}
            <span className='truncate'>{item.label}</span>
          </div>
          {item.count !== undefined && (
            <span
              className={cn(
                'tabular text-[length:var(--text-10)] px-1.5 py-0.5 rounded-full shrink-0',
                item.badgeTone === 'danger'
                  ? 'bg-[var(--danger)] text-white font-bold animate-pulse'
                  : item.active
                    ? 'bg-[var(--accent)]/15 text-[var(--accent)] font-medium'
                    : 'text-[var(--text-quaternary)]',
              )}
            >
              {item.count}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

function FolderSection({
  open,
  onToggle,
  onCreate,
  hasItems,
  renderNodes,
}: {
  open: boolean
  onToggle: () => void
  onCreate: () => void
  hasItems: boolean
  renderNodes: () => ReactNode
}) {
  return (
    <div className='pt-1'>
      <div className='group/head flex items-center justify-between px-2 pb-1'>
        <button
          type='button'
          onClick={onToggle}
          className='flex items-center gap-1 text-[length:var(--text-11)] font-semibold text-[var(--text-quaternary)] hover:text-[var(--text-secondary)]'
        >
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <span>{t('blog.folders')}</span>
        </button>
        <Tooltip label={t('folders.create_new')} side='left'>
          <IconButton
            label={t('folders.create_new')}
            size='sm'
            onClick={onCreate}
            className='opacity-0 group-hover/head:opacity-100 transition-opacity'
          >
            <Plus size={13} />
          </IconButton>
        </Tooltip>
      </div>

      {open && (
        <div className='space-y-0.5 pt-0.5'>
          {!hasItems ? (
            <p className='px-2.5 py-1 text-[length:var(--text-11)] text-[var(--text-quaternary)]'>
              {t('blog.no_folders')}
            </p>
          ) : (
            renderNodes()
          )}
        </div>
      )}
    </div>
  )
}

function TagSection({
  open,
  onToggle,
  onCreate,
  nodes,
  rowCtx,
}: {
  open: boolean
  onToggle: () => void
  onCreate: () => void
  nodes: TagTreeNode[]
  rowCtx: TagRowCtx
}) {
  return (
    <div className='pt-1'>
      <div className='group/head flex items-center justify-between px-2 pb-1'>
        <button
          type='button'
          onClick={onToggle}
          className='flex items-center gap-1 text-[length:var(--text-11)] font-semibold text-[var(--text-quaternary)] hover:text-[var(--text-secondary)]'
        >
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <span>{t('blog.tags')}</span>
        </button>
        <Tooltip label={t('tags.new')} side='left'>
          <IconButton
            label={t('tags.new')}
            size='sm'
            onClick={onCreate}
            className='opacity-0 group-hover/head:opacity-100 transition-opacity'
          >
            <Plus size={13} />
          </IconButton>
        </Tooltip>
      </div>

      {open && (
        <div className='space-y-0.5 pt-0.5'>
          {nodes.length === 0 ? (
            <p className='px-2.5 py-1 text-[length:var(--text-11)] text-[var(--text-quaternary)]'>
              {t('blog.no_tags')}
            </p>
          ) : (
            nodes.map((node) => <TagRow key={node.fullPath} node={node} ctx={rowCtx} />)
          )}
        </div>
      )}
    </div>
  )
}

function TagRow({ node, ctx }: { node: TagTreeNode; ctx: TagRowCtx }) {
  const isSelected = ctx.activeTab === 'posts' && (ctx.selectedTag === node.fullPath || ctx.selectedTag === node.name)
  const counts = ctx.getTagNodeCounts(node)
  const isRenaming = ctx.renamingTagId === node.tag.id
  const hasChildren = node.children.length > 0
  const isExpanded = ctx.expandedTagPaths.has(node.fullPath)
  const labels = {
    rename: t('sidebar.rename'),
    color: t('tags.color'),
    enable: t('blog.tag_batch_enabled_toast'),
    disable: t('blog.tag_batch_disabled_toast'),
    toggleLabel: t('blog.batch_toggle_label'),
    emptyHint: t('blog.folder_empty_hint'),
  }

  return (
    <HubTagItem
      key={node.fullPath}
      tag={{
        id: node.tag.id,
        name: node.fullPath,
        color: node.tag.color,
        isPinned: node.isPinned,
        createdAt: node.tag.createdAt,
      }}
      displayName={node.name}
      depth={node.depth}
      hasChildren={hasChildren}
      isExpanded={isExpanded}
      onToggleExpand={() => toggleTagExpand(node.fullPath, ctx.setExpandedTagPaths)}
      isSelected={isSelected}
      counts={{ total: counts.total, enabled: counts.published }}
      isRenaming={isRenaming}
      batchBusy={ctx.batchBusy}
      labels={labels}
      onSelect={() => ctx.setTag(node.fullPath)}
      onBatchToggle={(enabled) => batchToggleTag(node, enabled, ctx.batchToggleGroup, ctx.toast)}
      onStartRename={() => ctx.setRenamingTagId(node.tag.id)}
      onFinishRename={(nextName) => finishTagRename(node, nextName, ctx.tags, ctx.patchTag, ctx.setRenamingTagId)}
      onColorChange={(color) => tagColorChange(node, color, ctx.tags, ctx.patchTag)}
      onDelete={() => deleteTagFlow(node, ctx.tags, ctx.deleteTag)}
    />
  )
}

function SidebarFooter({
  stats,
  frontendBase,
  onOpenCategoriesModal,
  onOpenSettingsModal,
}: {
  stats: BlogStats | null
  frontendBase: string
  onOpenCategoriesModal: () => void
  onOpenSettingsModal: () => void
}) {
  return (
    <div className='border-t border-[var(--border-subtle)] bg-[var(--bg-base)] p-3 space-y-2'>
      <div className='flex items-center gap-1.5'>
        <button
          type='button'
          onClick={onOpenCategoriesModal}
          className='flex-1 flex items-center justify-center gap-1 rounded-[var(--r-md)] px-2 py-1.5 text-[length:var(--text-11)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors border border-[var(--border-subtle)]'
        >
          <span>{t('blog.categories')}</span>
        </button>
        <button
          type='button'
          onClick={onOpenSettingsModal}
          className='flex items-center justify-center rounded-[var(--r-md)] p-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors border border-[var(--border-subtle)]'
          title={t('blog.settings')}
        >
          <Settings size={14} />
        </button>
        <a
          href={frontendBase}
          target='_blank'
          rel='noopener noreferrer'
          className='flex items-center justify-center rounded-[var(--r-md)] p-1.5 text-[var(--accent)] hover:bg-[var(--accent-subtle)] transition-colors border border-[var(--border-subtle)]'
          title={t('blog.frontend_site')}
        >
          <ExternalLink size={14} />
        </a>
      </div>

      <div className='space-y-1 pt-1.5 border-t border-[var(--border-subtle)]/60 text-[length:var(--text-11)] text-[var(--text-tertiary)]'>
        <FooterStat label={t('blog.total_posts_count')} value={stats?.totalPosts ?? 0} />
        <FooterStat label={t('blog.total_published_count')} value={stats?.publishedPosts ?? 0} success />
        <FooterStat label={t('blog.total_pv_views')} value={stats?.totalViews ?? 0} />
        <FooterStat label={t('blog.col_comments')} value={stats?.totalComments ?? 0} />
      </div>
    </div>
  )
}

function FooterStat({ label, value, success }: { label: string; value: number; success?: boolean }) {
  return (
    <div className='flex items-center justify-between'>
      <span>{label}</span>
      <span className={cn('font-semibold', success ? 'text-[var(--success)]' : 'text-[var(--text-primary)]')}>
        {value}
      </span>
    </div>
  )
}
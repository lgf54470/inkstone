import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Plus,
  Settings,
} from 'lucide-react';
import { cn } from '../../../lib/cn';
import { t } from '../../../lib/i18n';
import { IconButton } from '../../../components/primitives';
import { Tooltip, confirm } from '../../../components/overlay';
import { HubTagItem } from '../../../components/hub-tag-item';
import { useBlogHubSidebar } from './use-blog-hub-sidebar';

export function BlogHubSidebar({
  onOpenCategoriesModal,
  onOpenSettingsModal,
}: {
  onOpenCategoriesModal: () => void
  onOpenSettingsModal: () => void
}) {
  const {
    activeTab,
    toast,
    setTag,
    selectedTag,
    stats,
    batchBusy,
    batchToggleGroup,
    deleteTag,
    patchTag,
    tags,
    folderTree,
    flattenedTagNodes,
    getTagNodeCounts,
    folders,
    frontendBase,
    handleCreateNewTag,
    handleCreateRootFolder,
    navItems,
    isFoldersSectionOpen,
    setIsFoldersSectionOpen,
    isTagsSectionOpen,
    setIsTagsSectionOpen,
    expandedTagPaths,
    renamingTagId,
    renderFolderNodes,
    setExpandedTagPaths,
    setRenamingTagId,
  } = useBlogHubSidebar();

  return (
    <aside className="flex w-[240px] shrink-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-sunken)] select-none">
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        <div className="space-y-0.5">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={item.onClick}
              className={cn(
                'group flex w-full h-8 items-center justify-between rounded-[var(--r-md)] px-2.5 text-[length:var(--text-12)] font-medium transition-colors text-left',
                item.active
                  ? 'bg-[var(--accent-subtle)] text-[var(--accent)] font-semibold'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
              )}
            >
              <div className="flex items-center gap-2 truncate">
                {item.icon}
                <span className="truncate">{item.label}</span>
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

        <div className="pt-1">
          <div className="group/head flex items-center justify-between px-2 pb-1">
            <button
              type="button"
              onClick={() => setIsFoldersSectionOpen(!isFoldersSectionOpen)}
              className="flex items-center gap-1 text-[length:var(--text-11)] font-semibold text-[var(--text-quaternary)] hover:text-[var(--text-secondary)]"
            >
              {isFoldersSectionOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <span>{t('blog.folders')}</span>
            </button>
            <Tooltip label={t('folders.create_new')} side="left">
              <IconButton
                label={t('folders.create_new')}
                size="sm"
                onClick={() => void handleCreateRootFolder()}
                className="opacity-0 group-hover/head:opacity-100 transition-opacity"
              >
                <Plus size={13} />
              </IconButton>
            </Tooltip>
          </div>

          {isFoldersSectionOpen && (
            <div className="space-y-0.5 pt-0.5">
              {folders.length === 0 ? (
                <p className="px-2.5 py-1 text-[length:var(--text-11)] text-[var(--text-quaternary)]">
                  {t('blog.no_folders')}
                </p>
              ) : (
                renderFolderNodes(folderTree)
              )}
            </div>
          )}
        </div>

        <div className="pt-1">
          <div className="group/head flex items-center justify-between px-2 pb-1">
            <button
              type="button"
              onClick={() => setIsTagsSectionOpen(!isTagsSectionOpen)}
              className="flex items-center gap-1 text-[length:var(--text-11)] font-semibold text-[var(--text-quaternary)] hover:text-[var(--text-secondary)]"
            >
              {isTagsSectionOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <span>{t('blog.tags')}</span>
            </button>
            <Tooltip label={t('tags.new')} side="left">
              <IconButton
                label={t('tags.new')}
                size="sm"
                onClick={() => void handleCreateNewTag()}
                className="opacity-0 group-hover/head:opacity-100 transition-opacity"
              >
                <Plus size={13} />
              </IconButton>
            </Tooltip>
          </div>

          {isTagsSectionOpen && (
            <div className="space-y-0.5 pt-0.5">
              {flattenedTagNodes.length === 0 ? (
                <p className="px-2.5 py-1 text-[length:var(--text-11)] text-[var(--text-quaternary)]">
                  {t('blog.no_tags')}
                </p>
              ) : (
                flattenedTagNodes.map((node) => {
                  const isSelected =
                    activeTab === 'posts' &&
                    (selectedTag === node.fullPath || selectedTag === node.name)
                  const counts = getTagNodeCounts(node)
                  const isRenaming = renamingTagId === node.tag.id
                  const hasChildren = node.children.length > 0
                  const isExpanded = expandedTagPaths.has(node.fullPath)

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
                      onToggleExpand={() => {
                        setExpandedTagPaths((prev) => {
                          const next = new Set(prev)
                          if (next.has(node.fullPath)) next.delete(node.fullPath)
                          else next.add(node.fullPath)
                          return next
                        })
                      }}
                      isSelected={isSelected}
                      counts={{ total: counts.total, enabled: counts.published }}
                      isRenaming={isRenaming}
                      batchBusy={batchBusy}
                      labels={{
                        rename: t('sidebar.rename'),
                        color: t('tags.color'),
                        enable: t('blog.tag_batch_enabled_toast'),
                        disable: t('blog.tag_batch_disabled_toast'),
                        toggleLabel: t('blog.batch_toggle_label'),
                        emptyHint: t('blog.folder_empty_hint'),
                      }}
                      onSelect={() => setTag(node.fullPath)}
                      onBatchToggle={async (enabled) => {
                        const ok = await batchToggleGroup('tag', node.fullPath, enabled)
                        if (ok) {
                          toast({
                            title: enabled
                              ? t('blog.tag_batch_enabled_toast')
                              : t('blog.tag_batch_disabled_toast'),
                            tone: 'success',
                          })
                        }
                      }}
                      onStartRename={() => setRenamingTagId(node.tag.id)}
                      onFinishRename={(nextName) => {
                        setRenamingTagId(null)
                        if (nextName && nextName !== node.name) {
                          const segments = node.fullPath.split('/')
                          segments[segments.length - 1] = nextName
                          const nextFullPath = segments.join('/')
                          const realTag = tags.find((t) => t.id === node.tag.id || t.name === node.fullPath)
                          if (realTag) {
                            void patchTag(realTag.id, { name: nextFullPath })
                          }
                        }
                      }}
                      onColorChange={(color) => {
                        const realTag = tags.find((t) => t.id === node.tag.id || t.name === node.fullPath)
                        if (realTag) {
                          void patchTag(realTag.id, { color })
                        }
                      }}
                      onDelete={async () => {
                        const ok = await confirm({
                          title: t('tags.delete'),
                          description: t('tags.delete_confirm_value0', { value0: node.name }),
                          confirmLabel: t('common.delete'),
                          tone: 'danger',
                        })
                        if (ok) {
                          const realTag = tags.find((t) => t.id === node.tag.id || t.name === node.fullPath)
                          if (realTag) {
                            void deleteTag(realTag.id)
                          }
                        }
                      }}
                    />
                  )
                })
              )}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-base)] p-3 space-y-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onOpenCategoriesModal}
            className="flex-1 flex items-center justify-center gap-1 rounded-[var(--r-md)] px-2 py-1.5 text-[length:var(--text-11)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors border border-[var(--border-subtle)]"
          >
            <span>{t('blog.categories')}</span>
          </button>
          <button
            type="button"
            onClick={onOpenSettingsModal}
            className="flex items-center justify-center rounded-[var(--r-md)] p-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors border border-[var(--border-subtle)]"
            title={t('blog.settings')}
          >
            <Settings size={14} />
          </button>
          <a
            href={frontendBase}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center rounded-[var(--r-md)] p-1.5 text-[var(--accent)] hover:bg-[var(--accent-subtle)] transition-colors border border-[var(--border-subtle)]"
            title={t('blog.frontend_site')}
          >
            <ExternalLink size={14} />
          </a>
        </div>

        <div className="space-y-1 pt-1.5 border-t border-[var(--border-subtle)]/60 text-[length:var(--text-11)] text-[var(--text-tertiary)]">
          <div className="flex items-center justify-between">
            <span>{t('blog.total_posts_count')}</span>
            <span className="font-semibold text-[var(--text-primary)]">
              {stats?.totalPosts ?? 0}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>{t('blog.total_published_count')}</span>
            <span className="font-semibold text-[var(--success)]">
              {stats?.publishedPosts ?? 0}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>{t('blog.total_pv_views')}</span>
            <span className="font-semibold text-[var(--text-primary)]">
              {stats?.totalViews ?? 0}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>{t('blog.col_comments')}</span>
            <span className="font-semibold text-[var(--text-primary)]">
              {stats?.totalComments ?? 0}
            </span>
          </div>
        </div>
      </div>
    </aside>
  )
}

import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { t } from '../../lib/i18n';
import { IconButton } from '../../components/primitives';
import { Tooltip } from '../../components/overlay';
import type { ShareHubSidebarBundle } from './use-share-hub-sidebar';
import { useShareHubSidebar } from './use-share-hub-sidebar';

export function ShareHubSidebar() {
  const bundle = useShareHubSidebar()
  return (
    <aside className='flex h-full w-65 shrink-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-sidebar)]'>
      <div className='flex-1 overflow-y-auto px-2 py-3'>
        <CategoryList bundle={bundle} />
        <div className='my-3 h-px bg-[var(--border-subtle)]' />
        <SidebarSection
          isOpen={bundle.isFoldersSectionOpen}
          onToggle={() => bundle.setIsFoldersSectionOpen(!bundle.isFoldersSectionOpen)}
          title={t('navigation.folder')}
          addLabel={t('folders.create_new')}
          onAdd={() => void bundle.handleCreateRootFolder()}
        >
          {bundle.isFoldersSectionOpen && (
            <div className='space-y-0.5 pt-0.5'>
              {bundle.folderTree.length === 0 ? <p className='px-2.5 py-1 text-[length:var(--text-11)] text-[var(--text-quaternary)]'>{t('share.no_folders')}</p> : bundle.folderTree.map(bundle.renderFolderNode)}
            </div>
          )}
        </SidebarSection>
        <div className='my-3 h-px bg-[var(--border-subtle)]' />
        <SidebarSection
          isOpen={bundle.isTagsSectionOpen}
          onToggle={() => bundle.setIsTagsSectionOpen(!bundle.isTagsSectionOpen)}
          title={t('navigation.tag')}
          addLabel={t('tags.new')}
          onAdd={() => void bundle.handleCreateNewTag()}
        >
          {bundle.isTagsSectionOpen && (
            <div className='space-y-0.5 pt-0.5'>
              {bundle.tags.length === 0 ? <p className='px-2.5 py-1 text-[length:var(--text-11)] text-[var(--text-quaternary)]'>{t('share.no_tags')}</p> : bundle.tags.map(bundle.renderTagNode)}
            </div>
          )}
        </SidebarSection>
      </div>
      <SidebarFooterStats globalStats={bundle.globalStats} />
    </aside>
  )
}

function CategoryList({ bundle }: { bundle: ShareHubSidebarBundle }) {
  const { categories, category, selectedFolderId, selectedTag, setCategory } = bundle
  return (
    <div className='space-y-0.5'>
      {categories.map((cat) => {
        const isSelected = category === cat.id && !selectedFolderId && !selectedTag
        return (
          <button
            key={cat.id}
            type='button'
            onClick={() => setCategory(cat.id)}
            className={cn(
              'flex h-8 w-full items-center gap-2 rounded-[var(--r-md)] px-2.5 text-[length:var(--text-12)] font-medium transition-colors',
              isSelected
                ? 'bg-[var(--accent-subtle)] text-[var(--accent)] font-semibold'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
            )}
          >
            {cat.icon}
            <span className='flex-1 text-left'>{cat.label}</span>
            {cat.count !== undefined && cat.count > 0 && (
              <span className='tabular rounded bg-[var(--bg-card)] px-1.5 py-0.5 text-[length:var(--text-10)] font-medium text-[var(--text-tertiary)] shadow-[var(--shadow-sm)]'>
                {cat.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

function SidebarSection({ isOpen, onToggle, title, addLabel, onAdd, children }: {
  isOpen: boolean
  onToggle: () => void
  title: string
  addLabel: string
  onAdd: () => void
  children: ReactNode
}) {
  return (
    <>
      <div className='group/head mb-1 flex items-center justify-between px-2'>
        <button
          type='button'
          onClick={onToggle}
          className='flex items-center gap-1 text-[length:var(--text-11)] font-semibold text-[var(--text-quaternary)] hover:text-[var(--text-secondary)]'
        >
          {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <span>{title}</span>
        </button>
        <Tooltip label={addLabel} side='left'>
          <IconButton
            label={addLabel}
            size='sm'
            onClick={onAdd}
            className='opacity-0 group-hover/head:opacity-100 transition-opacity'
          >
            <Plus size={13} />
          </IconButton>
        </Tooltip>
      </div>
      {children}
    </>
  )
}

function SidebarFooterStats({ globalStats }: {
  globalStats: ShareHubSidebarBundle['globalStats']
}) {
  return (
    <div className='border-t border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 py-2.5'>
      <div className='flex items-center justify-between text-[length:var(--text-11)] text-[var(--text-tertiary)]'>
        <span>{t('share.total_shares_count')}</span>
        <span className='font-semibold text-[var(--text-primary)]'>
          {globalStats?.totalShares ?? 0}
        </span>
      </div>
      <div className='flex items-center justify-between pt-1 text-[length:var(--text-11)] text-[var(--text-tertiary)]'>
        <span>{t('share.total_pv_views')}</span>
        <span className='font-semibold text-[var(--text-primary)]'>
          {globalStats?.totalViews ?? 0}
        </span>
      </div>
      <div className='flex items-center justify-between pt-1 text-[length:var(--text-11)] text-[var(--text-tertiary)]'>
        <span>{t('share.total_uv_visitors')}</span>
        <span className='font-semibold text-[var(--text-primary)]'>
          {globalStats?.totalVisitors ?? 0}
        </span>
      </div>
    </div>
  )
}
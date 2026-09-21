import { ChevronDown, ChevronRight, Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import { Button, IconButton } from '../../components/primitives'
import { Tooltip } from '../../components/overlay'
import { countBadgeTone } from '../../components/count-badge'
import type { ShareHubSidebarBundle } from './use-share-hub-sidebar'
import { useShareHubSidebar } from './use-share-hub-sidebar'

export function ShareHubSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const bundle = useShareHubSidebar(onNavigate)
  return (
    <aside className='flex h-full w-65 shrink-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-sunken)]'>
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
  const { categories, category, selectedFolderId, selectedTag, selectCategory } = bundle
  return (
    <div className='space-y-0.5'>
      {categories.map((cat) => {
        const isSelected = category === cat.id && !selectedFolderId && !selectedTag
        return (
          <Button
            key={cat.id}
            variant='ghost'
            block
            icon={cat.icon}
            onClick={() => selectCategory(cat.id)}
            trailing={cat.count !== undefined && cat.count > 0
              ? (
                // The shell's own badge rule (`countBadgeTone`): the selected row sits on the accent
                // tint, where the dimmest tier falls under AA, so a selected row takes the next tier
                // up. Painting an opaque plate here instead used to dodge the rule rather than meet it.
                <span className={cn('ml-auto rounded px-1.5 py-0.5 text-[length:var(--text-10)] font-medium', countBadgeTone(isSelected))}>
                  {cat.count}
                </span>
              )
              : undefined}
            className={cn(
              'h-8 justify-start gap-2 px-2.5 text-[length:var(--text-12)] font-medium',
              isSelected && 'bg-[var(--accent-soft)] font-semibold text-[var(--accent)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]',
            )}
          >
            {cat.label}
          </Button>
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
        <Button
          variant='ghost'
          size='sm'
          icon={isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          onClick={onToggle}
          className='h-auto gap-1 px-0 text-[length:var(--text-11)] font-semibold text-[var(--text-quaternary)] hover:bg-transparent hover:text-[var(--text-secondary)]'
        >
          {title}
        </Button>
        <Tooltip label={addLabel} side='left'>
          {/* The only way to create a folder or a tag, so it may not be hidden until a pointer can
              hover: it is drawn on every screen without hover (below `md`), and on the wide layout it
              appears for the pointer and for the keyboard alike. */}
          <IconButton
            label={addLabel}
            size='sm'
            onClick={onAdd}
            className='opacity-100 transition-opacity md:opacity-0 md:group-hover/head:opacity-100 md:focus-visible:opacity-100'
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
import { CheckCircle2, Inbox } from 'lucide-react'
import { t } from '../../lib/i18n'
import { useCurrentLocale } from '../../lib/i18n/use-current-locale'
import { LinkCard } from './link-card'
import { LinkContextMenu } from './link-context-menu'
import { LinkQRModal } from './link-qr-modal'
import { LinksApplySection } from './links-apply-section'
import { LinksToolbar } from './links-toolbar'
import type { LinksContainerProps } from './types'
import { useLinksState } from './use-links-state'

export function LinksContainer(props: LinksContainerProps) {
  const locale = useCurrentLocale()
  const state = useLinksState(props.initialLinks, props.categories)
  const myInfo = buildMyInfo(props)
  const categoryMap = new Map(props.categories.map((c) => [c.id, c.name]))

  const isFav = Boolean(state.contextMenu.link && state.favorites.has(state.contextMenu.link.id))
  const isPin = Boolean(
    state.contextMenu.link &&
      (state.contextMenu.link.isPinned || state.pinnedIds.has(state.contextMenu.link.id)),
  )

  return (
    <div className='relative w-full max-w-6xl mx-auto px-4 py-6 space-y-6'>
      <LinksApplySection
        siteName={myInfo.name}
        siteUrl={myInfo.url}
        siteDescription={myInfo.desc}
        siteAvatar={myInfo.avatar}
        onToast={state.showToast}
      />

      <LinksToolbarSection state={state} categories={props.categories} />

      {state.filteredLinks.length === 0 ? (
        <EmptyLinksState message={t('links.no_links_found', {}, locale)} />
      ) : (
        <LinksGrid
          links={state.filteredLinks}
          categoryMap={categoryMap}
          viewMode={state.viewMode}
          favorites={state.favorites}
          pinnedIds={state.pinnedIds}
          onToggleFavorite={state.toggleFavorite}
          onContextMenu={state.openContextMenu}
          onVisit={state.handleVisitLink}
        />
      )}

      <LinksModals state={state} isFavorite={isFav} isPinned={isPin} />
    </div>
  )
}

function buildMyInfo(props: LinksContainerProps) {
  return {
    name: props.siteName,
    url: props.siteUrl || (typeof window !== 'undefined' ? window.location.origin : ''),
    desc: props.siteDescription || '',
    avatar: props.siteAvatar || '',
  }
}

function LinksToolbarSection({
  state,
  categories,
}: {
  state: ReturnType<typeof useLinksState>
  categories: LinksContainerProps['categories']
}) {
  return (
    <LinksToolbar
      categories={categories}
      activeCategory={state.activeCategory}
      onSelectCategory={state.setActiveCategory}
      activeSubCategory={state.activeSubCategory}
      onSelectSubCategory={state.setActiveSubCategory}
      searchQuery={state.searchQuery}
      onSearchChange={state.setSearchQuery}
      selectedEngines={state.selectedEngines}
      onToggleEngine={state.toggleEngine}
      onSearchSubmit={state.handleSearchSubmit}
      viewMode={state.viewMode}
      onViewModeChange={state.setViewMode}
      favCount={state.favorites.size}
      pinCount={state.pinnedIds.size}
    />
  )
}

function LinksModals({
  state,
  isFavorite,
  isPinned,
}: {
  state: ReturnType<typeof useLinksState>
  isFavorite: boolean
  isPinned: boolean
}) {
  return (
    <>
      <LinkContextMenu
        state={state.contextMenu}
        onClose={state.closeContextMenu}
        onOpenQr={state.openQrModal}
        onToggleFavorite={state.toggleFavorite}
        onTogglePin={state.togglePin}
        isFavorite={isFavorite}
        isPinned={isPinned}
        onShowToast={state.showToast}
        onVisit={state.handleVisitLink}
      />
      <LinkQRModal state={state.qrModal} onClose={state.closeQrModal} />
      {state.toastMessage && <LinksToast message={state.toastMessage} />}
    </>
  )
}

function LinksGrid({
  links,
  categoryMap,
  viewMode,
  favorites,
  pinnedIds,
  onToggleFavorite,
  onContextMenu,
  onVisit,
}: {
  links: LinksContainerProps['initialLinks']
  categoryMap: Map<string, string>
  viewMode: 'detailed' | 'simple'
  favorites: Set<string>
  pinnedIds: Set<string>
  onToggleFavorite: (id: string) => void
  onContextMenu: (link: LinksContainerProps['initialLinks'][number], x: number, y: number) => void
  onVisit: (link: LinksContainerProps['initialLinks'][number]) => void
}) {
  const gridClasses =
    viewMode === 'detailed'
      ? 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4'
      : 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5'

  return (
    <div className={gridClasses}>
      {links.map((link) => (
        <LinkCard
          key={link.id}
          link={link}
          categoryName={link.categoryId ? categoryMap.get(link.categoryId) : undefined}
          isFavorite={favorites.has(link.id)}
          isPinned={link.isPinned || pinnedIds.has(link.id)}
          viewMode={viewMode}
          onToggleFavorite={onToggleFavorite}
          onContextMenu={onContextMenu}
          onVisit={onVisit}
        />
      ))}
    </div>
  )
}

function EmptyLinksState({ message }: { message: string }) {
  return (
    <div className='flex flex-col items-center justify-center py-16 text-center rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface)]'>
      <div className='p-3 rounded-full bg-[var(--bg-sunken)] text-[var(--text-tertiary)] mb-3'>
        <Inbox className='size-8' />
      </div>
      <p className='text-xs text-[var(--text-tertiary)]'>{message}</p>
    </div>
  )
}

function LinksToast({ message }: { message: string }) {
  return (
    <div className='fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-2.5 shadow-xl text-xs font-medium text-[var(--text-primary)] animate-in fade-in slide-in-from-bottom-2 duration-200'>
      <CheckCircle2 className='size-4 text-emerald-500 shrink-0' />
      <span>{message}</span>
    </div>
  )
}

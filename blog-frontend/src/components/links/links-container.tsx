import { CheckCircle2 } from 'lucide-react'
import { t, useCurrentLocale, type BlogLocale } from '../../lib/i18n'
import { LinkApplyModal } from './link-apply-modal'
import { LinkContextMenu } from './link-context-menu'
import { LinkQRModal } from './link-qr-modal'
import { LinkSectionGroup } from './link-section-group'
import { LinksToolbar } from './links-toolbar'
import type { LinksContainerProps } from './types'
import { useLinksState } from './use-links-state'

export function LinksContainer(props: LinksContainerProps) {
  const locale = useCurrentLocale()
  const state = useLinksState(props.initialLinks, props.categories)
  const myInfo = buildMyInfo(props)

  const isFav = Boolean(state.contextMenu.link && state.favorites.has(state.contextMenu.link.id))
  const isPin = Boolean(
    state.contextMenu.link &&
      (state.contextMenu.link.isPinned || state.pinnedIds.has(state.contextMenu.link.id)),
  )

  return (
    <div className='relative w-full max-w-6xl mx-auto px-3 sm:px-4 py-3 sm:py-5 space-y-6'>
      <LinksContainerToolbar state={state} categories={props.categories} />
      <LinksContainerGroup state={state} categories={props.categories} locale={locale} />
      <LinksModals state={state} isFavorite={isFav} isPinned={isPin} myInfo={myInfo} />
    </div>
  )
}

function LinksContainerToolbar({
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
      gridColumns={state.gridColumns}
      onGridColumnsChange={state.setGridColumns}
      onOpenApplyModal={state.openApplyModal}
      favCount={state.favorites.size}
      pinCount={state.pinnedIds.size}
    />
  )
}

function LinksContainerGroup({
  state,
  categories,
  locale,
}: {
  state: ReturnType<typeof useLinksState>
  categories: LinksContainerProps['categories']
  locale: BlogLocale
}) {
  const handleCopyLink = (url: string) => {
    navigator.clipboard
      .writeText(url)
      .then(() => state.showToast(t('links.copied_toast', {}, locale)))
      .catch((error) => {
        void error
      })
  }

  return (
    <LinkSectionGroup
      links={state.filteredLinks}
      categories={categories}
      activeCategory={state.activeCategory}
      activeSubCategory={state.activeSubCategory}
      viewMode={state.viewMode}
      gridColumns={state.gridColumns}
      favorites={state.favorites}
      pinnedIds={state.pinnedIds}
      collapsedSections={state.collapsedSections}
      sectionSubCats={state.sectionSubCats}
      sortingSectionId={state.sortingSectionId}
      onToggleSectionSorting={state.toggleSectionSorting}
      onLinkDragStart={state.handleLinkDragStart}
      onLinkDragOver={state.handleLinkDragOver}
      onLinkDrop={state.handleLinkDrop}
      onLinkDragEnd={state.handleLinkDragEnd}
      onToggleCollapse={state.toggleSectionCollapse}
      onSelectSectionSubCat={state.setSectionSubCategory}
      onToggleFavorite={state.toggleFavorite}
      onContextMenu={state.openContextMenu}
      onOpenQr={state.openQrModal}
      onCopyLink={handleCopyLink}
      onVisit={state.handleVisitLink}
      emptyMessage={t('links.no_links_found', {}, locale)}
    />
  )
}

function buildMyInfo(props: LinksContainerProps) {
  return {
    name: props.siteName || 'Inkstone Blog',
    url: props.siteUrl || (typeof window !== 'undefined' ? window.location.origin : ''),
    desc: props.siteDescription || '',
    avatar: props.siteAvatar || '',
  }
}

interface MyInfo {
  name: string
  url: string
  desc: string
  avatar: string
}

function LinksModals({
  state,
  isFavorite,
  isPinned,
  myInfo,
}: {
  state: ReturnType<typeof useLinksState>
  isFavorite: boolean
  isPinned: boolean
  myInfo: MyInfo
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
      <LinkApplyModal
        isOpen={state.isApplyModalOpen}
        onClose={state.closeApplyModal}
        siteName={myInfo.name}
        siteUrl={myInfo.url}
        siteDescription={myInfo.desc}
        siteAvatar={myInfo.avatar}
        onToast={state.showToast}
      />
      {state.toastMessage && <LinksToast message={state.toastMessage} />}
    </>
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

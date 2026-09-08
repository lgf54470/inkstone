import { ChevronDown, ChevronRight, Inbox } from 'lucide-react'
import type { BlogPublicLink, BlogPublicLinkCategory } from '../../lib/types'
import { t, useCurrentLocale } from '../../lib/i18n'
import { LinkCard } from './link-card'
import type { GridColumns, ViewMode } from './types'

export interface LinkSectionGroupProps {
  links: BlogPublicLink[]
  categories: BlogPublicLinkCategory[]
  activeCategory: string
  activeSubCategory: string
  viewMode: ViewMode
  gridColumns: GridColumns
  favorites: Set<string>
  pinnedIds: Set<string>
  collapsedSections: Set<string>
  sectionSubCats: Record<string, string>
  onToggleCollapse: (sectionId: string) => void
  onSelectSectionSubCat: (parentId: string, subId: string) => void
  onToggleFavorite: (id: string) => void
  onContextMenu: (link: BlogPublicLink, x: number, y: number) => void
  onOpenQr?: (link: BlogPublicLink) => void
  onCopyLink?: (url: string) => void
  onVisit: (link: BlogPublicLink) => void
  emptyMessage: string
}

export function LinkSectionGroup(props: LinkSectionGroupProps) {
  const categoryMap = new Map(props.categories.map((c) => [c.id, c.name]))

  if (props.links.length === 0) {
    return <EmptyLinksState message={props.emptyMessage} />
  }

  if (props.activeCategory !== 'all') {
    return <FilteredCategoryGrid props={props} categoryMap={categoryMap} />
  }

  return <RootCategoriesSections props={props} categoryMap={categoryMap} />
}

function FilteredCategoryGrid({
  props,
  categoryMap,
}: {
  props: LinkSectionGroupProps
  categoryMap: Map<string, string>
}) {
  return (
    <div className={getGridClasses(props.viewMode, props.gridColumns)}>
      {props.links.map((link) => (
        <LinkCard
          key={link.id}
          link={link}
          categoryName={link.categoryId ? categoryMap.get(link.categoryId) : undefined}
          isFavorite={props.favorites.has(link.id)}
          isPinned={link.isPinned || props.pinnedIds.has(link.id)}
          viewMode={props.viewMode}
          onToggleFavorite={props.onToggleFavorite}
          onContextMenu={props.onContextMenu}
          onOpenQr={props.onOpenQr}
          onCopyLink={props.onCopyLink}
          onVisit={props.onVisit}
        />
      ))}
    </div>
  )
}

function RootCategoriesSections({
  props,
  categoryMap,
}: {
  props: LinkSectionGroupProps
  categoryMap: Map<string, string>
}) {
  const rootCategories = props.categories.filter((c) => !c.parentId)
  const childOf = (pid: string) => props.categories.filter((c) => c.parentId === pid)

  return (
    <div className='space-y-8'>
      {rootCategories.map((cat) => {
        const children = childOf(cat.id)
        const childIds = new Set(children.map((c) => c.id))
        const allCatLinks = props.links.filter(
          (l) => l.categoryId === cat.id || (l.categoryId && childIds.has(l.categoryId)),
        )
        if (allCatLinks.length === 0) return null

        const activeSub = props.sectionSubCats[cat.id] || ''
        const visibleLinks = activeSub ? allCatLinks.filter((l) => l.categoryId === activeSub) : allCatLinks
        const isCollapsed = props.collapsedSections.has(cat.id)

        return (
          <CategorySection
            key={cat.id}
            cat={cat}
            childrenCategories={children}
            allLinksCount={allCatLinks.length}
            visibleLinks={visibleLinks}
            activeSub={activeSub}
            isCollapsed={isCollapsed}
            categoryMap={categoryMap}
            props={props}
          />
        )
      })}

      <UncategorizedSection
        links={props.links.filter((l) => !l.categoryId)}
        categoryMap={categoryMap}
        props={props}
      />
    </div>
  )
}

function CategorySection({
  cat,
  childrenCategories,
  allLinksCount,
  visibleLinks,
  activeSub,
  isCollapsed,
  categoryMap,
  props,
}: {
  cat: BlogPublicLinkCategory
  childrenCategories: BlogPublicLinkCategory[]
  allLinksCount: number
  visibleLinks: BlogPublicLink[]
  activeSub: string
  isCollapsed: boolean
  categoryMap: Map<string, string>
  props: LinkSectionGroupProps
}) {
  return (
    <section className='space-y-3'>
      <CategorySectionHeader
        cat={cat}
        allLinksCount={allLinksCount}
        isCollapsed={isCollapsed}
        onToggleCollapse={() => props.onToggleCollapse(cat.id)}
      />
      {childrenCategories.length > 0 && !isCollapsed && (
        <CategorySubPills
          catId={cat.id}
          childrenCategories={childrenCategories}
          links={props.links}
          activeSub={activeSub}
          onSelectSub={props.onSelectSectionSubCat}
        />
      )}
      {!isCollapsed && (
        <CategoryLinksGrid links={visibleLinks} categoryMap={categoryMap} props={props} />
      )}
    </section>
  )
}

function CategoryLinksGrid({
  links,
  categoryMap,
  props,
}: {
  links: BlogPublicLink[]
  categoryMap: Map<string, string>
  props: LinkSectionGroupProps
}) {
  return (
    <div className={getGridClasses(props.viewMode, props.gridColumns)}>
      {links.map((link) => (
        <LinkCard
          key={link.id}
          link={link}
          categoryName={link.categoryId ? categoryMap.get(link.categoryId) : undefined}
          isFavorite={props.favorites.has(link.id)}
          isPinned={link.isPinned || props.pinnedIds.has(link.id)}
          viewMode={props.viewMode}
          onToggleFavorite={props.onToggleFavorite}
          onContextMenu={props.onContextMenu}
          onOpenQr={props.onOpenQr}
          onCopyLink={props.onCopyLink}
          onVisit={props.onVisit}
        />
      ))}
    </div>
  )
}


function CategorySectionHeader({
  cat,
  allLinksCount,
  isCollapsed,
  onToggleCollapse,
}: {
  cat: BlogPublicLinkCategory
  allLinksCount: number
  isCollapsed: boolean
  onToggleCollapse: () => void
}) {
  return (
    <button
      type='button'
      onClick={onToggleCollapse}
      className='group flex items-center gap-2 cursor-pointer text-left focus:outline-hidden'
    >
      {isCollapsed ? (
        <ChevronRight className='size-5 text-[var(--text-tertiary)] group-hover:text-[var(--text-primary)] transition-colors' />
      ) : (
        <ChevronDown className='size-5 text-[var(--text-tertiary)] group-hover:text-[var(--text-primary)] transition-colors' />
      )}
      <h3 className='text-base sm:text-lg font-bold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors'>
        {cat.name}
      </h3>
      <span className='rounded-full bg-[var(--bg-sunken)] px-2 py-0.5 text-xs text-[var(--text-tertiary)] font-normal'>
        {allLinksCount}
      </span>
    </button>
  )
}

function CategorySubPills({
  catId,
  childrenCategories,
  links,
  activeSub,
  onSelectSub,
}: {
  catId: string
  childrenCategories: BlogPublicLinkCategory[]
  links: BlogPublicLink[]
  activeSub: string
  onSelectSub: (parentId: string, subId: string) => void
}) {
  return (
    <div className='flex flex-wrap items-center gap-1.5'>
      {childrenCategories.map((sub) => {
        const count = links.filter((l) => l.categoryId === sub.id).length
        const isActive = activeSub === sub.id
        return (
          <button
            key={sub.id}
            type='button'
            onClick={() => onSelectSub(catId, sub.id)}
            className={`rounded-full px-3 py-0.5 text-xs font-medium transition-colors cursor-pointer border ${
              isActive
                ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:border-[var(--border-default)]'
            }`}
          >
            <span>{sub.name}</span>
            <span className='ml-1 opacity-70 text-xs'>{count}</span>
          </button>
        )
      })}
    </div>
  )
}

function UncategorizedSection({
  links,
  categoryMap,
  props,
}: {
  links: BlogPublicLink[]
  categoryMap: Map<string, string>
  props: LinkSectionGroupProps
}) {
  const locale = useCurrentLocale()
  if (links.length === 0) return null
  const isCollapsed = props.collapsedSections.has('uncategorized')

  return (
    <section className='space-y-3 pt-2'>
      <UncategorizedSectionHeader
        count={links.length}
        isCollapsed={isCollapsed}
        label={t('links.filter_uncategorized', {}, locale)}
        onToggle={() => props.onToggleCollapse('uncategorized')}
      />
      {!isCollapsed && (
        <CategoryLinksGrid links={links} categoryMap={categoryMap} props={props} />
      )}
    </section>
  )
}

function UncategorizedSectionHeader({
  count,
  isCollapsed,
  label,
  onToggle,
}: {
  count: number
  isCollapsed: boolean
  label: string
  onToggle: () => void
}) {
  return (
    <button
      type='button'
      onClick={onToggle}
      className='group flex items-center gap-2 cursor-pointer text-left focus:outline-hidden'
    >
      {isCollapsed ? (
        <ChevronRight className='size-5 text-[var(--text-tertiary)] group-hover:text-[var(--text-primary)] transition-colors' />
      ) : (
        <ChevronDown className='size-5 text-[var(--text-tertiary)] group-hover:text-[var(--text-primary)] transition-colors' />
      )}
      <h3 className='text-base sm:text-lg font-bold text-[var(--text-primary)]'>{label}</h3>
      <span className='rounded-full bg-[var(--bg-sunken)] px-2 py-0.5 text-xs text-[var(--text-tertiary)] font-normal'>
        {count}
      </span>
    </button>
  )
}


function getGridClasses(viewMode: ViewMode, columns: GridColumns): string {
  if (viewMode === 'simple') {
    switch (columns) {
      case 2:
        return 'grid grid-cols-1 sm:grid-cols-2 gap-2'
      case 3:
        return 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2'
      case 4:
        return 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2'
      case 5:
        return 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2'
      case 6:
        return 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-2'
      default:
        return 'grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(180px,1fr))]'
    }
  }

  switch (columns) {
    case 2:
      return 'grid grid-cols-1 sm:grid-cols-2 gap-3'
    case 3:
      return 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3'
    case 4:
      return 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3'
    case 5:
      return 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3'
    case 6:
      return 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3'
    default:
      return 'grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]'
  }
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

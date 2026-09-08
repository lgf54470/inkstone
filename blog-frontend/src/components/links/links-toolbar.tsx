import { LayoutGrid, List, Pin, Plus, Search, Star, X } from 'lucide-react'
import type { BlogPublicLinkCategory } from '../../lib/types'
import { t, useCurrentLocale } from '../../lib/i18n'
import { SEARCH_ENGINES } from './search-engines'
import type { GridColumns, ViewMode } from './types'

export interface LinksToolbarProps {
  categories: BlogPublicLinkCategory[]
  activeCategory: string
  onSelectCategory: (catId: string) => void
  activeSubCategory: string
  onSelectSubCategory: (subCatId: string) => void
  searchQuery: string
  onSearchChange: (q: string) => void
  selectedEngines: Set<string>
  onToggleEngine: (id: string) => void
  onSearchSubmit: () => void
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  gridColumns: GridColumns
  onGridColumnsChange: (cols: GridColumns) => void
  onOpenApplyModal: () => void
  favCount: number
  pinCount: number
}

export function LinksToolbar(props: LinksToolbarProps) {
  const locale = useCurrentLocale()
  const rootCategories = props.categories.filter((c) => !c.parentId)
  const activeRoot = props.categories.find((c) => c.id === props.activeCategory)
  const subCategories = activeRoot ? props.categories.filter((c) => c.parentId === activeRoot.id) : []

  return (
    <div className='sticky top-15 z-30 mb-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-base)]/90 backdrop-blur-md p-3.5 sm:p-4 shadow-2xs space-y-3'>
      <SearchEngineBar
        selectedEngines={props.selectedEngines}
        onToggleEngine={props.onToggleEngine}
        searchQuery={props.searchQuery}
        onSearchChange={props.onSearchChange}
        onSearchSubmit={props.onSearchSubmit}
      />

      <div className='flex flex-wrap items-center justify-between gap-2.5 pt-1.5 border-t border-[var(--border-subtle)]'>
        <CategoryPills
          rootCategories={rootCategories}
          activeCategory={props.activeCategory}
          onSelectCategory={props.onSelectCategory}
          favCount={props.favCount}
          pinCount={props.pinCount}
        />

        <div className='flex items-center gap-2 shrink-0'>
          <GridColumnsSelector columns={props.gridColumns} onChange={props.onGridColumnsChange} />
          <ViewModeToggle mode={props.viewMode} onChange={props.onViewModeChange} />
          <button
            type='button'
            onClick={props.onOpenApplyModal}
            className='inline-flex items-center gap-1.5 h-8 px-3 rounded-xl bg-[var(--accent)] text-white text-xs font-semibold shadow-xs hover:opacity-90 transition-opacity cursor-pointer'
          >
            <Plus className='size-3.5' />
            <span>{t('links.btn_apply', {}, locale)}</span>
          </button>
        </div>
      </div>

      {subCategories.length > 0 && (
        <SubCategoryPills
          subCategories={subCategories}
          activeSubCategory={props.activeSubCategory}
          onSelectSubCategory={props.onSelectSubCategory}
        />
      )}
    </div>
  )
}

function SearchEngineBar({
  selectedEngines,
  onToggleEngine,
  searchQuery,
  onSearchChange,
  onSearchSubmit,
}: {
  selectedEngines: Set<string>
  onToggleEngine: (id: string) => void
  searchQuery: string
  onSearchChange: (q: string) => void
  onSearchSubmit: () => void
}) {
  const locale = useCurrentLocale()
  const names = Array.from(selectedEngines)
    .map((id) => SEARCH_ENGINES.find((e) => e.id === id)?.name || id)
    .join('、')

  const hint =
    selectedEngines.size === 0
      ? t('links.search_mode_internal', {}, locale)
      : t('links.search_mode_external', { count: selectedEngines.size, names }, locale)

  return (
    <div className='space-y-2'>
      <SearchEngineTags selectedEngines={selectedEngines} onToggleEngine={onToggleEngine} />
      <SearchInputField
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        onSearchSubmit={onSearchSubmit}
      />
      <p className='text-xs text-[var(--text-tertiary)] leading-normal'>
        {hint}
      </p>
    </div>
  )
}

function SearchInputField({
  searchQuery,
  onSearchChange,
  onSearchSubmit,
}: {
  searchQuery: string
  onSearchChange: (q: string) => void
  onSearchSubmit: () => void
}) {
  const locale = useCurrentLocale()
  return (
    <div className='flex items-center gap-2'>
      <SearchInputBox
        value={searchQuery}
        placeholder={t('links.search_placeholder', {}, locale)}
        onChange={onSearchChange}
        onSubmit={onSearchSubmit}
      />
      <button
        type='button'
        onClick={onSearchSubmit}
        className='h-9.5 shrink-0 rounded-xl bg-[var(--accent)] px-4 text-xs font-semibold text-white shadow-xs hover:opacity-90 transition-opacity cursor-pointer flex items-center justify-center'
      >
        {t('links.search_btn', {}, locale)}
      </button>
    </div>
  )
}

function SearchInputBox({
  value,
  placeholder,
  onChange,
  onSubmit,
}: {
  value: string
  placeholder: string
  onChange: (q: string) => void
  onSubmit: () => void
}) {
  return (
    <div className='relative flex-1'>
      <Search className='absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--text-quaternary)]' />
      <input
        type='text'
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit()
        }}
        placeholder={placeholder}
        className='h-9.5 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] pl-9 pr-8 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-quaternary)] focus:border-[var(--accent)] focus:outline-hidden transition-colors'
      />
      {value && (
        <button
          type='button'
          onClick={() => onChange('')}
          className='absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-[var(--text-quaternary)] hover:text-[var(--text-primary)] cursor-pointer'
        >
          <X className='size-3.5' />
        </button>
      )}
    </div>
  )
}

function SearchEngineTags({
  selectedEngines,
  onToggleEngine,
}: {
  selectedEngines: Set<string>
  onToggleEngine: (id: string) => void
}) {
  const locale = useCurrentLocale()
  return (
    <div className='flex items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
      <span className='shrink-0 text-xs font-semibold text-[var(--text-tertiary)] mr-1'>
        {t('links.search_engines', {}, locale)}:
      </span>
      {SEARCH_ENGINES.map((engine) => {
        const isSelected = selectedEngines.has(engine.id)
        return (
          <button
            key={engine.id}
            type='button'
            onClick={() => onToggleEngine(engine.id)}
            className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors cursor-pointer border ${
              isSelected
                ? 'bg-[var(--accent)] text-white border-[var(--accent)] shadow-2xs'
                : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:border-[var(--border-default)] hover:text-[var(--text-primary)]'
            }`}
          >
            {engine.name}
          </button>
        )
      })}
    </div>
  )
}

function CategoryPills({
  rootCategories,
  activeCategory,
  onSelectCategory,
  favCount,
  pinCount,
}: {
  rootCategories: BlogPublicLinkCategory[]
  activeCategory: string
  onSelectCategory: (id: string) => void
  favCount: number
  pinCount: number
}) {
  const locale = useCurrentLocale()
  return (
    <div className='flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden py-0.5'>
      <CategoryTabItem
        active={activeCategory === 'all'}
        label={t('links.filter_all', {}, locale)}
        onClick={() => onSelectCategory('all')}
      />
      <CategoryTabItem
        active={activeCategory === 'favorites'}
        label={t('links.filter_favorites', {}, locale)}
        icon={<Star className='size-3 text-amber-500 fill-amber-500' />}
        count={favCount}
        onClick={() => onSelectCategory('favorites')}
      />
      <CategoryTabItem
        active={activeCategory === 'pinned'}
        label={t('links.filter_pinned', {}, locale)}
        icon={<Pin className='size-3 text-[var(--accent)]' />}
        count={pinCount}
        onClick={() => onSelectCategory('pinned')}
      />
      {rootCategories.map((cat) => (
        <CategoryTabItem
          key={cat.id}
          active={activeCategory === cat.id}
          label={cat.name}
          onClick={() => onSelectCategory(cat.id)}
        />
      ))}
    </div>
  )
}

function CategoryTabItem({
  active,
  label,
  icon,
  count,
  onClick,
}: {
  active: boolean
  label: string
  icon?: React.ReactNode
  count?: number
  onClick: () => void
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
        active
          ? 'bg-[var(--accent-softer)] text-[var(--accent)] font-semibold'
          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
      }`}
    >
      {icon}
      <span>{label}</span>
      {typeof count === 'number' && count > 0 && (
        <span className='rounded-full bg-[var(--bg-sunken)] px-1.5 py-0.2 text-xs text-[var(--text-tertiary)]'>
          {count}
        </span>
      )}
    </button>
  )
}

function SubCategoryPills({
  subCategories,
  activeSubCategory,
  onSelectSubCategory,
}: {
  subCategories: BlogPublicLinkCategory[]
  activeSubCategory: string
  onSelectSubCategory: (id: string) => void
}) {
  const locale = useCurrentLocale()
  return (
    <div className='flex items-center gap-1.5 overflow-x-auto pl-2 border-l-2 border-[var(--accent)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden py-0.5'>
      <button
        type='button'
        onClick={() => onSelectSubCategory('')}
        className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium transition-colors cursor-pointer ${
          activeSubCategory === ''
            ? 'bg-[var(--accent)] text-white'
            : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
        }`}
      >
        {t('links.filter_all', {}, locale)}
      </button>
      {subCategories.map((sub) => (
        <button
          key={sub.id}
          type='button'
          onClick={() => onSelectSubCategory(sub.id)}
          className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium transition-colors cursor-pointer ${
            activeSubCategory === sub.id
              ? 'bg-[var(--accent)] text-white'
              : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
          }`}
        >
          {sub.name}
        </button>
      ))}
    </div>
  )
}

function GridColumnsSelector({
  columns,
  onChange,
}: {
  columns: GridColumns
  onChange: (cols: GridColumns) => void
}) {
  const locale = useCurrentLocale()
  const options: { value: GridColumns; label: string }[] = [
    { value: 'auto', label: t('links.columns_auto', {}, locale) },
    { value: 2, label: '2' },
    { value: 3, label: '3' },
    { value: 4, label: '4' },
    { value: 5, label: '5' },
  ]

  return (
    <div className='hidden sm:flex items-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-0.5'>
      <span className='px-1.5 text-xs text-[var(--text-quaternary)] font-medium select-none'>
        {t('links.columns_label', {}, locale)}
      </span>
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          type='button'
          onClick={() => onChange(opt.value)}
          className={`px-1.5 py-0.5 rounded text-xs font-medium transition-colors cursor-pointer ${
            columns === opt.value
              ? 'bg-[var(--accent)] text-white shadow-2xs'
              : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function ViewModeToggle({ mode, onChange }: { mode: ViewMode; onChange: (m: ViewMode) => void }) {
  const locale = useCurrentLocale()
  return (
    <div className='flex items-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-0.5 shrink-0'>
      <button
        type='button'
        onClick={() => onChange('detailed')}
        className={`p-1 rounded-md transition-colors cursor-pointer ${
          mode === 'detailed'
            ? 'bg-[var(--accent)] text-white shadow-2xs'
            : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
        }`}
        title={t('links.view_mode_detailed', {}, locale)}
      >
        <LayoutGrid className='size-3.5' />
      </button>
      <button
        type='button'
        onClick={() => onChange('simple')}
        className={`p-1 rounded-md transition-colors cursor-pointer ${
          mode === 'simple'
            ? 'bg-[var(--accent)] text-white shadow-2xs'
            : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
        }`}
        title={t('links.view_mode_simple', {}, locale)}
      >
        <List className='size-3.5' />
      </button>
    </div>
  )
}


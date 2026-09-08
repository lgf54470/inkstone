import { useEffect, useMemo, useState } from 'react'
import type { BlogPublicLink, BlogPublicLinkCategory } from '../../lib/types'
import { fetchPublicLinks, recordLinkClick } from '../../lib/api'
import { SEARCH_ENGINES } from './search-engines'
import type { ContextMenuState, GridColumns, QRModalState, ViewMode } from './types'

const FAV_STORAGE_KEY = 'inkstone_blog_favorite_links'
const PIN_STORAGE_KEY = 'inkstone_blog_pinned_links'
const VIEW_MODE_STORAGE_KEY = 'inkstone_blog_links_view_mode'
const COLUMNS_STORAGE_KEY = 'inkstone_blog_links_columns'

export function useLinksState(initialLinks: BlogPublicLink[], initialCategories: BlogPublicLinkCategory[]) {
  const [links, setLinks] = useState<BlogPublicLink[]>(initialLinks)
  const [categories, setCategories] = useState<BlogPublicLinkCategory[]>(initialCategories)

  const layout = useLayoutPreferences()
  const nav = useCategoryNavigation()
  const favPin = useFavoritesAndPins()
  const search = useSearchAndEngines()
  const ui = useModalsAndToast()

  useHydrateLinks({ initialLinks, initialCategories, setLinks, setCategories })

  const filteredLinks = useMemo(
    () =>
      computeFiltered(
        links,
        nav.activeCategory,
        nav.activeSubCategory,
        search.searchQuery,
        favPin.favorites,
        favPin.pinnedIds,
        categories,
      ),
    [links, nav.activeCategory, nav.activeSubCategory, search.searchQuery, favPin.favorites, favPin.pinnedIds, categories],
  )

  return {
    links,
    categories,
    filteredLinks,
    ...layout,
    ...nav,
    ...favPin,
    ...search,
    ...ui,
    handleVisitLink: (l: BlogPublicLink) => void recordLinkClick(l.id),
  }
}

function useModalsAndToast() {
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [isApplyModalOpen, setIsApplyModalOpen] = useState(false)
  const modals = useLinkModals()

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 2500)
  }

  return {
    ...modals,
    toastMessage,
    showToast,
    isApplyModalOpen,
    openApplyModal: () => setIsApplyModalOpen(true),
    closeApplyModal: () => setIsApplyModalOpen(false),
  }
}


function useLayoutPreferences() {
  const [viewMode, setViewModeState] = useState<ViewMode>('detailed')
  const [gridColumns, setGridColumnsState] = useState<GridColumns>('auto')

  useEffect(() => {
    loadLocalMode(setViewModeState)
    loadLocalColumns(setGridColumnsState)
  }, [])

  const setViewMode = (mode: ViewMode) => {
    setViewModeState(mode)
    saveToStorage(VIEW_MODE_STORAGE_KEY, mode)
  }

  const setGridColumns = (cols: GridColumns) => {
    setGridColumnsState(cols)
    saveToStorage(COLUMNS_STORAGE_KEY, cols)
  }

  return { viewMode, setViewMode, gridColumns, setGridColumns }
}

function useCategoryNavigation() {
  const [activeCategory, setActiveCategoryState] = useState<string>('all')
  const [activeSubCategory, setActiveSubCategory] = useState<string>('')
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => new Set())
  const [sectionSubCats, setSectionSubCats] = useState<Record<string, string>>({})

  const setActiveCategory = (cat: string) => {
    setActiveCategoryState(cat)
    setActiveSubCategory('')
  }

  const toggleSectionCollapse = (sectionId: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev)
      next.has(sectionId) ? next.delete(sectionId) : next.add(sectionId)
      return next
    })
  }

  const setSectionSubCategory = (parentId: string, subId: string) => {
    setSectionSubCats((prev) => ({
      ...prev,
      [parentId]: prev[parentId] === subId ? '' : subId,
    }))
  }

  return {
    activeCategory,
    setActiveCategory,
    activeSubCategory,
    setActiveSubCategory,
    collapsedSections,
    toggleSectionCollapse,
    sectionSubCats,
    setSectionSubCategory,
  }
}

function useHydrateLinks({
  initialLinks,
  initialCategories,
  setLinks,
  setCategories,
}: {
  initialLinks: BlogPublicLink[]
  initialCategories: BlogPublicLinkCategory[]
  setLinks: React.Dispatch<React.SetStateAction<BlogPublicLink[]>>
  setCategories: React.Dispatch<React.SetStateAction<BlogPublicLinkCategory[]>>
}) {
  useEffect(() => {
    if (initialLinks.length > 0) setLinks(initialLinks)
    if (initialCategories.length > 0) setCategories(initialCategories)
  }, [initialLinks, initialCategories, setLinks, setCategories])

  useEffect(() => {
    let active = true
    fetchPublicLinks()
      .then((res) => {
        if (!active) return
        if (res.links.length > 0) setLinks(res.links)
        if (res.categories.length > 0) setCategories(res.categories)
      })
      .catch((error) => {
        void error
      })
    return () => {
      active = false
    }
  }, [setLinks, setCategories])
}

function useFavoritesAndPins() {
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set())
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    loadLocalFavPin(setFavorites, setPinnedIds)
  }, [])

  const toggleFavorite = (linkId: string) => {
    setFavorites((prev) => {
      const next = new Set(prev)
      next.has(linkId) ? next.delete(linkId) : next.add(linkId)
      saveToStorage(FAV_STORAGE_KEY, Array.from(next))
      return next
    })
  }

  const togglePin = (linkId: string) => {
    setPinnedIds((prev) => {
      const next = new Set(prev)
      next.has(linkId) ? next.delete(linkId) : next.add(linkId)
      saveToStorage(PIN_STORAGE_KEY, Array.from(next))
      return next
    })
  }

  return { favorites, toggleFavorite, pinnedIds, togglePin }
}

function useSearchAndEngines() {
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [selectedEngines, setSelectedEngines] = useState<Set<string>>(() => new Set())

  const toggleEngine = (engineId: string) => {
    setSelectedEngines((prev) => {
      const next = new Set(prev)
      next.has(engineId) ? next.delete(engineId) : next.add(engineId)
      return next
    })
  }

  const handleSearchSubmit = () => {
    if (!searchQuery.trim() || selectedEngines.size === 0) return
    for (const engineId of selectedEngines) {
      const engine = SEARCH_ENGINES.find((e) => e.id === engineId)
      if (engine) window.open(engine.url(searchQuery.trim()), '_blank')
    }
  }

  return { searchQuery, setSearchQuery, selectedEngines, toggleEngine, handleSearchSubmit }
}

function useLinkModals() {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    isOpen: false,
    x: 0,
    y: 0,
    link: null,
  })
  const [qrModal, setQrModal] = useState<QRModalState>({
    isOpen: false,
    link: null,
  })

  return {
    contextMenu,
    openContextMenu: (link: BlogPublicLink, x: number, y: number) => setContextMenu({ isOpen: true, x, y, link }),
    closeContextMenu: () => setContextMenu((prev) => ({ ...prev, isOpen: false })),
    qrModal,
    openQrModal: (link: BlogPublicLink) => setQrModal({ isOpen: true, link }),
    closeQrModal: () => setQrModal({ isOpen: false, link: null }),
  }
}

function loadLocalMode(setMode: (m: ViewMode) => void) {
  try {
    const modeRaw = localStorage.getItem(VIEW_MODE_STORAGE_KEY)
    if (modeRaw === 'detailed' || modeRaw === 'simple') setMode(modeRaw)
  } catch (error) {
    void error
  }
}

function loadLocalColumns(setCols: (c: GridColumns) => void) {
  try {
    const raw = localStorage.getItem(COLUMNS_STORAGE_KEY)
    if (raw === 'auto' || raw === '2' || raw === '3' || raw === '4' || raw === '5') {
      setCols(raw === 'auto' ? 'auto' : (Number(raw) as GridColumns))
    }
  } catch (error) {
    void error
  }
}

function loadLocalFavPin(setFav: (s: Set<string>) => void, setPin: (s: Set<string>) => void) {
  try {
    const favRaw = localStorage.getItem(FAV_STORAGE_KEY)
    if (favRaw) setFav(new Set(JSON.parse(favRaw)))
    const pinRaw = localStorage.getItem(PIN_STORAGE_KEY)
    if (pinRaw) setPin(new Set(JSON.parse(pinRaw)))
  } catch (error) {
    void error
  }
}

function saveToStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value))
  } catch (error) {
    void error
  }
}

function computeFiltered(
  links: BlogPublicLink[],
  cat: string,
  subCat: string,
  query: string,
  favorites: Set<string>,
  pinnedIds: Set<string>,
  categories: BlogPublicLinkCategory[],
): BlogPublicLink[] {
  let list = filterByCategory(links, cat, subCat, favorites, pinnedIds, categories)

  if (query.trim()) {
    const q = query.trim().toLowerCase()
    list = list.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.url.toLowerCase().includes(q) ||
        (l.description && l.description.toLowerCase().includes(q)),
    )
  }

  return sortLinks(list, pinnedIds)
}

function filterByCategory(
  links: BlogPublicLink[],
  cat: string,
  subCat: string,
  favorites: Set<string>,
  pinnedIds: Set<string>,
  categories: BlogPublicLinkCategory[],
): BlogPublicLink[] {
  if (cat === 'favorites') return links.filter((l) => favorites.has(l.id))
  if (cat === 'pinned') return links.filter((l) => l.isPinned || pinnedIds.has(l.id))
  if (cat === 'none') return links.filter((l) => !l.categoryId)
  if (cat === 'all') return links

  if (subCat) return links.filter((l) => l.categoryId === subCat)

  const childCatIds = categories.filter((c) => c.parentId === cat).map((c) => c.id)
  const allTargetIds = new Set([cat, ...childCatIds])
  return links.filter((l) => l.categoryId && allTargetIds.has(l.categoryId))
}

function sortLinks(links: BlogPublicLink[], pinnedIds: Set<string>): BlogPublicLink[] {
  return [...links].sort((a, b) => {
    const aPin = a.isPinned || pinnedIds.has(a.id) ? 1 : 0
    const bPin = b.isPinned || pinnedIds.has(b.id) ? 1 : 0
    if (aPin !== bPin) return bPin - aPin
    return (b.clicks ?? 0) - (a.clicks ?? 0)
  })
}

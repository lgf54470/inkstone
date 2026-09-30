import { useMemo, useState } from 'react'
import type { BlogLink, BlogLinkStats } from '@shared/types'
import { confirm } from '../../../components/overlay'
import { t } from '../../../lib/i18n'
import { useUi } from '../../../store/ui'
import { useBlogStore, type BlogLinkFilterType } from '../blog-store'
import { linkMenuAnchorPoint } from './link-context-menu'

export function useBlogLinksView() {
  const toast = useUi((s) => s.toast)
  const store = useBlogLinksStore()
  const modals = useBlogLinksModals()
  const dnd = useBlogLinksDragAndDrop(store.links, store.reorderLinks, toast)
  const contextMenuState = useBlogLinksContextMenu()
  const batchOps = useBlogLinksBatchOperations(store, toast)

  const statusCounts = useMemo(() => linkStatusCounts(store.linkStats), [store.linkStats])
  const loadFailed = store.links.length === 0 && store.loadErrors.has('links')
  // The server answers the filter this time, so what came back *is* the filtered list — the badge
  // count is only used to notice that the list hit its page limit.
  const filteredLinks = store.links
  const isTruncated = statusCounts[store.linkStatusFilter] > filteredLinks.length
  const isAllSelected = filteredLinks.length > 0 && filteredLinks.every((l) => store.selectedLinkIds.has(l.id))

  const handleToggleSelectAll = () => {
    isAllSelected ? store.clearLinkSelection() : store.selectAllLinks(filteredLinks.map((l) => l.id))
  }

  const handleDelete = async (link: BlogLink) => {
    const ok = await confirm({
      title: t('blog.delete_link'),
      description: t('blog.confirm_delete_link'),
      confirmLabel: t('common.delete'),
      tone: 'danger',
    })
    if (!ok) return
    const deleted = await store.deleteLink(link.id)
    if (deleted) toast({ title: t('blog.link_deleted'), tone: 'success' })
  }

  return {
    ...store,
    ...modals,
    ...dnd,
    ...contextMenuState,
    ...batchOps,
    statusCounts,
    filteredLinks,
    loadFailed,
    isTruncated,
    isAllSelected,
    handleToggleSelectAll,
    handleDelete,
  }
}

function useBlogLinksBatchOperations(
  store: ReturnType<typeof useBlogLinksStore>,
  toast: (opts: { title: string; tone?: 'success' | 'danger' | 'warning' | 'default' }) => unknown,
) {
  const handleBatch = async (
    action: 'approve' | 'reject' | 'delete' | 'pin' | 'unpin' | 'favorite' | 'unfavorite' | 'setCategory',
    catId?: string | null,
  ) => {
    if (action === 'delete') {
      const ok = await confirm({
        title: t('blog.link_batch_delete'),
        description: t('blog.confirm_delete_links', { value0: store.selectedLinkIds.size }),
        confirmLabel: t('common.delete'),
        tone: 'danger',
      })
      if (!ok) return
    }
    const done = await store.batchLinks(action, catId)
    if (done) toast({ title: t('blog.link_saved'), tone: 'success' })
  }

  const handleBatchDeleteLinks = async (ids: string[]): Promise<boolean> => {
    if (ids.length === 0) return false
    // The confirmation names the number it is about to delete: it used to reuse the single-link
    // sentence, so deleting forty broken links asked about "this link".
    const ok = await confirm({
      title: t('blog.link_batch_delete'),
      description: t('blog.confirm_delete_links', { value0: ids.length }),
      confirmLabel: t('common.delete'),
      tone: 'danger',
    })
    if (!ok) return false
    // One batch request for the whole set: the per-row loop sent a DELETE and a full list reload
    // for each link the checker had selected.
    const deleted = await store.batchDeleteLinks(ids)
    if (deleted) toast({ title: t('blog.link_deleted'), tone: 'success' })
    return deleted
  }

  return { handleBatch, handleBatchDeleteLinks }
}

function useBlogLinksStore() {
  const links = useBlogStore((s) => s.links)
  const linkCategories = useBlogStore((s) => s.linkCategories)
  const linkStats = useBlogStore((s) => s.linkStats)
  const loadErrors = useBlogStore((s) => s.loadErrors)
  const loading = useBlogStore((s) => s.loading)
  const batchBusy = useBlogStore((s) => s.batchBusy)
  const linkStatusFilter = useBlogStore((s) => s.linkStatusFilter)
  const setLinkStatusFilter = useBlogStore((s) => s.setLinkStatusFilter)
  const linkCategoryId = useBlogStore((s) => s.linkCategoryId)
  const setLinkCategoryId = useBlogStore((s) => s.setLinkCategoryId)
  const linkSearch = useBlogStore((s) => s.linkSearch)
  const setLinkSearch = useBlogStore((s) => s.setLinkSearch)
  const selectedLinkIds = useBlogStore((s) => s.selectedLinkIds)
  const toggleSelectLink = useBlogStore((s) => s.toggleSelectLink)
  const selectAllLinks = useBlogStore((s) => s.selectAllLinks)
  const clearLinkSelection = useBlogStore((s) => s.clearLinkSelection)
  const loadLinks = useBlogStore((s) => s.loadLinks)
  const createLink = useBlogStore((s) => s.createLink)
  const updateLink = useBlogStore((s) => s.updateLink)
  const deleteLink = useBlogStore((s) => s.deleteLink)
  const updateLinkStatus = useBlogStore((s) => s.updateLinkStatus)
  const togglePinLink = useBlogStore((s) => s.togglePinLink)
  const toggleFavoriteLink = useBlogStore((s) => s.toggleFavoriteLink)
  const reorderLinks = useBlogStore((s) => s.reorderLinks)
  const batchLinks = useBlogStore((s) => s.batchLinks)
  const batchDeleteLinks = useBlogStore((s) => s.batchDeleteLinks)
  const createLinkCategory = useBlogStore((s) => s.createLinkCategory)
  const updateLinkCategory = useBlogStore((s) => s.updateLinkCategory)
  const deleteLinkCategory = useBlogStore((s) => s.deleteLinkCategory)
  const importLinksData = useBlogStore((s) => s.importLinksData)

  return {
    links, linkCategories, linkStats, loadErrors, loading, batchBusy,
    linkStatusFilter, setLinkStatusFilter, linkCategoryId, setLinkCategoryId,
    linkSearch, setLinkSearch, selectedLinkIds, toggleSelectLink,
    selectAllLinks, clearLinkSelection, loadLinks, createLink,
    updateLink, deleteLink, updateLinkStatus, togglePinLink,
    toggleFavoriteLink, reorderLinks, batchLinks, batchDeleteLinks,
    createLinkCategory, updateLinkCategory, deleteLinkCategory, importLinksData,
  }
}

function useBlogLinksModals() {
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editingLink, setEditingLink] = useState<BlogLink | null>(null)
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false)
  const [isImportExportModalOpen, setIsImportExportModalOpen] = useState(false)
  const [isCheckerModalOpen, setIsCheckerModalOpen] = useState(false)
  const [qrModalLink, setQrModalLink] = useState<BlogLink | null>(null)

  const handleOpenAdd = () => {
    setEditingLink(null)
    setIsEditModalOpen(true)
  }

  const handleOpenEdit = (link: BlogLink) => {
    setEditingLink(link)
    setIsEditModalOpen(true)
  }

  return {
    isEditModalOpen, setIsEditModalOpen,
    editingLink, setEditingLink,
    isCategoryModalOpen, setIsCategoryModalOpen,
    isImportExportModalOpen, setIsImportExportModalOpen,
    isCheckerModalOpen, setIsCheckerModalOpen,
    qrModalLink, setQrModalLink,
    handleOpenAdd, handleOpenEdit,
  }
}

function useBlogLinksDragAndDrop(
  links: BlogLink[],
  reorderLinks: (orders: Array<{ id: string; sortOrder?: number; pinnedOrder?: number }>) => Promise<boolean>,
  toast: (opts: { title: string; tone?: 'success' | 'danger' | 'warning' | 'default' }) => unknown,
) {
  const [isSortingMode, setIsSortingMode] = useState(false)
  const [draggedLinkId, setDraggedLinkId] = useState<string | null>(null)

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('text/plain', id)
    setDraggedLinkId(id)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    const sourceId = e.dataTransfer.getData('text/plain') || draggedLinkId
    setDraggedLinkId(null)
    if (!sourceId || sourceId === targetId) return

    const currentList = [...links]
    const sourceIndex = currentList.findIndex((l) => l.id === sourceId)
    const targetIndex = currentList.findIndex((l) => l.id === targetId)
    if (sourceIndex === -1 || targetIndex === -1) return

    const [removed] = currentList.splice(sourceIndex, 1)
    currentList.splice(targetIndex, 0, removed)
    const items = currentList.map((item, index) => ({ id: item.id, sortOrder: index + 1 }))
    const saved = await reorderLinks(items)
    if (saved) toast({ title: t('blog.link_reorder_success'), tone: 'success' })
  }

  const handleDragEnd = () => {
    setDraggedLinkId(null)
  }

  return {
    isSortingMode,
    setIsSortingMode,
    draggedLinkId,
    handleDragStart,
    handleDragOver,
    handleDrop,
    handleDragEnd,
  }
}

function useBlogLinksContextMenu() {
  const [contextMenu, setContextMenu] = useState<{ isOpen: boolean; x: number; y: number; link: BlogLink | null }>({
    isOpen: false,
    x: 0,
    y: 0,
    link: null,
  })

  const handleContextMenu = (e: React.MouseEvent, link: BlogLink) => {
    e.preventDefault()
    setContextMenu({ isOpen: true, link, ...linkMenuAnchorPoint(e) })
  }

  // The row's own actions button opens the panel the right-click does. Without it copy, QR and
  // check existed only behind a right-click: no pointer user would find them, no keyboard user
  // could reach them at all.
  const handleOpenLinkMenu = (e: React.MouseEvent, link: BlogLink) => {
    setContextMenu({ isOpen: true, link, ...linkMenuAnchorPoint(e) })
  }

  const handleCloseContextMenu = () => {
    setContextMenu({ isOpen: false, x: 0, y: 0, link: null })
  }

  return {
    contextMenu,
    handleContextMenu,
    handleOpenLinkMenu,
    handleCloseContextMenu,
  }
}

function linkStatusCounts(linkStats: BlogLinkStats | null): Record<BlogLinkFilterType, number> {
  return {
    all: linkStats?.total ?? 0,
    pending: linkStats?.pending ?? 0,
    approved: linkStats?.approved ?? 0,
    rejected: linkStats?.rejected ?? 0,
    pinned: linkStats?.pinned ?? 0,
    favorite: linkStats?.favorite ?? 0,
  }
}

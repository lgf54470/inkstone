import { useMemo, useState } from 'react'
import type { BlogLink } from '@shared/types'
import { confirm } from '../../../components/overlay'
import { t } from '../../../lib/i18n'
import { useUi } from '../../../store/ui'
import { useBlogStore } from '../blog-store'

export function useBlogLinksView() {
  const toast = useUi((s) => s.toast)
  const store = useBlogLinksStore()
  const modals = useBlogLinksModals()

  const statusCounts = useMemo(() => computeStatusCounts(store.linkStats, store.links), [store.linkStats, store.links])
  const filteredLinks = useMemo(
    () => filterLinks(store.links, store.linkStatusFilter, store.linkCategoryId, store.linkSearch),
    [store.links, store.linkStatusFilter, store.linkCategoryId, store.linkSearch],
  )
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
    await store.deleteLink(link.id)
    toast({ title: t('blog.link_deleted'), tone: 'success' })
  }

  const handleBatch = async (action: 'approve' | 'reject' | 'delete' | 'pin' | 'unpin' | 'setCategory', catId?: string | null) => {
    if (action === 'delete') {
      const ok = await confirm({
        title: t('blog.link_batch_delete'),
        description: t('blog.confirm_delete_link'),
        confirmLabel: t('common.delete'),
        tone: 'danger',
      })
      if (!ok) return
    }
    await store.batchLinks(action, catId)
    toast({ title: t('blog.link_saved'), tone: 'success' })
  }

  return {
    ...store,
    ...modals,
    statusCounts, filteredLinks, isAllSelected,
    handleToggleSelectAll, handleDelete, handleBatch,
  }
}

function useBlogLinksStore() {
  const links = useBlogStore((s) => s.links)
  const linkCategories = useBlogStore((s) => s.linkCategories)
  const linkStats = useBlogStore((s) => s.linkStats)
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
  const batchLinks = useBlogStore((s) => s.batchLinks)
  const createLinkCategory = useBlogStore((s) => s.createLinkCategory)
  const updateLinkCategory = useBlogStore((s) => s.updateLinkCategory)
  const deleteLinkCategory = useBlogStore((s) => s.deleteLinkCategory)
  const importLinksData = useBlogStore((s) => s.importLinksData)

  return {
    links, linkCategories, linkStats, loading, batchBusy,
    linkStatusFilter, setLinkStatusFilter, linkCategoryId, setLinkCategoryId,
    linkSearch, setLinkSearch, selectedLinkIds, toggleSelectLink,
    selectAllLinks, clearLinkSelection, loadLinks, createLink,
    updateLink, deleteLink, updateLinkStatus, togglePinLink,
    batchLinks, createLinkCategory, updateLinkCategory,
    deleteLinkCategory, importLinksData,
  }
}

function useBlogLinksModals() {
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editingLink, setEditingLink] = useState<BlogLink | null>(null)
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false)
  const [isImportExportModalOpen, setIsImportExportModalOpen] = useState(false)

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
    handleOpenAdd, handleOpenEdit,
  }
}

function computeStatusCounts(linkStats: { total: number; pending: number; approved: number; rejected: number } | null, links: BlogLink[]) {
  return {
    all: linkStats?.total ?? links.length,
    pending: linkStats?.pending ?? links.filter((l) => l.status === 'pending').length,
    approved: linkStats?.approved ?? links.filter((l) => l.status === 'approved').length,
    rejected: linkStats?.rejected ?? links.filter((l) => l.status === 'rejected').length,
  }
}

function filterLinks(links: BlogLink[], statusFilter: string, categoryId: string | null, search: string): BlogLink[] {
  let result = links
  if (statusFilter !== 'all') {
    result = result.filter((l) => l.status === statusFilter)
  }
  if (categoryId) {
    result = result.filter((l) => l.categoryId === categoryId)
  }
  if (search.trim()) {
    const q = search.trim().toLowerCase()
    result = result.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.url.toLowerCase().includes(q) ||
        (l.description && l.description.toLowerCase().includes(q)) ||
        (l.email && l.email.toLowerCase().includes(q)),
    )
  }
  return result
}

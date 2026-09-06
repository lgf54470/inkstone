import { useRef, useState, type RefObject } from 'react'
import { CheckCircle, FolderInput, Pin, Trash2, XCircle } from 'lucide-react'
import type { BlogCategory } from '@shared/types'
import { Button } from '../../components/primitives'
import { Menu, type MenuItem } from '../../components/overlay'
import { t } from '../../lib/i18n'
import type { UiState } from '../../store/ui'
import { useUi } from '../../store/ui'
import { useBlogStore, type BlogStoreState } from './blog-store'
import { batchDelete, batchPin, batchPublish, batchSetCategory, batchUnpublish, buildFolderMenuItems } from './blog-batch-bar-actions'

export function BlogBatchBar({
    selectedCount,
    onClearSelection,
}: {
    selectedCount: number
    onClearSelection: () => void
}) {
    const toast = useUi((s) => s.toast)
    const batchPosts = useBlogStore((s) => s.batchPosts)
    const batchBusy = useBlogStore((s) => s.batchBusy)
    const folders = useBlogStore((s) => s.folders)
    const categories = useBlogStore((s) => s.categories)

    const [isFolderMenuOpen, setIsFolderMenuOpen] = useState(false)
    const folderButtonRef = useRef<HTMLButtonElement>(null)

    if (selectedCount === 0) return null

    const menuItems = buildFolderMenuItems(folders, selectedCount, batchPosts, () => setIsFolderMenuOpen(false), toast)

    return (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[var(--z-menu)] flex items-center gap-2 rounded-[var(--r-xl)] border border-[var(--border-strong)] bg-[var(--bg-overlay)]/95 px-4 py-2 shadow-[var(--shadow-modal)] backdrop-blur text-[length:var(--text-12)] whitespace-nowrap">
            <span className="font-semibold text-[var(--text-primary)]">
                {t('blog.selected_posts_count', { value0: selectedCount })}
            </span>

            <div className="h-4 w-px bg-[var(--border-default)]" />

            <BatchBarPrimary
                bundle={{
                    batchPosts,
                    busy: batchBusy,
                    toast,
                    selectedCount,
                    menuItems,
                    isFolderMenuOpen,
                    folderButtonRef,
                    onToggleFolderMenu: () => setIsFolderMenuOpen((prev) => !prev),
                    onCloseFolderMenu: () => setIsFolderMenuOpen(false),
                }}
            />

            {categories.length > 0 && (
                <BatchCategorySelect categories={categories} batchPosts={batchPosts} />
            )}

            <BatchBarDelete
                busy={batchBusy}
                selectedCount={selectedCount}
                batchPosts={batchPosts}
                onClearSelection={onClearSelection}
            />
        </div>
    )
}

interface BatchBarPrimaryBundle {
    batchPosts: BlogStoreState['batchPosts']
    busy: boolean
    toast: UiState['toast']
    selectedCount: number
    menuItems: MenuItem[]
    isFolderMenuOpen: boolean
    folderButtonRef: RefObject<HTMLButtonElement | null>
    onToggleFolderMenu: () => void
    onCloseFolderMenu: () => void
}

function BatchBarPrimary({ bundle }: { bundle: BatchBarPrimaryBundle }) {
    const { batchPosts, busy, toast, selectedCount, menuItems, isFolderMenuOpen, folderButtonRef, onToggleFolderMenu, onCloseFolderMenu } = bundle

    return (
        <>
            <Button size="sm" variant="secondary" loading={busy} onClick={() => void batchPublish(batchPosts)}>
                <CheckCircle size={12} className="mr-1 text-[var(--success)]" />
                {t('blog.batch_publish')}
            </Button>

            <Button size="sm" variant="secondary" loading={busy} onClick={() => void batchUnpublish(batchPosts, selectedCount)}>
                <XCircle size={12} className="mr-1 text-[var(--text-tertiary)]" />
                {t('blog.batch_unpublish')}
            </Button>

            <Button ref={folderButtonRef} size="sm" variant="secondary" loading={busy} onClick={onToggleFolderMenu}>
                <FolderInput size={12} className="mr-1" />
                {t('blog.batch_move_folder')}
            </Button>
            <Menu open={isFolderMenuOpen} anchor={folderButtonRef} items={menuItems} onClose={onCloseFolderMenu} />

            <Button size="sm" variant="secondary" loading={busy} onClick={() => void batchPin(batchPosts, toast)}>
                <Pin size={12} className="mr-1 text-[var(--accent)]" />
                {t('blog.batch_pin')}
            </Button>
        </>
    )
}

function BatchCategorySelect({
    categories,
    batchPosts,
}: {
    categories: BlogCategory[]
    batchPosts: BlogStoreState['batchPosts']
}) {
    return (
        <div className="relative flex items-center">
            <select
                onChange={(e) => void batchSetCategory(batchPosts, e.target.value)}
                defaultValue=""
                className="h-7 rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-base)] px-2 text-[length:var(--text-11\.5)] text-[var(--text-secondary)] outline-none"
            >
                <option value="" disabled>
                    {t('blog.change_category')}
                </option>
                <option value="">{t('blog.remove_category')}</option>
                {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                        {c.name}
                    </option>
                ))}
            </select>
        </div>
    )
}

function BatchBarDelete({
    busy,
    selectedCount,
    batchPosts,
    onClearSelection,
}: {
    busy: boolean
    selectedCount: number
    batchPosts: BlogStoreState['batchPosts']
    onClearSelection: () => void
}) {
    return (
        <>
            <Button size="sm" variant="danger" loading={busy} onClick={() => void batchDelete(batchPosts, selectedCount)}>
                <Trash2 size={12} className="mr-1" />
                {t('common.delete')}
            </Button>

            <div className="h-4 w-px bg-[var(--border-default)]" />

            <Button size="sm" variant="ghost" onClick={onClearSelection}>
                {t('common.cancel')}
            </Button>
        </>
    )
}
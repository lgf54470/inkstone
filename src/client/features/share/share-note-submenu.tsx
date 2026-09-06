import {
    ArrowLeft,
    BarChart2,
    Check,
    ChevronRight,
    Copy,
    FolderClosed,
    FolderMinus,
    Hash,
    Plus,
    QrCode,
    Search,
    Settings2,
    Trash2,
    X,
} from 'lucide-react'
import type { ReactNode } from 'react'
import type { ShareInfo, ShareTag } from '@shared/types'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import type { ShareNoteSubmenuBundle } from './use-share-note-submenu'
import { useShareNoteSubmenu } from './use-share-note-submenu'

export function ShareNoteSubmenu({
    noteId,
    noteTitle,
    share: initialShare,
    closeMenu,
    onOpenSettings,
    onOpenQr,
    onOpenAnalytics,
}: {
    noteId: string
    noteTitle: string
    share?: ShareInfo | null
    closeMenu: () => void
    onOpenSettings: () => void
    onOpenQr: (url: string, title: string, slug: string) => void
    onOpenAnalytics: (share: ShareInfo) => void
}) {
    const bundle = useShareNoteSubmenu({
        noteId, noteTitle, share: initialShare, closeMenu, onOpenQr, onOpenAnalytics,
    })
    if (bundle.view === 'folder') return <ShareFolderView bundle={bundle} />
    if (bundle.view === 'tags') return <ShareTagsView bundle={bundle} />
    return <ShareMainMenu bundle={bundle} closeMenu={closeMenu} onOpenSettings={onOpenSettings} />
}

function ShareSubmenuHeader({ title, onBack }: { title: string; onBack: () => void }) {
    return (
        <div className="flex items-center gap-1.5 px-1 pt-0.5 pb-2 text-[length:var(--text-12\.5)] font-medium text-[var(--text-secondary)] border-b border-[var(--border-subtle)]">
            <button
                type="button"
                onClick={onBack}
                className="flex size-5 items-center justify-center rounded hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                title={t('share.back')}
            >
                <ArrowLeft size={13} />
            </button>
            <span>{title}</span>
        </div>
    )
}

function ShareFolderView({ bundle }: { bundle: ShareNoteSubmenuBundle }) {
    return (
        <div
            className="w-[248px] rounded-[var(--r-lg)] border border-[var(--border-default)] bg-[var(--bg-overlay)] p-1.5 shadow-[var(--shadow-pop)] outline-none"
            onClick={(e) => e.stopPropagation()}
        >
            <ShareSubmenuHeader title={t('share.batch_move_to_folder')} onBack={() => bundle.setView('main')} />
            <div className="px-1 py-1.5">
                <div className="relative flex items-center border-b-2 border-[var(--accent)] pb-1">
                    <input
                        autoFocus
                        type="text"
                        value={bundle.folderQuery}
                        onChange={(e) => bundle.setFolderQuery(e.target.value)}
                        placeholder={t('folders.search')}
                        className="w-full bg-transparent pr-6 text-[length:var(--text-12)] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-quaternary)]"
                    />
                    <Search size={13} className="pointer-events-none absolute right-0 text-[var(--text-quaternary)]" />
                </div>
            </div>
            <ShareFolderList bundle={bundle} />
        </div>
    )
}

function ShareFolderList({ bundle }: { bundle: ShareNoteSubmenuBundle }) {
    const selectedId = bundle.currentShare?.shareFolderId ?? null
    return (
        <div className="max-h-[200px] overflow-y-auto space-y-0.5 px-0.5 pt-0.5">
            <ShareFolderRow
                icon={<FolderMinus size={13} className="shrink-0 text-[var(--text-tertiary)]" />}
                label={t('navigation.unfiled')}
                isSelected={!selectedId}
                onSelect={() => void bundle.handleSelectFolder(null)}
            />
            {bundle.filteredFolders.map((f) => (
                <ShareFolderRow
                    key={f.id}
                    icon={<FolderClosed size={13} style={{ color: f.color ?? undefined }} className="shrink-0 text-[var(--text-tertiary)]" />}
                    label={f.name}
                    isSelected={selectedId === f.id}
                    onSelect={() => void bundle.handleSelectFolder(f.id)}
                />
            ))}
        </div>
    )
}

function ShareFolderRow({ icon, label, isSelected, onSelect }: {
    icon: ReactNode
    label: string
    isSelected: boolean
    onSelect: () => void
}) {
    return (
        <button
            type="button"
            onClick={onSelect}
            className={cn(
                'group flex w-full items-center gap-2 rounded-[var(--r-sm)] px-2 py-1.5 text-left text-[length:var(--text-12)] transition-colors',
                isSelected
                    ? 'bg-[var(--accent-soft)] font-medium text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
            )}
        >
            {icon}
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {isSelected && <Check size={12} className="text-[var(--accent)]" />}
        </button>
    )
}

function ShareTagsView({ bundle }: { bundle: ShareNoteSubmenuBundle }) {
    return (
        <div
            className="w-[248px] rounded-[var(--r-lg)] border border-[var(--border-default)] bg-[var(--bg-overlay)] p-2 shadow-[var(--shadow-pop)] outline-none space-y-2"
            onClick={(e) => e.stopPropagation()}
        >
            <ShareSubmenuHeader title={t('share.tags_isolation')} onBack={() => bundle.setView('main')} />
            <ShareTagChips tags={bundle.currentTags} onRemove={bundle.handleRemoveTag} />
            <ShareTagInput value={bundle.newTagInput} onChange={bundle.setNewTagInput} onAdd={bundle.handleAddTag} />
            {bundle.availableSuggestedTags.length > 0 && (
                <ShareTagSuggestions tags={bundle.availableSuggestedTags} onAdd={bundle.handleAddTag} />
            )}
        </div>
    )
}

function ShareTagChips({ tags, onRemove }: { tags: string[]; onRemove: (tag: string) => void }) {
    if (tags.length === 0) {
        return <span className="text-[length:var(--text-11)] text-[var(--text-quaternary)] py-0.5">{t('share.no_tags')}</span>
    }
    return (
        <div className="flex flex-wrap gap-1 min-h-[26px]">
            {tags.map((tag) => (
                <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-[var(--r-sm)] bg-[var(--bg-hover)] border border-[var(--border-subtle)] px-1.5 py-0.5 text-[length:var(--text-11)] font-medium text-[var(--text-secondary)]"
                >
                    <Hash size={10} className="text-[var(--accent)]" />
                    <span>{tag}</span>
                    <button
                        type="button"
                        onClick={() => void onRemove(tag)}
                        className="text-[var(--text-quaternary)] hover:text-[var(--danger)]"
                    >
                        <X size={10} />
                    </button>
                </span>
            ))}
        </div>
    )
}

function ShareTagInput({ value, onChange, onAdd }: {
    value: string
    onChange: (v: string) => void
    onAdd: (tag: string) => void
}) {
    return (
        <div className="flex items-center gap-1 pt-1 border-t border-[var(--border-subtle)]">
            <input
                autoFocus
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault()
                        void onAdd(value)
                    }
                }}
                placeholder={t('share.tag_placeholder')}
                className="flex-1 rounded-[var(--r-sm)] border border-[var(--border-default)] bg-[var(--bg-base)] px-2 py-1 text-[length:var(--text-11)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            />
            <button
                type="button"
                onClick={() => void onAdd(value)}
                className="flex size-6 items-center justify-center rounded-[var(--r-sm)] bg-[var(--accent-soft)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-[var(--accent-contrast)] transition-colors"
            >
                <Plus size={12} />
            </button>
        </div>
    )
}

function ShareTagSuggestions({ tags, onAdd }: { tags: ShareTag[]; onAdd: (name: string) => void }) {
    return (
        <div className="pt-1">
            <div className="text-[length:var(--text-10)] text-[var(--text-quaternary)] pb-1">{t('tags.manage_tags')}</div>
            <div className="flex flex-wrap gap-1 max-h-[80px] overflow-y-auto">
                {tags.map((tag) => (
                    <button
                        key={tag.id}
                        type="button"
                        onClick={() => void onAdd(tag.name)}
                        className="inline-flex items-center gap-0.5 rounded-[var(--r-sm)] bg-[var(--bg-surface)] px-1.5 py-0.5 text-[length:var(--text-10\.5)] text-[var(--text-tertiary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)] border border-transparent transition-colors"
                    >
                        <Plus size={9} />
                        <span>{tag.name}</span>
                    </button>
                ))}
            </div>
        </div>
    )
}

function ShareMenuButton({ icon, label, right, onClick, danger }: {
    icon: ReactNode
    label: string
    right?: ReactNode
    onClick: () => void
    danger?: boolean
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'flex h-[30px] w-full items-center gap-2 rounded-[var(--r-sm)] px-2 text-left transition-colors',
                danger
                    ? 'text-[var(--danger)] hover:bg-[var(--danger-subtle)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
            )}
        >
            {icon}
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {right}
        </button>
    )
}

function ShareMainMenu({ bundle, closeMenu, onOpenSettings }: {
    bundle: ShareNoteSubmenuBundle
    closeMenu: () => void
    onOpenSettings: () => void
}) {
    const folderRight = (
        <>
            <span className="max-w-[70px] truncate text-[length:var(--text-11)] text-[var(--text-quaternary)]">
                {bundle.currentFolder ? bundle.currentFolder.name : t('navigation.unfiled')}
            </span>
            <ChevronRight size={12} className="shrink-0 opacity-60" />
        </>
    )
    const tagsRight = (
        <>
            <span className="text-[length:var(--text-11)] text-[var(--text-quaternary)]">
                {bundle.currentTags.length > 0 ? `${bundle.currentTags.length}` : t('share.no_tags')}
            </span>
            <ChevronRight size={12} className="shrink-0 opacity-60" />
        </>
    )
    return (
        <div
            className="w-[236px] rounded-[var(--r-lg)] border border-[var(--border-default)] bg-[var(--bg-overlay)] p-1 shadow-[var(--shadow-pop)] outline-none space-y-0.5 text-[length:var(--text-12\.5)]"
            onClick={(e) => e.stopPropagation()}
        >
            <ShareMenuButton icon={<QrCode size={13} className="shrink-0 text-[var(--text-tertiary)]" />} label={t('share.view_qr')} onClick={() => void bundle.handleOpenQr()} />
            <ShareMenuButton icon={<Copy size={13} className="shrink-0 text-[var(--text-tertiary)]" />} label={t('share.copy_link')} onClick={() => void bundle.handleCopyLink()} />
            <ShareMenuButton icon={<FolderClosed size={13} className="shrink-0 text-[var(--text-tertiary)]" />} label={t('share.batch_move_to_folder')} right={folderRight} onClick={() => bundle.setView('folder')} />
            <ShareMenuButton icon={<Hash size={13} className="shrink-0 text-[var(--text-tertiary)]" />} label={t('share.tags_isolation')} right={tagsRight} onClick={() => bundle.setView('tags')} />
            <ShareMenuButton icon={<BarChart2 size={13} className="shrink-0 text-[var(--text-tertiary)]" />} label={t('share.view_note_analytics')} onClick={() => void bundle.handleOpenAnalytics()} />
            <ShareMenuButton icon={<Settings2 size={13} className="shrink-0 text-[var(--text-tertiary)]" />} label={t('share.edit_share_settings')} onClick={() => { closeMenu(); onOpenSettings() }} />
            {bundle.currentShare && (
                <>
                    <div role="separator" className="my-1 h-px bg-[var(--border-subtle)]" />
                    <ShareMenuButton icon={<Trash2 size={13} className="shrink-0 text-[var(--danger)]" />} label={t('share.cancel_share')} danger onClick={() => void bundle.handleRevoke()} />
                </>
            )}
        </div>
    )
}
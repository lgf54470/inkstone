import { useRef, useState, type RefObject } from 'react'
import type { ReactNode } from 'react'
import { Calendar, FolderInput, Play, Square, Trash2, X } from 'lucide-react'
import { Button } from '../../components/primitives'
import { Menu, type MenuItem } from '../../components/overlay'
import { t } from '../../lib/i18n'
import type { UiState } from '../../store/ui'
import { useUi } from '../../store/ui'
import { useShareStore, type ShareStoreState } from './share-store'
import { batchDisableAll, batchEnableAll, batchRevokeAll, buildExpiryMenuItems, buildShareFolderMenuItems } from './share-batch-bar-actions'

export function ShareBatchBar({
    selectedCount,
    onClearSelection,
}: {
    selectedCount: number
    onClearSelection: () => void
}) {
    const toast = useUi((s) => s.toast)
    const batchToggle = useShareStore((s) => s.batchToggle)
    const batchMoveToFolder = useShareStore((s) => s.batchMoveToFolder)
    const folders = useShareStore((s) => s.folders)
    const selectedNoteIds = useShareStore((s) => s.selectedNoteIds)
    const batchBusy = useShareStore((s) => s.batchBusy)

    const [isExpiryMenuOpen, setIsExpiryMenuOpen] = useState(false)
    const expiryButtonRef = useRef<HTMLButtonElement>(null)
    const [isFolderMenuOpen, setIsFolderMenuOpen] = useState(false)
    const folderButtonRef = useRef<HTMLButtonElement>(null)

    if (selectedCount === 0) return null

    const noteIds = Array.from(selectedNoteIds)
    const bundle: ShareBatchBarBundle = {
        batchToggle, batchMoveToFolder, noteIds, selectedCount, batchBusy, toast,
        isExpiryMenuOpen, setIsExpiryMenuOpen, expiryButtonRef, isFolderMenuOpen,
        setIsFolderMenuOpen, folderButtonRef,
        expiryMenuItems: buildExpiryMenuItems(batchToggle, noteIds),
        folderMenuItems: buildShareFolderMenuItems(folders, noteIds, batchMoveToFolder, selectedCount, () => setIsFolderMenuOpen(false), toast),
    }

    return (
        <div className="absolute bottom-6 left-1/2 z-[var(--z-float)] flex -translate-x-1/2 items-center gap-2 rounded-full border border-[var(--border-default)] bg-[var(--bg-overlay)] px-4 py-2 shadow-2xl backdrop-blur-md shrink-0 whitespace-nowrap max-w-[calc(100%-2rem)]">
            <span className="shrink-0 whitespace-nowrap text-[length:var(--text-12)] font-medium text-[var(--text-primary)]">
                {t('share.selected_count', { count: selectedCount })}
            </span>

            <div className="h-4 w-px shrink-0 bg-[var(--border-default)]" />

            <ShareBatchActionButton bundle={bundle} icon={<Play size={13} className="text-[var(--success)]" />} label={t('share.batch_enable')} onClick={() => void batchEnableAll(bundle.batchToggle, bundle.noteIds)} />
            <ShareBatchActionButton bundle={bundle} icon={<Square size={12} className="text-[var(--warning)]" />} label={t('share.batch_disable')} onClick={() => void batchDisableAll(bundle.batchToggle, bundle.noteIds)} />
            <ShareBatchActionButton bundle={bundle} icon={<FolderInput size={13} />} label={t('share.batch_move_to_folder')} buttonRef={bundle.folderButtonRef} onClick={() => bundle.setIsFolderMenuOpen(true)} />
            <ShareBatchActionButton bundle={bundle} icon={<Calendar size={13} />} label={t('share.batch_set_expiry')} buttonRef={bundle.expiryButtonRef} onClick={() => bundle.setIsExpiryMenuOpen(true)} />
            <ShareBatchActionButton bundle={bundle} icon={<Trash2 size={13} />} label={t('share.batch_revoke')} danger onClick={() => void batchRevokeAll(bundle.batchToggle, bundle.noteIds, bundle.selectedCount)} />

            <div className="h-4 w-px shrink-0 bg-[var(--border-default)]" />

            <button type="button" onClick={onClearSelection} className="shrink-0 rounded-full p-1 text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">
                <X size={14} />
            </button>

            {bundle.isExpiryMenuOpen && <Menu open={bundle.isExpiryMenuOpen} onClose={() => bundle.setIsExpiryMenuOpen(false)} items={bundle.expiryMenuItems} anchor={bundle.expiryButtonRef} />}
            {bundle.isFolderMenuOpen && <Menu open={bundle.isFolderMenuOpen} onClose={() => bundle.setIsFolderMenuOpen(false)} items={bundle.folderMenuItems} anchor={bundle.folderButtonRef} />}
        </div>
    )
}

interface ShareBatchBarBundle {
    batchToggle: ShareStoreState['batchToggle']
    batchMoveToFolder: ShareStoreState['batchMoveToFolder']
    noteIds: string[]
    selectedCount: number
    batchBusy: boolean
    toast: UiState['toast']
    isExpiryMenuOpen: boolean
    setIsExpiryMenuOpen: (open: boolean) => void
    expiryButtonRef: RefObject<HTMLButtonElement | null>
    isFolderMenuOpen: boolean
    setIsFolderMenuOpen: (open: boolean) => void
    folderButtonRef: RefObject<HTMLButtonElement | null>
    expiryMenuItems: MenuItem[]
    folderMenuItems: MenuItem[]
}

function ShareBatchActionButton({
    bundle,
    icon,
    label,
    buttonRef,
    danger,
    onClick,
}: {
    bundle: ShareBatchBarBundle
    icon: ReactNode
    label: string
    buttonRef?: RefObject<HTMLButtonElement | null>
    danger?: boolean
    onClick: () => void
}) {
    return (
        <Button
            ref={buttonRef}
            size="sm"
            variant="ghost"
            disabled={bundle.batchBusy}
            className={danger ? 'shrink-0 whitespace-nowrap text-[var(--danger)] hover:bg-[var(--danger-subtle)]' : 'shrink-0 whitespace-nowrap'}
            icon={icon}
            onClick={onClick}
        >
            {label}
        </Button>
    )
}
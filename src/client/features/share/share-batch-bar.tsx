import { useRef, useState } from 'react'
import { Calendar, FolderClosed, FolderInput, Play, Square, Trash2, X } from 'lucide-react'
import { Button } from '../../components/primitives'
import { Menu, confirm, type MenuItem } from '../../components/overlay'
import { t } from '../../lib/i18n'
import { useUi } from '../../store/ui'
import { useShareStore } from './share-store'

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

  const handleEnableAll = async () => {
    await batchToggle('enable', noteIds)
  }

  const handleDisableAll = async () => {
    await batchToggle('disable', noteIds)
  }

  const handleRevokeAll = async () => {
    const ok = await confirm({
      title: t('share.batch_revoke_title', { count: selectedCount }),
      description: t('share.batch_revoke_confirm'),
      confirmLabel: t('share.revoke_link'),
      tone: 'danger',
    })
    if (!ok) return
    await batchToggle('revoke', noteIds)
  }

  const handleSetExpiry = async (millis: number | null) => {
    setIsExpiryMenuOpen(false)
    await batchToggle('expire', noteIds, millis)
  }

  const expiryMenuItems: MenuItem[] = [
    { id: 'perm', label: t('share.never_expires'), onSelect: () => void handleSetExpiry(null) },
    { id: '1d', label: t('share.1_day'), onSelect: () => void handleSetExpiry(24 * 3600000) },
    { id: '7d', label: t('share.7_days'), onSelect: () => void handleSetExpiry(7 * 24 * 3600000) },
    { id: '30d', label: t('share.30_days'), onSelect: () => void handleSetExpiry(30 * 24 * 3600000) },
  ]

  const folderMenuItems: MenuItem[] = [
    {
      id: 'root',
      label: t('share.no_folder'),
      icon: <FolderClosed size={13} className="text-[var(--text-quaternary)]" />,
      onSelect: async () => {
        setIsFolderMenuOpen(false)
        const ok = await batchMoveToFolder(noteIds, null)
        if (ok) {
          toast({ title: t('share.batch_move_success', { count: selectedCount }), tone: 'success' })
        }
      },
    },
    ...folders.map((f) => ({
      id: f.id,
      label: f.name,
      icon: (
        <span style={{ color: f.color ?? undefined }} className="shrink-0">
          <FolderClosed size={13} />
        </span>
      ),
      onSelect: async () => {
        setIsFolderMenuOpen(false)
        const ok = await batchMoveToFolder(noteIds, f.id)
        if (ok) {
          toast({ title: t('share.batch_move_success', { count: selectedCount }), tone: 'success' })
        }
      },
    })),
  ]

  return (
    <div className="absolute bottom-6 left-1/2 z-[var(--z-float)] flex -translate-x-1/2 items-center gap-2 rounded-full border border-[var(--border-default)] bg-[var(--bg-overlay)] px-4 py-2 shadow-2xl backdrop-blur-md shrink-0 whitespace-nowrap max-w-[calc(100%-2rem)]">
      <span className="shrink-0 whitespace-nowrap text-[length:var(--text-12)] font-medium text-[var(--text-primary)]">
        {t('share.selected_count', { count: selectedCount })}
      </span>

      <div className="h-4 w-px shrink-0 bg-[var(--border-default)]" />

      <Button
        size="sm"
        variant="ghost"
        disabled={batchBusy}
        className="shrink-0 whitespace-nowrap"
        icon={<Play size={13} className="text-[var(--success)]" />}
        onClick={() => void handleEnableAll()}
      >
        {t('share.batch_enable')}
      </Button>

      <Button
        size="sm"
        variant="ghost"
        disabled={batchBusy}
        className="shrink-0 whitespace-nowrap"
        icon={<Square size={12} className="text-[var(--warning)]" />}
        onClick={() => void handleDisableAll()}
      >
        {t('share.batch_disable')}
      </Button>

      <Button
        ref={folderButtonRef}
        size="sm"
        variant="ghost"
        disabled={batchBusy}
        className="shrink-0 whitespace-nowrap"
        icon={<FolderInput size={13} />}
        onClick={() => setIsFolderMenuOpen(true)}
      >
        {t('share.batch_move_to_folder')}
      </Button>

      <Button
        ref={expiryButtonRef}
        size="sm"
        variant="ghost"
        disabled={batchBusy}
        className="shrink-0 whitespace-nowrap"
        icon={<Calendar size={13} />}
        onClick={() => setIsExpiryMenuOpen(true)}
      >
        {t('share.batch_set_expiry')}
      </Button>

      <Button
        size="sm"
        variant="ghost"
        className="shrink-0 whitespace-nowrap text-[var(--danger)] hover:bg-[var(--danger-subtle)]"
        disabled={batchBusy}
        icon={<Trash2 size={13} />}
        onClick={() => void handleRevokeAll()}
      >
        {t('share.batch_revoke')}
      </Button>

      <div className="h-4 w-px shrink-0 bg-[var(--border-default)]" />

      <button
        type="button"
        onClick={onClearSelection}
        className="shrink-0 rounded-full p-1 text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
      >
        <X size={14} />
      </button>

      {isExpiryMenuOpen && (
        <Menu
          open={isExpiryMenuOpen}
          onClose={() => setIsExpiryMenuOpen(false)}
          items={expiryMenuItems}
          anchor={expiryButtonRef}
        />
      )}

      {isFolderMenuOpen && (
        <Menu
          open={isFolderMenuOpen}
          onClose={() => setIsFolderMenuOpen(false)}
          items={folderMenuItems}
          anchor={folderButtonRef}
        />
      )}
    </div>
  )
}

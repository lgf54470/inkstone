import { useRef, useState } from 'react'
import { Calendar, Play, Square, Trash2, X } from 'lucide-react'
import { Button } from '../../components/primitives'
import { Menu, confirm, type MenuItem } from '../../components/overlay'
import { t } from '../../lib/i18n'
import { useShareStore } from './share-store'

export function ShareBatchBar({
  selectedCount,
  onClearSelection,
}: {
  selectedCount: number
  onClearSelection: () => void
}) {
  const batchToggle = useShareStore((s) => s.batchToggle)
  const selectedNoteIds = useShareStore((s) => s.selectedNoteIds)
  const batchBusy = useShareStore((s) => s.batchBusy)

  const [expiryMenuOpen, setExpiryMenuOpen] = useState(false)
  const expiryButtonRef = useRef<HTMLButtonElement>(null)

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
    setExpiryMenuOpen(false)
    await batchToggle('expire', noteIds, millis)
  }

  const expiryMenuItems: MenuItem[] = [
    { id: 'perm', label: t('share.never_expires'), onSelect: () => void handleSetExpiry(null) },
    { id: '1d', label: t('share.1_day'), onSelect: () => void handleSetExpiry(24 * 3600000) },
    { id: '7d', label: t('share.7_days'), onSelect: () => void handleSetExpiry(7 * 24 * 3600000) },
    { id: '30d', label: t('share.30_days'), onSelect: () => void handleSetExpiry(30 * 24 * 3600000) },
  ]

  return (
    <div className="absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border border-[var(--border-default)] bg-[var(--bg-overlay)] px-4 py-2 shadow-2xl backdrop-blur-md">
      <span className="text-[12px] font-medium text-[var(--text-primary)]">
        {t('share.selected_count', { count: selectedCount })}
      </span>

      <div className="h-4 w-px bg-[var(--border-default)]" />

      <Button
        size="sm"
        variant="ghost"
        disabled={batchBusy}
        icon={<Play size={13} className="text-[var(--success)]" />}
        onClick={() => void handleEnableAll()}
      >
        {t('share.batch_enable')}
      </Button>

      <Button
        size="sm"
        variant="ghost"
        disabled={batchBusy}
        icon={<Square size={12} className="text-[var(--warning)]" />}
        onClick={() => void handleDisableAll()}
      >
        {t('share.batch_disable')}
      </Button>

      <Button
        ref={expiryButtonRef}
        size="sm"
        variant="ghost"
        disabled={batchBusy}
        icon={<Calendar size={13} />}
        onClick={() => setExpiryMenuOpen(true)}
      >
        {t('share.batch_set_expiry')}
      </Button>

      <Button
        size="sm"
        variant="ghost"
        className="text-[var(--danger)] hover:bg-[var(--danger-subtle)]"
        disabled={batchBusy}
        icon={<Trash2 size={13} />}
        onClick={() => void handleRevokeAll()}
      >
        {t('share.batch_revoke')}
      </Button>

      <div className="h-4 w-px bg-[var(--border-default)]" />

      <button
        type="button"
        onClick={onClearSelection}
        className="rounded-full p-1 text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
      >
        <X size={14} />
      </button>

      {expiryMenuOpen && (
        <Menu
          open={expiryMenuOpen}
          onClose={() => setExpiryMenuOpen(false)}
          items={expiryMenuItems}
          anchor={expiryButtonRef}
        />
      )}
    </div>
  )
}

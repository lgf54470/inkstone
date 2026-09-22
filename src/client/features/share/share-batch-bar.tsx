import { useRef, useState, type RefObject } from 'react'
import type { ReactNode } from 'react'
import type { ShareInfo } from '@shared/types'
import { Calendar, Copy, Download, FolderInput, Play, QrCode, Square, Tag, Trash2, X } from 'lucide-react'
import { normalizeChannelToken } from '@shared/share-channel'
import { Button, IconButton } from '../../components/primitives'
import { Input } from '../../components/form'
import { Menu, type MenuItem } from '../../components/overlay'
import { t } from '../../lib/i18n'
import type { UiState } from '../../store/ui'
import { useUi } from '../../store/ui'
import { useShareStore, type ShareStoreState } from './share-store'
import { batchDisableAll, batchEnableAll, batchRevokeAll, buildExpiryMenuItems, buildRenewalMenuItems, buildShareFolderMenuItems } from './share-batch-bar-actions'
import { copyShareLinksFlow, exportShareLinksFlow, printShareQrSheetFlow, selectedShareRows } from './share-batch-links'
import { useShareQrSheet, type ShareQrSheetRequest } from './share-qr-sheet'

export function ShareBatchBar({
  selectedCount,
  onClearSelection,
}: {
  selectedCount: number
  onClearSelection: () => void
}) {
  const bundle = useShareBatchBarBundle(selectedCount)
  if (selectedCount === 0) return null

  return (
    <div className='absolute bottom-6 left-1/2 z-[var(--z-float)] flex max-w-[calc(100%-2rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-full border border-[var(--border-default)] bg-[var(--bg-overlay)] px-4 py-2 shadow-[var(--shadow-pop)] backdrop-blur-md'>
      <span role='status' className='shrink-0 whitespace-nowrap text-[length:var(--text-12)] font-medium text-[var(--text-primary)]'>
        {t('share.selected_count', { count: selectedCount })}
      </span>

      <div className='h-4 w-px shrink-0 bg-[var(--border-default)]' />

      <ShareBatchActionButton bundle={bundle} icon={<Play size={13} className='text-[var(--success)]' />} label={t('share.batch_enable')} onClick={() => void batchEnableAll(bundle.batchToggle, bundle.noteIds)} />
      <ShareBatchActionButton bundle={bundle} icon={<Square size={12} className='text-[var(--warning)]' />} label={t('share.batch_disable')} onClick={() => void batchDisableAll(bundle.batchToggle, bundle.noteIds)} />
      <BatchChannelField bundle={bundle} />
      <ShareBatchActionButton bundle={bundle} icon={<Copy size={13} />} label={t('share.batch_copy_links')} onClick={() => void copyShareLinksFlow({ rows: bundle.selectedRows, missing: bundle.missingRows, toast: bundle.toast, channel: bundle.channel })} />
      <ShareBatchActionButton bundle={bundle} icon={<Download size={13} />} label={t('share.batch_export_links')} onClick={() => exportShareLinksFlow({ rows: bundle.selectedRows, missing: bundle.missingRows, toast: bundle.toast, channel: bundle.channel })} />
      <ShareBatchActionButton bundle={bundle} icon={<QrCode size={13} />} label={t('share.batch_print_qr')} onClick={() => printShareQrSheetFlow({ rows: bundle.selectedRows, missing: bundle.missingRows, channel: bundle.channel, requestPrint: bundle.requestQrSheet, toast: bundle.toast })} />
      <ShareBatchActionButton bundle={bundle} icon={<FolderInput size={13} />} label={t('share.batch_move_to_folder')} buttonRef={bundle.folderButtonRef} hasPopup ariaExpanded={bundle.isFolderMenuOpen} onClick={() => bundle.setIsFolderMenuOpen(true)} />
      <ShareBatchActionButton bundle={bundle} icon={<Calendar size={13} />} label={t('share.batch_set_expiry')} buttonRef={bundle.expiryButtonRef} hasPopup ariaExpanded={bundle.isExpiryMenuOpen} onClick={() => bundle.setIsExpiryMenuOpen(true)} />
      <ShareBatchActionButton bundle={bundle} icon={<Trash2 size={13} />} label={t('share.batch_revoke')} danger onClick={() => void batchRevokeAll(bundle.batchToggle, bundle.noteIds, bundle.selectedCount)} />

      <div className='h-4 w-px shrink-0 bg-[var(--border-default)]' />

      <IconButton size='sm' label={t('common.clear_selection')} onClick={onClearSelection}>
        <X size={14} />
      </IconButton>

      {bundle.isExpiryMenuOpen && <Menu open={bundle.isExpiryMenuOpen} onClose={() => bundle.setIsExpiryMenuOpen(false)} items={bundle.expiryMenuItems} anchor={bundle.expiryButtonRef} />}
      {bundle.isFolderMenuOpen && <Menu open={bundle.isFolderMenuOpen} onClose={() => bundle.setIsFolderMenuOpen(false)} items={bundle.folderMenuItems} anchor={bundle.folderButtonRef} />}

      {bundle.qrSheet}
    </div>
  )
}

/**
 * The bar's props, read from the store and the menu lists built from them. It runs even when
 * nothing is selected (hooks cannot be conditional) so the early return stays where it is;
 * the menu items it assembles for an empty selection are simply never drawn.
 */
function useShareBatchBarBundle(selectedCount: number): ShareBatchBarBundle {
  const toast = useUi((s) => s.toast)
  const batchToggle = useShareStore((s) => s.batchToggle)
  const batchExtend = useShareStore((s) => s.batchExtend)
  const batchMoveToFolder = useShareStore((s) => s.batchMoveToFolder)
  const folders = useShareStore((s) => s.folders)
  const shares = useShareStore((s) => s.shares)
  const selectedNoteIds = useShareStore((s) => s.selectedNoteIds)
  const batchBusy = useShareStore((s) => s.batchBusy)

  // One field for both link actions: a marker describes the place the links are going, so copying
  // and exporting the same selection should not be able to disagree about it.
  const [channel, setChannel] = useState('')
  const [isExpiryMenuOpen, setIsExpiryMenuOpen] = useState(false)
  const expiryButtonRef = useRef<HTMLButtonElement>(null)
  const [isFolderMenuOpen, setIsFolderMenuOpen] = useState(false)
  const folderButtonRef = useRef<HTMLButtonElement>(null)
  // The sheet mounts into the document, not into this bar, so the only thing it takes from here is
  // the request; it is unmounted again when its print dialog closes.
  const qrSheet = useShareQrSheet()

  const noteIds = Array.from(selectedNoteIds)
  const { rows, missing } = selectedShareRows(shares, selectedNoteIds)
  return {
    batchToggle, batchMoveToFolder, noteIds, selectedCount, batchBusy, toast,
    selectedRows: rows, missingRows: missing, channel, setChannel,
    qrSheet: qrSheet.sheet, requestQrSheet: qrSheet.requestPrint,
    isExpiryMenuOpen, setIsExpiryMenuOpen, expiryButtonRef, isFolderMenuOpen,
    setIsFolderMenuOpen, folderButtonRef,
    expiryMenuItems: [
      ...buildExpiryMenuItems(batchToggle, noteIds),
      ...buildRenewalMenuItems({ batchExtend, noteIds, toast }),
    ],
    folderMenuItems: buildShareFolderMenuItems(folders, noteIds, batchMoveToFolder, selectedCount, () => setIsFolderMenuOpen(false), toast),
  }
}

interface ShareBatchBarBundle {
  batchToggle: ShareStoreState['batchToggle']
  batchMoveToFolder: ShareStoreState['batchMoveToFolder']
  noteIds: string[]
  selectedRows: ShareInfo[]
  missingRows: number
  channel: string
  setChannel: (value: string) => void
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
  qrSheet: ReactNode
  requestQrSheet: (request: ShareQrSheetRequest) => void
}

/**
 * The optional `?ref=` marker for the links about to be copied or exported (ADR-0004). Compact on
 * purpose: it lives inside the floating bar rather than in a dialog, so attaching a marker to a
 * batch of links costs no extra step for the owner. An unusable value is marked invalid instead of
 * being repaired — the links would otherwise quietly go out without the marker they asked for.
 */
function BatchChannelField({ bundle }: { bundle: ShareBatchBarBundle }) {
  const isRejected = bundle.channel !== '' && !normalizeChannelToken(bundle.channel)
  return (
    <Input
      value={bundle.channel}
      onChange={(event) => bundle.setChannel(event.target.value)}
      disabled={bundle.batchBusy}
      invalid={isRejected}
      aria-label={t('share.channel_input_label')}
      title={isRejected ? t('share.channel_input_invalid') : t('share.channel_input_hint')}
      placeholder={t('share.channel_placeholder')}
      leading={<Tag size={12} />}
      autoComplete='off'
      spellCheck={false}
      className='h-7 w-32 shrink-0 text-[length:var(--text-12)] md:h-7'
    />
  )
}

function ShareBatchActionButton({
  bundle,
  icon,
  label,
  buttonRef,
  danger,
  hasPopup,
  ariaExpanded,
  onClick,
}: {
  bundle: ShareBatchBarBundle
  icon: ReactNode
  label: string
  buttonRef?: RefObject<HTMLButtonElement | null>
  danger?: boolean
  hasPopup?: boolean
  ariaExpanded?: boolean
  onClick: () => void
}) {
  return (
    <Button
      ref={buttonRef}
      size='sm'
      variant='ghost'
      disabled={bundle.batchBusy}
      className={danger ? 'shrink-0 whitespace-nowrap text-[var(--danger)] hover:bg-[var(--danger-soft)]' : 'shrink-0 whitespace-nowrap'}
      icon={icon}
      aria-haspopup={hasPopup ? 'menu' : undefined}
      aria-expanded={ariaExpanded}
      onClick={onClick}
    >
      {label}
    </Button>
  )
}
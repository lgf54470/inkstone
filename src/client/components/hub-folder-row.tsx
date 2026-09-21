import { ChevronDown, ChevronRight, FolderClosed, FolderOpen, MoreHorizontal } from 'lucide-react'
import { cn } from '../lib/cn'
import { t } from '../lib/i18n'
import { Switch } from './form'
import { Tooltip } from './overlay'
import { IconButton } from './primitives'
import type { FolderRowProps, HubFolderLabels, HubFolderNodeLike } from './use-hub-folder-item'

const TREE_INDENT_BASE = 8
const TREE_INDENT_STEP = 12
// Only drawn on hover at desktop width, always in the tab order: the `focus-visible` arm is what
// keeps a keyboard user from tabbing into an invisible control, and the phone breakpoint keeps the
// icons out where there is no hover to reveal them (features/tags/tag-row.tsx spells the same one).
const ROW_ACTION_CLASS = 'opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100'

function RenameInput({ value, fallbackName, inputRef, onNameChange, onFinishRename }: {
  value: string
  fallbackName: string
  inputRef: React.RefObject<HTMLInputElement | null>
  onNameChange: (value: string) => void
  onFinishRename: (nextName: string) => void
}) {
  const commit = () => onFinishRename(value.trim() || fallbackName)
  return (
    <input
      ref={inputRef}
      type='text'
      value={value}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onNameChange(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') onFinishRename(fallbackName)
      }}
      className='flex-1 bg-[var(--bg-surface)] px-1 py-0.5 text-xs text-[var(--text-primary)] border border-[var(--border-focus)] rounded outline-hidden'
    />
  )
}

function FolderCount({ safeTotal, safeEnabled }: {
  safeTotal: number
  safeEnabled: number
}) {
  return (
    <span className='tabular text-[length:var(--text-10)] text-[var(--text-quaternary)] shrink-0'>
      {safeTotal === 0 ? (
        '0'
      ) : safeEnabled < safeTotal ? (
        <>
          <span
            className={
              safeEnabled > 0
                ? 'text-[var(--warning)] font-medium'
                : 'text-[var(--text-quaternary)]'
            }
          >
            {safeEnabled}
          </span>
          /{safeTotal}
        </>
      ) : (
        safeTotal
      )}
    </span>
  )
}

function FolderToggle({ safeTotal, isChecked, batchBusy, labels, onBatchToggle, onEmptyToast }: {
  safeTotal: number
  isChecked: boolean
  batchBusy: boolean
  labels: HubFolderLabels
  onBatchToggle: (enabled: boolean) => void
  onEmptyToast: () => void
}) {
  return (
    <div
      onClick={(e) => {
        e.stopPropagation()
        if (safeTotal === 0) {
          onEmptyToast()
        }
      }}
      className='flex items-center pl-1 shrink-0'
    >
      <Tooltip
        label={
          safeTotal === 0
            ? labels.emptyHint
            : isChecked
              ? labels.disable
              : labels.enable
        }
        side='top'
      >
        <div>
          <Switch
            checked={isChecked}
            disabled={batchBusy || safeTotal === 0}
            onChange={(nextChecked) => onBatchToggle(nextChecked)}
            label={labels.toggleLabel}
          />
        </div>
      </Tooltip>
    </div>
  )
}

function FolderLeading({ node, isExpanded, onToggleExpand }: {
  node: HubFolderNodeLike
  isExpanded: boolean
  onToggleExpand: (e: React.MouseEvent) => void
}) {
  return (<>
    {node.children.length > 0 ? (
      <button
        type='button'
        aria-label={isExpanded ? t('sidebar.collapse') : t('sidebar.expand')}
        onClick={onToggleExpand}
        className='p-0.5 text-[var(--text-quaternary)] hover:text-[var(--text-secondary)]'
      >
        {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </button>
    ) : (
      <span className='w-3' />
    )}
    <span
      style={{ color: node.folder.color ?? undefined }}
      className={cn('shrink-0', !node.folder.color && 'text-[var(--text-quaternary)]')}
    >
      {isExpanded ? <FolderOpen size={13} /> : <FolderClosed size={13} />}
    </span>
  </>)
}

function FolderMoreButton({ moreButtonRef, onToggleMenu }: {
  moreButtonRef: React.RefObject<HTMLButtonElement | null>
  onToggleMenu: () => void
}) {
  return (
    <IconButton
      ref={moreButtonRef}
      label={t('common.more_actions')}
      size='sm'
      onClick={(e) => {
        e.stopPropagation()
        onToggleMenu()
      }}
      className={ROW_ACTION_CLASS}
    >
      <MoreHorizontal size={12} />
    </IconButton>
  )
}

export function FolderRow({ node, isExpanded, isSelected, isRenaming, isDragOver, batchBusy, labels, counts, nameInput, refs, handlers }: FolderRowProps) {
  return (
    <div className='flex flex-col'>
      <div
        onContextMenu={handlers.onContextMenu}
        onDragOver={handlers.onDragOver}
        onDragLeave={handlers.onDragLeave}
        onDrop={handlers.onDrop}
        style={{ paddingLeft: `${TREE_INDENT_BASE + node.depth * TREE_INDENT_STEP}px` }}
        className={cn(
          'group relative flex h-8 items-center gap-1.5 rounded-[var(--r-md)] pr-2 text-[length:var(--text-12)] font-medium transition-colors',
          isSelected
            ? 'bg-[var(--accent-soft)] text-[var(--accent)] font-semibold'
            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
          isDragOver && 'bg-[var(--accent-soft)] ring-1 ring-[var(--accent)]',
        )}
      >
        <FolderLeading node={node} isExpanded={isExpanded} onToggleExpand={handlers.onToggleExpand} />
        {isRenaming ? (
          <RenameInput value={nameInput} fallbackName={node.folder.name} inputRef={refs.inputRef} onNameChange={handlers.onNameChange} onFinishRename={handlers.onFinishRename} />
        ) : (
          // Selecting the folder is the row's one control, so it is a real button rather than a
          // `div[role=button]` with focusable children (axe rejects that shape as
          // `nested-interactive`, SH-93). Everything beside it — the toggle, the count, the menu
          // button — stays a sibling of the button, not a child of it.
          <button type='button' onClick={handlers.onSelect} className='min-w-0 flex-1 truncate text-left'>
            {node.folder.name}
          </button>
        )}
        <FolderCount safeTotal={counts.safeTotal} safeEnabled={counts.safeEnabled} />
        <FolderToggle safeTotal={counts.safeTotal} isChecked={counts.isChecked} batchBusy={batchBusy} labels={labels} onBatchToggle={handlers.onBatchToggle} onEmptyToast={handlers.onEmptyToast} />
        <FolderMoreButton moreButtonRef={refs.moreButtonRef} onToggleMenu={handlers.onToggleMenu} />
      </div>
    </div>
  )
}
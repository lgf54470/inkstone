import { ChevronDown, ChevronRight, FolderClosed, FolderOpen, MoreHorizontal } from 'lucide-react';
import { cn } from '../lib/cn';
import { Switch } from './form';
import { Tooltip } from './overlay';
import type { FolderRowProps, HubFolderLabels, HubFolderNodeLike } from './use-hub-folder-item';

function rowKeyDown(select: () => void) {
    return (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            select()
        }
    }
}

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
            type="text"
            value={value}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onNameChange(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
                if (e.key === 'Enter') commit()
                if (e.key === 'Escape') onFinishRename(fallbackName)
            }}
            className="flex-1 bg-[var(--bg-surface)] px-1 py-0.5 text-xs text-[var(--text-primary)] border border-[var(--border-focus)] rounded outline-hidden"
        />
    )
}

function FolderCount({ safeTotal, safeEnabled }: {
    safeTotal: number
    safeEnabled: number
}) {
    return (
        <span className="tabular text-[length:var(--text-10)] text-[var(--text-quaternary)] shrink-0">
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
            className="flex items-center pl-1 shrink-0"
        >
            <Tooltip
                label={
                    safeTotal === 0
                        ? labels.emptyHint
                        : isChecked
                            ? labels.disable
                            : labels.enable
                }
                side="top"
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
                type="button"
                onClick={onToggleExpand}
                className="p-0.5 text-[var(--text-quaternary)] hover:text-[var(--text-secondary)]"
            >
                {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
        ) : (
            <span className="w-3" />
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
        <button
            ref={moreButtonRef}
            type="button"
            onClick={(e) => {
                e.stopPropagation()
                onToggleMenu()
            }}
            className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-[var(--text-quaternary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-sunken)] transition-opacity shrink-0"
        >
            <MoreHorizontal size={12} />
        </button>
    )
}

export function FolderRow({ node, isExpanded, isSelected, isRenaming, isDragOver, batchBusy, labels, counts, nameInput, refs, handlers }: FolderRowProps) {
    return (
        <div className="flex flex-col">
            <div
                role="button"
                tabIndex={0}
                onClick={handlers.onSelect}
                onContextMenu={handlers.onContextMenu}
                onDragOver={handlers.onDragOver}
                onDragLeave={handlers.onDragLeave}
                onDrop={handlers.onDrop}
                onKeyDown={rowKeyDown(handlers.onSelect)}
                style={{ paddingLeft: `${8 + node.depth * 12}px` }}
                className={cn(
                    'group relative flex h-8 items-center gap-1.5 rounded-[var(--r-md)] pr-2 text-[length:var(--text-12)] font-medium transition-colors cursor-pointer',
                    isSelected
                        ? 'bg-[var(--accent-subtle)] text-[var(--accent)] font-semibold'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
                    isDragOver && 'bg-[var(--accent-subtle)] ring-1 ring-[var(--accent)]',
                )}
            >
                <FolderLeading node={node} isExpanded={isExpanded} onToggleExpand={handlers.onToggleExpand} />
                {isRenaming ? (
                    <RenameInput value={nameInput} fallbackName={node.folder.name} inputRef={refs.inputRef} onNameChange={handlers.onNameChange} onFinishRename={handlers.onFinishRename} />
                ) : (
                    <span className="flex-1 truncate">{node.folder.name}</span>
                )}
                <FolderCount safeTotal={counts.safeTotal} safeEnabled={counts.safeEnabled} />
                <FolderToggle safeTotal={counts.safeTotal} isChecked={counts.isChecked} batchBusy={batchBusy} labels={labels} onBatchToggle={handlers.onBatchToggle} onEmptyToast={handlers.onEmptyToast} />
                <FolderMoreButton moreButtonRef={refs.moreButtonRef} onToggleMenu={handlers.onToggleMenu} />
            </div>
        </div>
    )
}
import { useMemo, useState } from 'react'
import { Check, FolderClosed, FolderMinus, FolderPlus, Search, Settings2 } from 'lucide-react'
import type { Folder } from '@shared/types'
import { useNotes } from '../../store/notes'
import { folderPathLabel } from '../../lib/folders'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'

interface FolderChoice {
  folder: Folder
  path: string
}

function buildFolderChoices(folders: Folder[], query: string): FolderChoice[] {
  const normalized = query.trim().toLocaleLowerCase()
  return folders
    .map((folder) => ({ folder, path: folderPathLabel(folders, folder.id) }))
    .filter(({ path }) => !normalized || path.toLocaleLowerCase().includes(normalized))
    .sort((a, b) => a.path.localeCompare(b.path))
}

function MoveSearchField({
  query,
  onQueryChange,
  onSubmitFirst,
}: {
  query: string
  onQueryChange: (query: string) => void
  onSubmitFirst: () => void
}) {
  return (
    <div className="px-2 pb-2 pt-0.5">
      <div className="relative flex items-center border-b-2 border-[var(--accent)] pb-1">
        <input
          autoFocus
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              onSubmitFirst()
            }
          }}
          className="w-full bg-transparent pr-6 text-[length:var(--text-12\\.5)] text-[var(--text-primary)] outline-none"
        />
        <Search size={14} className="pointer-events-none absolute right-0 text-[var(--text-quaternary)]" />
      </div>
    </div>
  )
}

function RemoveFromFolderRow({ onRemove }: { onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className="flex w-full items-center gap-2 rounded-[var(--r-sm)] px-2 py-1.5 text-left text-[length:var(--text-12\\.5)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
    >
      <FolderMinus size={13} className="shrink-0 text-[var(--text-tertiary)]" />
      <span className="min-w-0 flex-1 truncate">{t('notes.remove_from_folder')}</span>
    </button>
  )
}

function FolderChoiceRow({
  choice,
  selected,
  onPick,
}: {
  choice: FolderChoice
  selected: boolean
  onPick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={cn(
        'group flex w-full items-center gap-2 rounded-[var(--r-sm)] px-2 py-1.5 text-left text-[length:var(--text-12\\.5)] transition-colors',
        selected
          ? 'bg-[var(--accent-soft)] font-medium text-[var(--text-primary)]'
          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
      )}
    >
      <span className="flex size-4 shrink-0 items-center justify-center" style={{ color: choice.folder.color ?? 'var(--text-tertiary)' }}>
        {choice.folder.icon ? (
          <span className="text-[length:var(--text-12)] leading-none">{choice.folder.icon}</span>
        ) : (
          <FolderClosed size={13} />
        )}
      </span>
      <span className="min-w-0 flex-1 truncate">{choice.path}</span>
      {selected && <Check size={13} className="shrink-0 text-[var(--accent)]" />}
    </button>
  )
}

function NoMatchHint() {
  return (
    <div className="px-2 py-5 text-center text-[length:var(--text-12)] text-[var(--text-quaternary)]">
      {t('folders.no_match')}
    </div>
  )
}

function SubmenuActions({ onCreateNew, onManageFolders }: { onCreateNew: () => void; onManageFolders: () => void }) {
  return (
    <div className="space-y-0.5 px-0.5">
      <button
        type="button"
        onClick={onCreateNew}
        className="flex w-full items-center gap-2 whitespace-nowrap rounded-[var(--r-sm)] px-2 py-1.5 text-left text-[length:var(--text-12\\.5)] text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)]"
      >
        <FolderPlus size={13} className="shrink-0 text-[var(--text-tertiary)]" />
        <span className="truncate">{t('folders.create_new')}</span>
      </button>

      <button
        type="button"
        onClick={onManageFolders}
        className="flex w-full items-center gap-2 rounded-[var(--r-sm)] px-2 py-1.5 text-left text-[length:var(--text-12\\.5)] text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)]"
      >
        <Settings2 size={13} className="shrink-0 text-[var(--text-tertiary)]" />
        <span>{t('folders.manage_folders')}</span>
      </button>
    </div>
  )
}

export function MoveToFolderSubmenu({
  currentFolderId,
  onSelectFolder,
  onCreateNew,
  onManageFolders,
  closeMenu,
}: {
  currentFolderId?: string | null
  onSelectFolder: (folderId: string | null) => void
  onCreateNew: () => void
  onManageFolders: () => void
  closeMenu: () => void
}) {
  const [query, setQuery] = useState('')
  const folders = useNotes((s) => s.folders ?? [])
  const choices = useMemo(() => buildFolderChoices(folders, query), [folders, query])
  const pickFolder = (folderId: string | null) => {
    onSelectFolder(folderId)
    closeMenu()
  }
  return (
    <div
      className="w-[248px] rounded-[var(--r-lg)] border border-[var(--border-default)] bg-[var(--bg-overlay)] p-1.5 shadow-[var(--shadow-pop)] outline-none"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-2 pt-1 pb-1.5 text-[length:var(--text-12\\.5)] font-medium text-[var(--text-secondary)]">
        {t('folders.move_to_header')}
      </div>

      <MoveSearchField
        query={query}
        onQueryChange={setQuery}
        onSubmitFirst={() => {
          if (choices.length > 0) pickFolder(choices[0].folder.id)
        }}
      />

      <div className="max-h-[220px] overflow-y-auto space-y-0.5 px-0.5">
        {currentFolderId !== null && currentFolderId !== undefined && !query.trim() && (
          <RemoveFromFolderRow onRemove={() => pickFolder(null)} />
        )}
        {choices.map((choice) => (
          <FolderChoiceRow key={choice.folder.id} choice={choice} selected={currentFolderId === choice.folder.id} onPick={() => pickFolder(choice.folder.id)} />
        ))}
        {choices.length === 0 && <NoMatchHint />}
      </div>

      <div role="separator" className="my-1 h-px bg-[var(--border-subtle)]" />

      <SubmenuActions
        onCreateNew={() => {
          closeMenu()
          onCreateNew()
        }}
        onManageFolders={() => {
          closeMenu()
          onManageFolders()
        }}
      />
    </div>
  )
}

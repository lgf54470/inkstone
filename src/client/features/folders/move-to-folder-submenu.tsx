import { useMemo, useState } from 'react';
import { Check, FolderClosed, FolderMinus, FolderPlus, Search, Settings2 } from 'lucide-react';
import { useNotes } from '../../store/notes';
import { folderPathLabel } from '../../lib/folders';
import { cn } from '../../lib/cn';
import { t } from '../../lib/i18n';

export function MoveToFolderSubmenu({
  currentFolderId,
  onSelectFolder,
  onCreateNew,
  onManageFolders,
  closeMenu,
}: {
  currentFolderId?: string | null;
  onSelectFolder: (folderId: string | null) => void;
  onCreateNew: () => void;
  onManageFolders: () => void;
  closeMenu: () => void;
}) {
  const [query, setQuery] = useState('');
  const folders = useNotes((s) => s.folders ?? []);

  const choices = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return (folders ?? [])
      .map((folder) => ({
        folder,
        path: folderPathLabel(folders, folder.id),
      }))
      .filter(({ path }) => !normalized || path.toLocaleLowerCase().includes(normalized))
      .sort((a, b) => a.path.localeCompare(b.path));
  }, [folders, query]);

  return (
    <div
      className="w-[248px] rounded-[var(--r-lg)] border border-[var(--border-default)] bg-[var(--bg-overlay)] p-1.5 shadow-[var(--shadow-pop)] outline-none"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="px-2 pt-1 pb-1.5 text-[length:var(--text-12\.5)] font-medium text-[var(--text-secondary)]">
        {t('folders.move_to_header')}
      </div>

      {/* Gmail-style underline search input */}
      <div className="px-2 pb-2 pt-0.5">
        <div className="relative flex items-center border-b-2 border-[var(--accent)] pb-1">
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && choices.length > 0) {
                e.preventDefault();
                onSelectFolder(choices[0].folder.id);
                closeMenu();
              }
            }}
            className="w-full bg-transparent pr-6 text-[length:var(--text-12\.5)] text-[var(--text-primary)] outline-none"
          />
          <Search
            size={14}
            className="pointer-events-none absolute right-0 text-[var(--text-quaternary)]"
          />
        </div>
      </div>

      {/* Folder list */}
      <div className="max-h-[220px] overflow-y-auto space-y-0.5 px-0.5">
        {currentFolderId !== null && currentFolderId !== undefined && !query.trim() && (
          <button
            type="button"
            onClick={() => {
              onSelectFolder(null);
              closeMenu();
            }}
            className="flex w-full items-center gap-2 rounded-[var(--r-sm)] px-2 py-1.5 text-left text-[length:var(--text-12\.5)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <FolderMinus size={13} className="shrink-0 text-[var(--text-tertiary)]" />
            <span className="min-w-0 flex-1 truncate">{t('notes.remove_from_folder')}</span>
          </button>
        )}

        {choices.map(({ folder, path }) => {
          const isSelected = currentFolderId === folder.id;
          return (
            <button
              key={folder.id}
              type="button"
              onClick={() => {
                onSelectFolder(folder.id);
                closeMenu();
              }}
              className={cn(
                'group flex w-full items-center gap-2 rounded-[var(--r-sm)] px-2 py-1.5 text-left text-[length:var(--text-12\.5)] transition-colors',
                isSelected
                  ? 'bg-[var(--accent-soft)] font-medium text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
              )}
            >
              <span
                className="flex size-4 shrink-0 items-center justify-center"
                style={{ color: folder.color ?? 'var(--text-tertiary)' }}
              >
                {folder.icon ? (
                  <span className="text-[length:var(--text-12)] leading-none">{folder.icon}</span>
                ) : (
                  <FolderClosed size={13} />
                )}
              </span>
              <span className="min-w-0 flex-1 truncate">{path}</span>
              {isSelected && <Check size={13} className="shrink-0 text-[var(--accent)]" />}
            </button>
          );
        })}

        {choices.length === 0 && (
          <div className="px-2 py-5 text-center text-[length:var(--text-12)] text-[var(--text-quaternary)]">
            {t('folders.no_match')}
          </div>
        )}
      </div>

      {/* Divider */}
      <div role="separator" className="my-1 h-px bg-[var(--border-subtle)]" />

      {/* Actions */}
      <div className="space-y-0.5 px-0.5">
        <button
          type="button"
          onClick={() => {
            closeMenu();
            onCreateNew();
          }}
          className="flex w-full items-center gap-2 whitespace-nowrap rounded-[var(--r-sm)] px-2 py-1.5 text-left text-[length:var(--text-12\.5)] text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)]"
        >
          <FolderPlus size={13} className="shrink-0 text-[var(--text-tertiary)]" />
          <span className="truncate">{t('folders.create_new')}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            closeMenu();
            onManageFolders();
          }}
          className="flex w-full items-center gap-2 rounded-[var(--r-sm)] px-2 py-1.5 text-left text-[length:var(--text-12\.5)] text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)]"
        >
          <Settings2 size={13} className="shrink-0 text-[var(--text-tertiary)]" />
          <span>{t('folders.manage_folders')}</span>
        </button>
      </div>
    </div>
  );
}

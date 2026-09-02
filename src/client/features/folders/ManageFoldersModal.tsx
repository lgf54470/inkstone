import { useMemo, useState } from 'react';
import {
  Check,
  ExternalLink,
  FolderClosed,
  FolderPlus,
  Palette,
  Pencil,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import type { Folder } from '@shared/types';
import { Modal, confirm } from '../../components/overlay';
import { Button, IconButton } from '../../components/primitives';
import { useNotes } from '../../store/notes';
import { selectNavigationProjection } from '../../store/notes/selectors';
import { useUi } from '../../store/ui';
import { folderPathLabel, openFolderView } from '../../lib/folders';
import { FolderAppearance } from './FolderPicker';
import { t } from '../../lib/i18n';

export function ManageFoldersModal({ onClose }: { onClose: () => void }) {
  const folders = useNotes((s) => s.folders ?? []);
  const createFolder = useNotes((s) => s.createFolder);
  const patchFolder = useNotes((s) => s.patchFolder);
  const deleteFolder = useNotes((s) => s.deleteFolder);
  const folderCounts = useNotes((s) => selectNavigationProjection(s.notes).folderCounts);
  const toast = useUi((s) => s.toast);

  const [query, setQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [appearanceFolder, setAppearanceFolder] = useState<Folder | null>(null);

  const choices = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return folders
      .map((folder) => ({
        folder,
        path: folderPathLabel(folders, folder.id),
      }))
      .filter(({ path }) => !normalized || path.toLocaleLowerCase().includes(normalized))
      .sort((a, b) => a.path.localeCompare(b.path));
  }, [folders, query]);

  const handleCreate = (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = newFolderName.trim();
    if (!trimmed) return;
    const newId = createFolder({ name: trimmed });
    if (newId) {
      toast({
        title: t('notes.created'),
        tone: 'success',
      });
    }
    setNewFolderName('');
    setIsCreating(false);
  };

  const handleSaveRename = (id: string) => {
    const trimmed = renameValue.trim();
    if (trimmed) {
      patchFolder(id, { name: trimmed });
    }
    setRenamingId(null);
  };

  const handleDelete = async (folder: Folder) => {
    const count = folderCounts.get(folder.id) ?? 0;
    const hasChildren = folders.some((f) => f.parentId === folder.id);
    const hasContent = count > 0 || hasChildren;
    const ok = await confirm({
      title: t('sidebar.delete_folder_value0', { value0: folder.name }),
      description: hasContent
        ? t('folders.delete_contents_move_up', { value0: count, value1: 0 })
        : t('sidebar.this_folder_is_empty'),
      confirmLabel: t('common.delete'),
      tone: 'danger',
    });
    if (ok) {
      deleteFolder(folder.id);
      toast({ title: t('notes.deleted'), tone: 'default' });
    }
  };

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={t('folders.manage_folders')}
        description={t('folders.manage_description')}
        width={640}
      >
        <div className="space-y-3 pt-1">
          {/* Controls bar: search and add */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-quaternary)]"
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('folders.search')}
                className="h-8 w-full rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-base)] pl-9 pr-3 text-[12.5px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-ring)]"
              />
            </div>
            {!isCreating && (
              <Button
                variant="primary"
                size="sm"
                icon={<FolderPlus size={14} className="shrink-0" />}
                onClick={() => {
                  setIsCreating(true);
                  setNewFolderName('');
                }}
                className="h-8 shrink-0"
              >
                {t('common.new_folder')}
              </Button>
            )}
          </div>

          {/* Inline create form */}
          {isCreating && (
            <form
              onSubmit={handleCreate}
              className="flex items-center gap-2 rounded-[var(--r-md)] border border-[var(--accent)] bg-[var(--accent-soft)]/25 p-2"
            >
              <FolderClosed size={16} className="ml-1 text-[var(--accent)] shrink-0" />
              <input
                autoFocus
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setIsCreating(false);
                }}
                placeholder={t('common.new_folder')}
                className="h-8 flex-1 rounded-[var(--r-sm)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-2.5 text-[12.5px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              />
              <Button
                variant="primary"
                size="sm"
                type="submit"
                disabled={!newFolderName.trim()}
                className="h-8 shrink-0"
              >
                {t('folders.create_new')}
              </Button>
              <IconButton
                label={t('common.cancel')}
                size="sm"
                type="button"
                onClick={() => setIsCreating(false)}
              >
                <X size={14} />
              </IconButton>
            </form>
          )}

          {/* Folder list */}
          <div className="max-h-[420px] overflow-y-auto space-y-1 divide-y divide-[var(--border-subtle)]/50">
            {choices.map(({ folder, path }) => {
              const count = folderCounts.get(folder.id) ?? 0;
              const isRenaming = renamingId === folder.id;

              return (
                <div
                  key={folder.id}
                  className="group flex items-center justify-between gap-3 rounded-[var(--r-md)] p-2 transition-colors hover:bg-[var(--bg-hover)]"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2.5">
                    {/* Appearance button/badge */}
                    <button
                      type="button"
                      onClick={() => setAppearanceFolder(folder)}
                      title={t('folders.appearance')}
                      className="flex size-7 shrink-0 items-center justify-center rounded-[var(--r-sm)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] transition-transform hover:scale-105"
                      style={{ color: folder.color ?? 'var(--text-tertiary)' }}
                    >
                      {folder.icon ? (
                        <span className="text-[14px] leading-none">{folder.icon}</span>
                      ) : (
                        <FolderClosed size={15} />
                      )}
                    </button>

                    {/* Name or Rename input */}
                    {isRenaming ? (
                      <div className="flex flex-1 items-center gap-1.5">
                        <input
                          autoFocus
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveRename(folder.id);
                            if (e.key === 'Escape') setRenamingId(null);
                          }}
                          className="h-7 flex-1 rounded-[var(--r-sm)] border border-[var(--accent)] bg-[var(--bg-surface)] px-2 text-[12.5px] outline-none"
                        />
                        <IconButton
                          label={t('common.save')}
                          size="sm"
                          onClick={() => handleSaveRename(folder.id)}
                        >
                          <Check size={13} className="text-[var(--accent)]" />
                        </IconButton>
                        <IconButton
                          label={t('common.cancel')}
                          size="sm"
                          onClick={() => setRenamingId(null)}
                        >
                          <X size={13} />
                        </IconButton>
                      </div>
                    ) : (
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[13px] font-medium text-[var(--text-primary)]">
                            {path}
                          </span>
                          <span className="shrink-0 text-[11px] text-[var(--text-quaternary)]">
                            {t('folders.notes_count', { value0: count })}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Action buttons */}
                  {!isRenaming && (
                    <div className="flex shrink-0 items-center gap-0.5 opacity-85 group-hover:opacity-100">
                      <IconButton
                        label={t('folders.open_folder')}
                        size="sm"
                        onClick={() => {
                          openFolderView(folders, folder.id);
                          onClose();
                        }}
                      >
                        <ExternalLink size={13} />
                      </IconButton>
                      <IconButton
                        label={t('sidebar.rename')}
                        size="sm"
                        onClick={() => {
                          setRenamingId(folder.id);
                          setRenameValue(folder.name);
                        }}
                      >
                        <Pencil size={13} />
                      </IconButton>
                      <IconButton
                        label={t('folders.appearance')}
                        size="sm"
                        onClick={() => setAppearanceFolder(folder)}
                      >
                        <Palette size={13} />
                      </IconButton>
                      <IconButton
                        label={t('common.delete')}
                        size="sm"
                        className="text-[var(--text-tertiary)] hover:text-[var(--danger)]"
                        onClick={() => handleDelete(folder)}
                      >
                        <Trash2 size={13} />
                      </IconButton>
                    </div>
                  )}
                </div>
              );
            })}

            {choices.length === 0 && (
              <div className="py-10 text-center text-[12.5px] text-[var(--text-quaternary)]">
                {query.trim() ? t('folders.no_match') : t('folders.no_folders')}
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* Sub-modal: Folder Appearance */}
      {appearanceFolder && (
        <FolderAppearance
          open={Boolean(appearanceFolder)}
          folder={appearanceFolder}
          onChange={(patch) => {
            patchFolder(appearanceFolder.id, patch);
          }}
          onClose={() => setAppearanceFolder(null)}
        />
      )}
    </>
  );
}

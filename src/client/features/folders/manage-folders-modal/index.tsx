import {
  Check, Download, ExternalLink, FolderClosed, FolderPlus, Inbox,
  LayoutTemplate, Palette, Pencil, Search, Smile, Trash2, X,
} from 'lucide-react';
import { ORGANIZER_COLORS } from '@shared/organizer-colors';
import { Modal, Tooltip } from '../../../components/overlay';
import { Button, IconButton } from '../../../components/primitives';
import { cn } from '../../../lib/cn';
import { errorMessage } from '../../../lib/errors';
import { openFolderView } from '../../../lib/folders';
import { setInboxFolderId } from '../../../lib/folder-prefs';
import { exportFolderAsZip } from '../../../lib/export-folder';
import { FolderTemplateModal } from '../folder-template-modal';
import { t } from '../../../lib/i18n';
import { COMMON_FOLDER_ICONS } from './constants';
import { useManageFoldersModal } from './use-manage-folders-modal';

export function ManageFoldersModal({ onClose }: { onClose: () => void }) {
  const {
    folders,
    patchFolder,
    folderCounts,
    toast,
    inboxFolderId,
    folderTemplates,
    templates,
    query,
    setQuery,
    isCreating,
    setIsCreating,
    newFolderName,
    setNewFolderName,
    renamingId,
    setRenamingId,
    renameValue,
    setRenameValue,
    colorPickerFolderId,
    setColorPickerFolderId,
    iconPickerFolderId,
    setIconPickerFolderId,
    templateFolder,
    setTemplateFolder,
    choices,
    emptyFolders,
    handleCleanEmpty,
    handleCreate,
    handleSaveRename,
    handleDelete,
  } = useManageFoldersModal();

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
                className="h-8 w-full rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-base)] pl-9 pr-3 text-[length:var(--text-12\.5)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-ring)]"
              />
            </div>
            {emptyFolders.length > 0 && !isCreating && (
              <Tooltip label={t('folders.clean_empty')}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void handleCleanEmpty()}
                  className="h-8 shrink-0 text-[var(--danger)] hover:bg-[var(--danger-soft)]"
                >
                  {t('folders.clean_empty_value0', { value0: emptyFolders.length })}
                </Button>
              </Tooltip>
            )}
            {!isCreating && (
              <Tooltip label={t('common.new_folder')}>
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
              </Tooltip>
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
                className="h-8 flex-1 rounded-[var(--r-sm)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-2.5 text-[length:var(--text-12\.5)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
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
              <Tooltip label={t('common.cancel')}>
                <IconButton
                  label={t('common.cancel')}
                  size="sm"
                  type="button"
                  onClick={() => setIsCreating(false)}
                >
                  <X size={14} />
                </IconButton>
              </Tooltip>
            </form>
          )}

          {/* Folder list */}
          <div className="max-h-[420px] overflow-y-auto space-y-1 divide-y divide-[var(--border-subtle)]/50">
            {choices.map(({ folder, path }) => {
              const count = folderCounts.get(folder.id) ?? 0;
              const isRenaming = renamingId === folder.id;
              const isInbox = inboxFolderId === folder.id;
              const boundTemplateId = folderTemplates[folder.id];
              const boundTemplate = boundTemplateId ? templates.find((t) => t.id === boundTemplateId) : null;
              const isColorPickerOpen = colorPickerFolderId === folder.id;
              const isIconPickerOpen = iconPickerFolderId === folder.id;

              return (
                <div key={folder.id} className="py-0.5">
                  <div className="group flex items-center justify-between gap-3 rounded-[var(--r-md)] p-2 transition-colors hover:bg-[var(--bg-hover)]">
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      {/* Icon button/badge */}
                      <Tooltip label={t('folders.icon')}>
                        <button
                          type="button"
                          onClick={() => {
                            setIconPickerFolderId((id) => (id === folder.id ? null : folder.id));
                            setColorPickerFolderId(null);
                          }}
                          className={cn(
                            'flex size-7 shrink-0 items-center justify-center rounded-[var(--r-sm)] border bg-[var(--bg-surface)] transition-all hover:scale-105',
                            isIconPickerOpen
                              ? 'border-[var(--accent)] ring-2 ring-[var(--accent-ring)]'
                              : 'border-[var(--border-subtle)]'
                          )}
                          style={{ color: folder.color ?? 'var(--text-tertiary)' }}
                        >
                          {folder.icon ? (
                            <span className="text-[length:var(--text-14)] leading-none">{folder.icon}</span>
                          ) : (
                            <FolderClosed size={15} />
                          )}
                        </button>
                      </Tooltip>

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
                            className="h-7 flex-1 rounded-[var(--r-sm)] border border-[var(--accent)] bg-[var(--bg-surface)] px-2 text-[length:var(--text-12\.5)] outline-none"
                          />
                          <Tooltip label={t('common.save')}>
                            <IconButton
                              label={t('common.save')}
                              size="sm"
                              onClick={() => handleSaveRename(folder.id)}
                            >
                              <Check size={13} className="text-[var(--accent)]" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip label={t('common.cancel')}>
                            <IconButton
                              label={t('common.cancel')}
                              size="sm"
                              onClick={() => setRenamingId(null)}
                            >
                              <X size={13} />
                            </IconButton>
                          </Tooltip>
                        </div>
                      ) : (
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-[length:var(--text-13)] font-medium text-[var(--text-primary)]">
                              {path}
                            </span>
                            {isInbox && (
                              <span className="inline-flex items-center gap-1 rounded bg-[var(--accent-soft)] px-1.5 py-0.5 text-[length:var(--text-10\.5)] font-medium text-[var(--accent)]">
                                <Inbox size={10.5} />
                                {t('folders.inbox')}
                              </span>
                            )}
                            {boundTemplate && (
                              <span
                                title={`${t('folders.default_template')}: ${boundTemplate.name}`}
                                className="inline-flex items-center gap-1 rounded bg-[var(--accent-soft)]/60 px-1.5 py-0.5 text-[length:var(--text-10\.5)] font-medium text-[var(--accent)]"
                              >
                                <LayoutTemplate size={10} />
                                <span className="max-w-[100px] truncate">{boundTemplate.name}</span>
                              </span>
                            )}
                            <span className="shrink-0 text-[length:var(--text-11)] text-[var(--text-quaternary)]">
                              {t('folders.notes_count', { value0: count })}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Action buttons */}
                    {!isRenaming && (
                      <div className="flex shrink-0 items-center gap-0.5 opacity-85 group-hover:opacity-100">
                        <Tooltip label={isInbox ? t('folders.unset_inbox') : t('folders.set_as_inbox')}>
                          <IconButton
                            label={isInbox ? t('folders.unset_inbox') : t('folders.set_as_inbox')}
                            size="sm"
                            className={isInbox ? 'text-[var(--accent)]' : undefined}
                            onClick={() => {
                              if (isInbox) {
                                setInboxFolderId(null);
                                toast({ title: t('folders.inbox_cleared_toast'), tone: 'default' });
                              } else {
                                setInboxFolderId(folder.id);
                                toast({
                                  title: t('folders.inbox_set_toast', { value0: folder.name }),
                                  tone: 'success',
                                });
                              }
                            }}
                          >
                            <Inbox size={13} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip label={t('folders.open_folder')}>
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
                        </Tooltip>
                        <Tooltip label={t('sidebar.rename')}>
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
                        </Tooltip>
                        <Tooltip label={t('folders.color')}>
                          <IconButton
                            label={t('folders.color')}
                            size="sm"
                            className={folder.color || isColorPickerOpen ? 'text-[var(--accent)]' : undefined}
                            onClick={() => {
                              setColorPickerFolderId((id) => (id === folder.id ? null : folder.id));
                              setIconPickerFolderId(null);
                            }}
                          >
                            <Palette size={13} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip label={boundTemplate ? `${t('folders.default_template')}: ${boundTemplate.name}` : t('folders.bind_template')}>
                          <IconButton
                            label={boundTemplate ? `${t('folders.default_template')}: ${boundTemplate.name}` : t('folders.bind_template')}
                            size="sm"
                            className={boundTemplate ? 'text-[var(--accent)]' : undefined}
                            onClick={() => setTemplateFolder(folder)}
                          >
                            <LayoutTemplate size={13} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip label={t('folders.export_zip')}>
                          <IconButton
                            label={t('folders.export_zip')}
                            size="sm"
                            onClick={async () => {
                              try {
                                const res = await exportFolderAsZip(folder.id);
                                if (res.count === 0) {
                                  toast({ title: t('folders.export_zip_empty'), tone: 'default' });
                                } else {
                                  toast({
                                    title: t('folders.export_zip_success', { value0: res.count }),
                                    tone: 'success',
                                  });
                                }
                              } catch (err) {
                                toast({
                                  title: t('common.export_failed'),
                                  description: errorMessage(err),
                                  tone: 'danger',
                                });
                              }
                            }}
                          >
                            <Download size={13} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip label={t('common.delete')}>
                          <IconButton
                            label={t('common.delete')}
                            size="sm"
                            className="text-[var(--text-tertiary)] hover:text-[var(--danger)]"
                            onClick={() => handleDelete(folder)}
                          >
                            <Trash2 size={13} />
                          </IconButton>
                        </Tooltip>
                      </div>
                    )}
                  </div>

                  {/* Inline Color Picker */}
                  {isColorPickerOpen && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-[var(--r-sm)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2">
                      <Tooltip label={t('folders.no_color')}>
                        <button
                          type="button"
                          aria-label={t('folders.no_color')}
                          onClick={() => {
                            patchFolder(folder.id, { color: null });
                            setColorPickerFolderId(null);
                          }}
                          className={cn(
                            'flex size-6 items-center justify-center rounded-full border bg-[var(--bg-base)] text-[var(--text-quaternary)] transition-transform hover:scale-110',
                            !folder.color
                              ? 'border-[var(--accent)] ring-2 ring-[var(--accent-ring)] text-[var(--accent)]'
                              : 'border-[var(--border-default)]'
                          )}
                        >
                          <FolderClosed size={12} />
                        </button>
                      </Tooltip>
                      {ORGANIZER_COLORS.map((color) => {
                        const isSelected = folder.color === color;
                        return (
                          <Tooltip key={color} label={color}>
                            <button
                              type="button"
                              aria-label={color}
                              onClick={() => {
                                patchFolder(folder.id, { color });
                                setColorPickerFolderId(null);
                              }}
                              className={cn(
                                'flex size-6 items-center justify-center rounded-full transition-transform hover:scale-110',
                                isSelected && 'ring-2 ring-[var(--accent-ring)] ring-offset-1 ring-offset-[var(--bg-surface)]'
                              )}
                              style={{ backgroundColor: color }}
                            >
                              {isSelected && <Check size={12} className="text-white drop-shadow-sm" />}
                            </button>
                          </Tooltip>
                        );
                      })}
                    </div>
                  )}

                  {/* Inline Icon Picker */}
                  {isIconPickerOpen && (
                    <div className="mt-2 space-y-2 rounded-[var(--r-sm)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Tooltip label={t('folders.no_icon')}>
                          <button
                            type="button"
                            aria-label={t('folders.no_icon')}
                            onClick={() => {
                              patchFolder(folder.id, { icon: null });
                              setIconPickerFolderId(null);
                            }}
                            className={cn(
                              'flex size-6 items-center justify-center rounded-[var(--r-xs)] border bg-[var(--bg-base)] text-[var(--text-quaternary)] transition-transform hover:scale-110',
                              !folder.icon
                                ? 'border-[var(--accent)] ring-2 ring-[var(--accent-ring)] text-[var(--accent)]'
                                : 'border-[var(--border-default)]'
                            )}
                          >
                            <FolderClosed size={12} />
                          </button>
                        </Tooltip>
                        {COMMON_FOLDER_ICONS.map((icon) => {
                          const isSelected = folder.icon === icon;
                          return (
                            <Tooltip key={icon} label={icon}>
                              <button
                                type="button"
                                aria-label={icon}
                                onClick={() => {
                                  patchFolder(folder.id, { icon });
                                  setIconPickerFolderId(null);
                                }}
                                className={cn(
                                  'flex size-6 items-center justify-center rounded-[var(--r-xs)] text-[length:var(--text-14)] leading-none transition-transform hover:scale-110',
                                  isSelected
                                    ? 'bg-[var(--accent-soft)] ring-2 ring-[var(--accent-ring)]'
                                    : 'hover:bg-[var(--bg-hover)]'
                                )}
                              >
                                {icon}
                              </button>
                            </Tooltip>
                          );
                        })}
                      </div>
                      <div className="relative flex items-center">
                        <Smile size={12} className="pointer-events-none absolute left-2 text-[var(--text-quaternary)]" />
                        <input
                          type="text"
                          placeholder={t('folders.custom_icon_placeholder')}
                          onChange={(e) => {
                            const trimmed = e.target.value.trim();
                            if (trimmed) {
                              const char = Array.from(trimmed)[0];
                              if (char) {
                                patchFolder(folder.id, { icon: char });
                                setIconPickerFolderId(null);
                              }
                            }
                          }}
                          className="h-6 w-48 rounded-[var(--r-xs)] border border-[var(--border-subtle)] bg-[var(--bg-base)] pl-6 pr-2 text-[length:var(--text-11\.5)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {choices.length === 0 && (
              <div className="py-10 text-center text-[length:var(--text-12\.5)] text-[var(--text-quaternary)]">
                {query.trim() ? t('folders.no_match') : t('folders.no_folders')}
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* Sub-modal: Folder Template */}
      {templateFolder && (
        <FolderTemplateModal
          folder={templateFolder}
          onClose={() => setTemplateFolder(null)}
        />
      )}
    </>
  );
}

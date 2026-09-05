import { useMemo, useState } from 'react';
import type { Folder } from '@shared/types';
import { confirm } from '../../../components/overlay';
import { useNotes } from '../../../store/notes';
import { selectNavigationProjection } from '../../../store/notes/selectors';
import { useUi } from '../../../store/ui';
import { setFolderTemplateId, setInboxFolderId, useFolderPreferences } from '../../../lib/folder-prefs';
import { folderPathLabel } from '../../../lib/folders';
import { useNoteTemplates } from '../../../store/note-templates';
import { t } from '../../../lib/i18n';

function folderChoices(folders: Folder[], query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  return folders
    .map((folder) => ({
      folder,
      path: folderPathLabel(folders, folder.id),
    }))
    .filter(({ path }) => !normalized || path.toLocaleLowerCase().includes(normalized))
    .sort((a, b) => a.path.localeCompare(b.path));
}

function emptyFoldersOf(folders: Folder[], folderCounts: ReadonlyMap<string, number>): Folder[] {
  return folders.filter((folder) => {
    const count = folderCounts.get(folder.id) ?? 0;
    const hasChildren = folders.some((f) => f.parentId === folder.id);
    return count === 0 && !hasChildren;
  });
}

function deleteFolderCleanup(folder: Folder, inboxFolderId: string | null, deleteFolder: (id: string) => unknown): void {
  if (inboxFolderId === folder.id) {
    setInboxFolderId(null);
  }
  setFolderTemplateId(folder.id, null);
  deleteFolder(folder.id);
}

async function confirmAndCleanEmpty(emptyFolders: Folder[], inboxFolderId: string | null, deleteFolder: (id: string) => unknown): Promise<boolean> {
  const ok = await confirm({
    title: t('folders.clean_empty'),
    description: t('folders.clean_empty_confirm_value0', { value0: emptyFolders.length }),
    tone: 'danger',
    confirmLabel: t('common.delete'),
  });
  if (!ok) return false;
  for (const folder of emptyFolders) {
    deleteFolderCleanup(folder, inboxFolderId, deleteFolder);
  }
  return true;
}

async function confirmFolderDelete(folder: Folder, folderCounts: ReadonlyMap<string, number>, folders: Folder[], inboxFolderId: string | null, deleteFolder: (id: string) => unknown): Promise<boolean> {
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
  if (!ok) return false;
  deleteFolderCleanup(folder, inboxFolderId, deleteFolder);
  return true;
}

function useFolderModalStore() {
  const folders = useNotes((s) => s.folders ?? []);
  const createFolder = useNotes((s) => s.createFolder);
  const patchFolder = useNotes((s) => s.patchFolder);
  const deleteFolder = useNotes((s) => s.deleteFolder);
  const folderCounts = useNotes((s) => selectNavigationProjection(s.notes).folderCounts);
  const toast = useUi((s) => s.toast);
  const { inboxFolderId, folderTemplates } = useFolderPreferences();
  const templates = useNoteTemplates((s) => s.templates);
  return { folders, createFolder, patchFolder, deleteFolder, folderCounts, toast, inboxFolderId, folderTemplates, templates };
}

function useFolderModalState() {
  const [query, setQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [colorPickerFolderId, setColorPickerFolderId] = useState<string | null>(null);
  const [iconPickerFolderId, setIconPickerFolderId] = useState<string | null>(null);
  const [templateFolder, setTemplateFolder] = useState<Folder | null>(null);
  return { query, setQuery, isCreating, setIsCreating, newFolderName, setNewFolderName, renamingId, setRenamingId, renameValue, setRenameValue, colorPickerFolderId, setColorPickerFolderId, iconPickerFolderId, setIconPickerFolderId, templateFolder, setTemplateFolder };
}

function useFolderDerived(folders: Folder[], folderCounts: ReadonlyMap<string, number>, query: string) {
  const choices = useMemo(() => folderChoices(folders, query), [folders, query]);
  const emptyFolders = useMemo(() => emptyFoldersOf(folders, folderCounts), [folders, folderCounts]);
  return { choices, emptyFolders };
}

export function useManageFoldersModal() {
  const store = useFolderModalStore();
  const state = useFolderModalState();
  const { folders, createFolder, patchFolder, deleteFolder, folderCounts, toast, inboxFolderId } = store;
  const { query } = state;
  const { choices, emptyFolders } = useFolderDerived(folders, folderCounts, query);

  const handleCleanEmpty = async () => {
    if (emptyFolders.length && await confirmAndCleanEmpty(emptyFolders, inboxFolderId, deleteFolder)) {
      toast({ title: t('folders.clean_empty_success', { value0: emptyFolders.length }), tone: 'success' });
    }
  };

  const handleCreate = (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = state.newFolderName.trim();
    if (!trimmed) return;
    if (createFolder({ name: trimmed })) {
      toast({ title: t('notes.created'), tone: 'success' });
    }
    state.setNewFolderName('');
    state.setIsCreating(false);
  };

  const handleSaveRename = (id: string) => {
    const trimmed = state.renameValue.trim();
    if (trimmed) {
      patchFolder(id, { name: trimmed });
    }
    state.setRenamingId(null);
  };

  const handleDelete = async (folder: Folder) => {
    if (await confirmFolderDelete(folder, folderCounts, folders, inboxFolderId, deleteFolder)) {
      toast({ title: t('notes.deleted'), tone: 'default' });
    }
  };

  return { ...store, ...state, choices, emptyFolders, handleCleanEmpty, handleCreate, handleSaveRename, handleDelete };
}
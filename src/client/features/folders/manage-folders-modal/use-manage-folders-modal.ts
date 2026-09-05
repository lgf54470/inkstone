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

export function useManageFoldersModal() {
  const folders = useNotes((s) => s.folders ?? []);
  const createFolder = useNotes((s) => s.createFolder);
  const patchFolder = useNotes((s) => s.patchFolder);
  const deleteFolder = useNotes((s) => s.deleteFolder);
  const folderCounts = useNotes((s) => selectNavigationProjection(s.notes).folderCounts);
  const toast = useUi((s) => s.toast);
  const { inboxFolderId, folderTemplates } = useFolderPreferences();
  const templates = useNoteTemplates((s) => s.templates);

  const [query, setQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [colorPickerFolderId, setColorPickerFolderId] = useState<string | null>(null);
  const [iconPickerFolderId, setIconPickerFolderId] = useState<string | null>(null);
  const [templateFolder, setTemplateFolder] = useState<Folder | null>(null);

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

  const emptyFolders = useMemo(() => {
    return folders.filter((folder) => {
      const count = folderCounts.get(folder.id) ?? 0;
      const hasChildren = folders.some((f) => f.parentId === folder.id);
      return count === 0 && !hasChildren;
    });
  }, [folders, folderCounts]);

  const handleCleanEmpty = async () => {
    if (!emptyFolders.length) return;
    const ok = await confirm({
      title: t('folders.clean_empty'),
      description: t('folders.clean_empty_confirm_value0', { value0: emptyFolders.length }),
      tone: 'danger',
      confirmLabel: t('common.delete'),
    });
    if (!ok) return;
    const count = emptyFolders.length;
    for (const folder of emptyFolders) {
      if (inboxFolderId === folder.id) {
        setInboxFolderId(null);
      }
      setFolderTemplateId(folder.id, null);
      deleteFolder(folder.id);
    }
    toast({
      title: t('folders.clean_empty_success', { value0: count }),
      tone: 'success',
    });
  };

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
      if (inboxFolderId === folder.id) {
        setInboxFolderId(null);
      }
      setFolderTemplateId(folder.id, null);
      deleteFolder(folder.id);
      toast({ title: t('notes.deleted'), tone: 'default' });
    }
  };

  return {
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
  };
}

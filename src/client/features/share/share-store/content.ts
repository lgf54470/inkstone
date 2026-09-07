import { api } from '../../../lib/api';
import type { ShareStoreState, SetShareStoreState } from './types';

export const shareContentActions = (set: SetShareStoreState, get: () => ShareStoreState): Pick<ShareStoreState, 'createFolder' | 'patchFolder' | 'deleteFolder' | 'createTag' | 'patchTag' | 'deleteTag'> => ({
  createFolder: (name, parentId, color, icon) => createFolderImpl(name, parentId, color, icon, set),
  patchFolder: (id, patch) => patchFolderImpl(id, patch, set),
  deleteFolder: (id) => deleteFolderImpl(id, set, get),
  createTag: (name, color) => createTagImpl(name, color, set),
  patchTag: (id, patch) => patchTagImpl(id, patch, set),
  deleteTag: (id) => deleteTagImpl(id, set, get),
});

async function createFolderImpl(
  name: Parameters<ShareStoreState['createFolder']>[0],
  parentId: Parameters<ShareStoreState['createFolder']>[1],
  color: Parameters<ShareStoreState['createFolder']>[2],
  icon: Parameters<ShareStoreState['createFolder']>[3],
  set: SetShareStoreState,
): Promise<ShareStoreState['folders'][number] | null> {
  try {
    const folder = await api.share.folders.create({ name, parentId, color, icon });
    set((s) => ({
      folders: [...s.folders, folder],
      globalStats: s.globalStats
        ? {
          ...s.globalStats,
          folderCounts: {
            ...s.globalStats.folderCounts,
            [folder.id]: { total: 0, shared: 0 },
          },
        }
        : null,
    }));
    return folder;
  } catch {
    return null;
  }
}

async function patchFolderImpl(
  id: Parameters<ShareStoreState['patchFolder']>[0],
  patch: Parameters<ShareStoreState['patchFolder']>[1],
  set: SetShareStoreState,
): Promise<ShareStoreState['folders'][number] | null> {
  try {
    const folder = await api.share.folders.patch(id, patch);
    set((s) => ({
      folders: s.folders.map((f) => (f.id === id ? folder : f)),
    }));
    return folder;
  } catch {
    return null;
  }
}

async function deleteFolderImpl(id: string, set: SetShareStoreState, get: () => ShareStoreState): Promise<boolean> {
  try {
    await api.share.folders.remove(id);
    set((s) => ({
      folders: s.folders.filter((f) => f.id !== id),
      folderId: s.folderId === id ? null : s.folderId,
    }));
    await get().loadShares();
    return true;
  } catch {
    return false;
  }
}

async function createTagImpl(
  name: Parameters<ShareStoreState['createTag']>[0],
  color: Parameters<ShareStoreState['createTag']>[1],
  set: SetShareStoreState,
): Promise<ShareStoreState['tags'][number] | null> {
  try {
    const tag = await api.share.tags.create({ name, color });
    set((s) => ({
      tags: s.tags.some((t) => t.id === tag.id) ? s.tags : [...s.tags, tag],
      globalStats: s.globalStats
        ? {
          ...s.globalStats,
          tagCounts: {
            ...s.globalStats.tagCounts,
            [tag.name]: { total: 0, shared: 0 },
          },
        }
        : null,
    }));
    return tag;
  } catch {
    return null;
  }
}

async function patchTagImpl(
  id: Parameters<ShareStoreState['patchTag']>[0],
  patch: Parameters<ShareStoreState['patchTag']>[1],
  set: SetShareStoreState,
): Promise<ShareStoreState['tags'][number] | null> {
  try {
    const tag = await api.share.tags.patch(id, patch);
    set((s) => ({
      tags: s.tags.map((t) => (t.id === id ? tag : t)),
    }));
    return tag;
  } catch {
    return null;
  }
}

async function deleteTagImpl(id: string, set: SetShareStoreState, get: () => ShareStoreState): Promise<boolean> {
  try {
    const tag = get().tags.find((t) => t.id === id);
    await api.share.tags.remove(id);
    set((s) => ({
      tags: s.tags.filter((t) => t.id !== id),
      tag: tag && s.tag === tag.name ? null : s.tag,
    }));
    await get().loadShares();
    return true;
  } catch {
    return false;
  }
}
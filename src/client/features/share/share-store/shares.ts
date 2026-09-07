import { api } from '../../../lib/api';
import { useNotes } from '../../../store/notes';
import type { ShareStoreState, SetShareStoreState } from './types';

export const shareSharesActions = (set: SetShareStoreState, get: () => ShareStoreState): Pick<ShareStoreState, 'batchToggleGroup' | 'toggleShare' | 'togglePin' | 'toggleStar' | 'batchToggle' | 'batchMoveToFolder' | 'batchFolderToggle' | 'batchTagToggle' | 'updateShare' | 'revokeShare'> => ({
  batchToggleGroup: (type, target, enabled) => batchToggleGroupImpl(type, target, enabled, set, get),
  toggleShare: (noteId, enabled) => toggleShareImpl(noteId, enabled, set, get),
  togglePin: (noteId) => togglePinImpl(noteId, set, get),
  toggleStar: (noteId) => toggleStarImpl(noteId, set, get),
  batchToggle: (action, noteIds, expiresIn, folderId) => batchToggleImpl(action, noteIds, expiresIn, folderId, set, get),
  batchMoveToFolder: (noteIds, folderId) => batchMoveToFolderImpl(noteIds, folderId, set, get),
  batchFolderToggle: (folderId, enabled) => batchFolderToggleImpl(folderId, enabled, set, get),
  batchTagToggle: (tag, enabled) => batchTagToggleImpl(tag, enabled, set, get),
  updateShare: (noteId, options) => updateShareImpl(noteId, options, get),
  revokeShare: (noteId) => revokeShareImpl(noteId, get),
});

async function batchToggleGroupImpl(
  type: Parameters<ShareStoreState['batchToggleGroup']>[0],
  target: Parameters<ShareStoreState['batchToggleGroup']>[1],
  enabled: Parameters<ShareStoreState['batchToggleGroup']>[2],
  set: SetShareStoreState,
  get: () => ShareStoreState,
): Promise<boolean> {
  set({ batchBusy: true });
  set((s) => ({
    shares: toggledShareRows(type, target, enabled, s.shares),
    globalStats: toggledShareStats(type, target, enabled, s.globalStats),
  }));
  try {
    await api.share.batchToggleGroup(type, target, enabled);
    await get().loadShares();
    return true;
  } catch {
    await get().loadShares();
    return false;
  } finally {
    set({ batchBusy: false });
  }
}

function toggledShareRows(
  type: Parameters<ShareStoreState['batchToggleGroup']>[0],
  target: string,
  enabled: boolean,
  shares: ShareStoreState['shares'],
): ShareStoreState['shares'] {
  return shares.map((share) => {
    let hasMatch = false;
    if (type === 'folder' && (share.folderId === target || share.shareFolderId === target)) {
      hasMatch = true;
    }
    if (type === 'tag' && share.shareTags?.includes(target)) {
      hasMatch = true;
    }
    if (hasMatch) {
      return { ...share, isEnabled: enabled };
    }
    return share;
  });
}

function toggledShareStats(
  type: Parameters<ShareStoreState['batchToggleGroup']>[0],
  target: string,
  enabled: boolean,
  globalStats: ShareStoreState['globalStats'],
): ShareStoreState['globalStats'] {
  if (!globalStats) return globalStats;
  if (type === 'folder' && globalStats.folderCounts[target]) {
    const prev = globalStats.folderCounts[target];
    return {
      ...globalStats,
      folderCounts: {
        ...globalStats.folderCounts,
        [target]: {
          total: prev.total,
          shared: enabled ? prev.total : 0,
        },
      },
    };
  }
  if (type === 'tag' && globalStats.tagCounts[target]) {
    const prev = globalStats.tagCounts[target];
    return {
      ...globalStats,
      tagCounts: {
        ...globalStats.tagCounts,
        [target]: {
          total: prev.total,
          shared: enabled ? prev.total : 0,
        },
      },
    };
  }
  return globalStats;
}

async function toggleShareImpl(noteId: string, enabled: boolean, set: SetShareStoreState, get: () => ShareStoreState): Promise<boolean> {
  set((state) => ({
    shares: state.shares.map((s) =>
      s.noteId === noteId ? { ...s, isEnabled: enabled } : s,
    ),
  }));
  try {
    await api.share.create(noteId, { isEnabled: enabled });
    await get().loadShares();
    return true;
  } catch {
    await get().loadShares();
    return false;
  }
}

async function togglePinImpl(noteId: string, set: SetShareStoreState, get: () => ShareStoreState): Promise<boolean> {
  const current = get().shares.find((s) => s.noteId === noteId)?.isPinned;
  const nextVal = !current;
  set((state) => ({
    shares: state.shares.map((s) =>
      s.noteId === noteId ? { ...s, isPinned: nextVal } : s,
    ),
  }));
  try {
    await useNotes.getState().patchNote(noteId, { isPinned: nextVal });
    await get().loadShares();
    return true;
  } catch {
    await get().loadShares();
    return false;
  }
}

async function toggleStarImpl(noteId: string, set: SetShareStoreState, get: () => ShareStoreState): Promise<boolean> {
  const current = get().shares.find((s) => s.noteId === noteId)?.isStarred;
  const nextVal = !current;
  set((state) => ({
    shares: state.shares.map((s) =>
      s.noteId === noteId ? { ...s, isStarred: nextVal } : s,
    ),
  }));
  try {
    await useNotes.getState().patchNote(noteId, { isStarred: nextVal });
    await get().loadShares();
    return true;
  } catch {
    await get().loadShares();
    return false;
  }
}

async function batchToggleImpl(
  action: Parameters<ShareStoreState['batchToggle']>[0],
  noteIds: Parameters<ShareStoreState['batchToggle']>[1],
  expiresIn: Parameters<ShareStoreState['batchToggle']>[2],
  folderId: Parameters<ShareStoreState['batchToggle']>[3],
  set: SetShareStoreState,
  get: () => ShareStoreState,
): Promise<boolean> {
  set({ batchBusy: true });
  try {
    await api.share.batch(action, noteIds, expiresIn, folderId);
    set({ selectedNoteIds: new Set() });
    await get().loadShares();
    return true;
  } catch {
    return false;
  } finally {
    set({ batchBusy: false });
  }
}

async function batchMoveToFolderImpl(
  noteIds: Parameters<ShareStoreState['batchMoveToFolder']>[0],
  folderId: Parameters<ShareStoreState['batchMoveToFolder']>[1],
  set: SetShareStoreState,
  get: () => ShareStoreState,
): Promise<boolean> {
  set({ batchBusy: true });
  set((s) => {
    const idSet = new Set(noteIds);
    const updatedShares = s.shares.map((share) => {
      if (idSet.has(share.noteId)) {
        return { ...share, shareFolderId: folderId, folderId };
      }
      return share;
    });
    return { shares: updatedShares, selectedNoteIds: new Set() };
  });
  try {
    await api.share.batch('move', noteIds, undefined, folderId);
    await get().loadShares();
    return true;
  } catch {
    await get().loadShares();
    return false;
  } finally {
    set({ batchBusy: false });
  }
}

async function batchFolderToggleImpl(folderId: string, enabled: boolean, set: SetShareStoreState, get: () => ShareStoreState): Promise<boolean> {
  set({ batchBusy: true });
  try {
    await api.share.batchFolder(folderId, enabled);
    await get().loadShares();
    return true;
  } catch {
    return false;
  } finally {
    set({ batchBusy: false });
  }
}

async function batchTagToggleImpl(tag: string, enabled: boolean, set: SetShareStoreState, get: () => ShareStoreState): Promise<boolean> {
  set({ batchBusy: true });
  try {
    await api.share.batchTag(tag, enabled);
    await get().loadShares();
    return true;
  } catch {
    return false;
  } finally {
    set({ batchBusy: false });
  }
}

async function updateShareImpl(
  noteId: string,
  options: Parameters<ShareStoreState['updateShare']>[1],
  get: () => ShareStoreState,
): Promise<ShareStoreState['shares'][number] | null> {
  try {
    const res = await api.share.create(noteId, options);
    await get().loadShares();
    return res.share;
  } catch {
    return null;
  }
}

async function revokeShareImpl(noteId: string, get: () => ShareStoreState): Promise<boolean> {
  try {
    await api.share.remove(noteId);
    await get().loadShares();
    return true;
  } catch {
    return false;
  }
}
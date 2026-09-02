import { useSyncExternalStore } from 'react';

export interface FolderPreferences {
  inboxFolderId: string | null;
  folderTemplates: Record<string, string>;
}

export const FOLDER_PREFS_STORAGE_KEY = 'inkstone.folder-preferences.v1';

const DEFAULT_PREFS: FolderPreferences = {
  inboxFolderId: null,
  folderTemplates: {},
};

const listeners = new Set<() => void>();

function getStorage(): Storage | null {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

export function loadFolderPrefs(storage: Storage | null = getStorage()): FolderPreferences {
  if (!storage) return { ...DEFAULT_PREFS };
  try {
    const raw = storage.getItem(FOLDER_PREFS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<FolderPreferences>;
    return {
      inboxFolderId: typeof parsed.inboxFolderId === 'string' ? parsed.inboxFolderId : null,
      folderTemplates:
        typeof parsed.folderTemplates === 'object' && parsed.folderTemplates !== null
          ? parsed.folderTemplates
          : {},
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

let currentPrefs: FolderPreferences = loadFolderPrefs();

export function saveFolderPrefs(
  patch: Partial<FolderPreferences>,
  storage: Storage | null = getStorage()
): void {
  currentPrefs = { ...currentPrefs, ...patch };
  if (storage) {
    try {
      storage.setItem(FOLDER_PREFS_STORAGE_KEY, JSON.stringify(currentPrefs));
    } catch {
      // quota or private mode
    }
  }
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useFolderPreferences(): FolderPreferences {
  return useSyncExternalStore(
    subscribe,
    () => currentPrefs,
    () => DEFAULT_PREFS
  );
}

export function getInboxFolderId(): string | null {
  return currentPrefs.inboxFolderId;
}

export function setInboxFolderId(folderId: string | null): void {
  saveFolderPrefs({ inboxFolderId: folderId });
}

export function getFolderTemplateId(folderId: string): string | null {
  return currentPrefs.folderTemplates[folderId] ?? null;
}

export function setFolderTemplateId(folderId: string, templateId: string | null): void {
  const next = { ...currentPrefs.folderTemplates };
  if (templateId) {
    next[folderId] = templateId;
  } else {
    delete next[folderId];
  }
  saveFolderPrefs({ folderTemplates: next });
}

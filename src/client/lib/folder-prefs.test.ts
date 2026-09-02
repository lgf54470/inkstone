import { beforeEach, describe, expect, it } from 'vitest';
import {
  FOLDER_PREFS_STORAGE_KEY,
  getFolderTemplateId,
  getInboxFolderId,
  loadFolderPrefs,
  saveFolderPrefs,
  setFolderTemplateId,
  setInboxFolderId,
} from './folder-prefs';

describe('folder-prefs', () => {
  beforeEach(() => {
    localStorage.clear();
    saveFolderPrefs({ inboxFolderId: null, folderTemplates: {} });
  });

  it('loads default values when storage is empty', () => {
    expect(loadFolderPrefs(localStorage)).toEqual({
      inboxFolderId: null,
      folderTemplates: {},
    });
  });

  it('saves and loads inbox folder id', () => {
    setInboxFolderId('folder-123');
    expect(getInboxFolderId()).toBe('folder-123');
    expect(loadFolderPrefs(localStorage).inboxFolderId).toBe('folder-123');

    setInboxFolderId(null);
    expect(getInboxFolderId()).toBeNull();
    expect(loadFolderPrefs(localStorage).inboxFolderId).toBeNull();
  });

  it('saves and loads folder template associations', () => {
    setFolderTemplateId('folder-abc', 'template-xyz');
    expect(getFolderTemplateId('folder-abc')).toBe('template-xyz');
    expect(loadFolderPrefs(localStorage).folderTemplates['folder-abc']).toBe('template-xyz');

    setFolderTemplateId('folder-abc', null);
    expect(getFolderTemplateId('folder-abc')).toBeNull();
    expect(loadFolderPrefs(localStorage).folderTemplates['folder-abc']).toBeUndefined();
  });

  it('handles invalid JSON gracefully', () => {
    localStorage.setItem(FOLDER_PREFS_STORAGE_KEY, '{invalid json');
    expect(loadFolderPrefs(localStorage)).toEqual({
      inboxFolderId: null,
      folderTemplates: {},
    });
  });
});

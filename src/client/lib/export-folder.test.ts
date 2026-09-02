import { describe, expect, it, vi } from 'vitest';
import { exportFolderAsZip, safeFileName } from './export-folder';
import { useNotes } from '../store/notes';
import type { Folder, NoteSummary } from '@shared/types';

describe('export-folder', () => {
  it('cleans illegal characters for safe filenames', () => {
    expect(safeFileName('Project / Work : 2026? <test>|*')).toBe('Project Work 2026 test');
    expect(safeFileName('   Normal Title   ')).toBe('Normal Title');
  });

  it('throws error when folder is not found', async () => {
    useNotes.setState({ folders: [], notes: {} });
    await expect(exportFolderAsZip('missing-id')).rejects.toThrow('Folder not found');
  });

  it('returns count 0 when no notes exist in folder', async () => {
    const folders: Folder[] = [
      { id: 'f1', name: 'Projects', parentId: null, color: null, icon: null, position: 0, createdAt: 1, updatedAt: 1 },
    ];
    useNotes.setState({ folders, notes: {} });
    const res = await exportFolderAsZip('f1');
    expect(res.count).toBe(0);
    expect(res.filename).toBe('Projects-export.zip');
  });

  it('exports notes in folder and subfolders with correct count', async () => {
    // Mock URL.createObjectURL
    if (typeof URL.createObjectURL === 'undefined') {
      URL.createObjectURL = vi.fn(() => 'blob:test');
      URL.revokeObjectURL = vi.fn();
    }

    const folders: Folder[] = [
      { id: 'f1', name: 'Projects', parentId: null, color: null, icon: null, position: 0, createdAt: 1, updatedAt: 1 },
      { id: 'f2', name: 'Frontend', parentId: 'f1', color: null, icon: null, position: 0, createdAt: 1, updatedAt: 1 },
    ];

    const notes: Record<string, NoteSummary> = {
      n1: {
        id: 'n1',
        title: 'Overview',
        folderId: 'f1',
        tags: [],
        isPinned: false,
        isStarred: false,
        isArchived: false,
        createdAt: 1,
        updatedAt: 1,
        deletedAt: null,
        rev: 1,
        excerpt: '',
        wordCount: 0,
        charCount: 0,
        position: 0,
      },
      n2: {
        id: 'n2',
        title: 'App Specs',
        folderId: 'f2',
        tags: [],
        isPinned: false,
        isStarred: false,
        isArchived: false,
        createdAt: 1,
        updatedAt: 1,
        deletedAt: null,
        rev: 1,
        excerpt: '',
        wordCount: 0,
        charCount: 0,
        position: 0,
      },
      n3: {
        id: 'n3',
        title: 'Other',
        folderId: 'f_other',
        tags: [],
        isPinned: false,
        isStarred: false,
        isArchived: false,
        createdAt: 1,
        updatedAt: 1,
        deletedAt: null,
        rev: 1,
        excerpt: '',
        wordCount: 0,
        charCount: 0,
        position: 0,
      },
    };

    useNotes.setState({
      folders,
      notes,
      contents: {
        n1: '# Overview content',
        n2: '# Specs content',
      },
    });

    const res = await exportFolderAsZip('f1');
    expect(res.count).toBe(2);
    expect(res.filename).toBe('Projects-export.zip');
  });
});

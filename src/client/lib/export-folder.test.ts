import { describe, expect, it, vi } from 'vitest'
import { exportFolderAsZip, safeFileName } from './export-folder'
import { useNotes } from '../store/notes'
import type { Folder, NoteSummary } from '@shared/types'

function makeFolder(id: string, name: string, parentId: string | null): Folder {
  return { id, name, parentId, color: null, icon: null, position: 0, createdAt: 1, updatedAt: 1 }
}

function makeNote(id: string, title: string, folderId: string): NoteSummary {
  return {
    id,
    title,
    folderId,
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
  }
}

const EXPORT_FOLDERS: Folder[] = [makeFolder('f1', 'Projects', null), makeFolder('f2', 'Frontend', 'f1')]

const EXPORT_NOTES: Record<string, NoteSummary> = {
  n1: makeNote('n1', 'Overview', 'f1'),
  n2: makeNote('n2', 'App Specs', 'f2'),
  n3: makeNote('n3', 'Other', 'f_other'),
}

function stubObjectUrl(): void {
  if (typeof URL.createObjectURL === 'undefined') {
    URL.createObjectURL = vi.fn(() => 'blob:test')
    URL.revokeObjectURL = vi.fn()
  }
}

describe('export-folder guards', () => {
  it('cleans illegal characters for safe filenames', () => {
    expect(safeFileName('Project / Work : 2026? <test>|*')).toBe('Project Work 2026 test')
    expect(safeFileName('   Normal Title   ')).toBe('Normal Title')
  })

  it('throws error when folder is not found', async () => {
    useNotes.setState({ folders: [], notes: {} })
    await expect(exportFolderAsZip('missing-id')).rejects.toThrow('Folder not found')
  })
})

describe('export-folder zip', () => {
  it('returns count 0 when no notes exist in folder', async () => {
    useNotes.setState({ folders: [EXPORT_FOLDERS[0]!], notes: {} })
    const res = await exportFolderAsZip('f1')
    expect(res.count).toBe(0)
    expect(res.filename).toBe('Projects-export.zip')
  })

  it('exports notes in folder and subfolders with correct count', async () => {
    stubObjectUrl()
    useNotes.setState({
      folders: EXPORT_FOLDERS,
      notes: EXPORT_NOTES,
      contents: {
        n1: '# Overview content',
        n2: '# Specs content',
      },
    })

    const res = await exportFolderAsZip('f1')
    expect(res.count).toBe(2)
    expect(res.filename).toBe('Projects-export.zip')
  })
})
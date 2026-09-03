import { describe, expect, it } from 'vitest'
import {
  formatFileSize,
  getFileBadgeColor,
  getFileCategory,
  groupAttachmentsByDate,
} from '../src/client/features/attachments/attachment-helpers'
import { SCHEMA_STATEMENTS } from '../src/worker/db/schema'
import type { AttachmentWithUsage } from '../src/shared/types'

describe('attachment helpers', () => {
  it('formats file sizes accurately', () => {
    expect(formatFileSize(0)).toBe('0 B')
    expect(formatFileSize(512)).toBe('512 B')
    expect(formatFileSize(1024)).toBe('1.0 KB')
    expect(formatFileSize(1024 * 1024 * 2.5)).toBe('2.5 MB')
    expect(formatFileSize(1024 * 1024 * 1024 * 3)).toBe('3.00 GB')
  })

  it('classifies mime and filenames into categories', () => {
    expect(getFileCategory('image/png', 'test.png')).toBe('image')
    expect(getFileCategory('application/pdf', 'doc.pdf')).toBe('document')
    expect(getFileCategory('audio/mpeg', 'song.mp3')).toBe('media')
    expect(getFileCategory('video/mp4', 'movie.mp4')).toBe('media')
    expect(getFileCategory('application/zip', 'archive.zip')).toBe('archive')
    expect(getFileCategory('text/plain', 'notes.txt')).toBe('document')
    expect(getFileCategory('application/octet-stream', 'unknown.bin')).toBe('other')
  })

  it('generates badge labels and colors for file extensions', () => {
    const pdfBadge = getFileBadgeColor('document', 'pdf')
    expect(pdfBadge.label).toBe('PDF')
    expect(pdfBadge.bg).toContain('rose')

    const docBadge = getFileBadgeColor('document', 'docx')
    expect(docBadge.label).toBe('DOCX')
    expect(docBadge.bg).toContain('indigo')

    const zipBadge = getFileBadgeColor('archive', 'zip')
    expect(zipBadge.label).toBe('ZIP')
  })

  it('groups attachments by date timeline correctly', () => {
    const now = Date.now()
    const oneDayMs = 24 * 60 * 60 * 1000

    const fileToday: AttachmentWithUsage = {
      id: 'f1',
      userId: 'u1',
      filename: 'today.png',
      mime: 'image/png',
      size: 100,
      createdAt: now,
      url: '/api/files/f1',
      references: 1,
    }

    const fileYesterday: AttachmentWithUsage = {
      id: 'f2',
      userId: 'u1',
      filename: 'yesterday.pdf',
      mime: 'application/pdf',
      size: 200,
      createdAt: now - oneDayMs,
      url: '/api/files/f2',
      references: 0,
    }

    const fileOld: AttachmentWithUsage = {
      id: 'f3',
      userId: 'u1',
      filename: 'old.zip',
      mime: 'application/zip',
      size: 300,
      createdAt: now - oneDayMs * 10,
      url: '/api/files/f3',
      references: 2,
    }

    const groups = groupAttachmentsByDate([fileToday, fileYesterday, fileOld])
    expect(groups.length).toBe(3)
    expect(groups[0]?.files[0]?.id).toBe('f1')
    expect(groups[1]?.files[0]?.id).toBe('f2')
    expect(groups[2]?.files[0]?.id).toBe('f3')
  })
})

describe('database schema migration 15', () => {
  it('includes attachments table schema in SCHEMA_STATEMENTS', () => {
    const attachmentStatement = SCHEMA_STATEMENTS.find((stmt) => stmt.includes('CREATE TABLE IF NOT EXISTS attachments'))
    expect(attachmentStatement).toBeDefined()
    expect(attachmentStatement).toContain('folder_id TEXT')
    expect(attachmentStatement).toContain('is_starred INTEGER NOT NULL DEFAULT 0')
    expect(attachmentStatement).toContain('is_pinned INTEGER NOT NULL DEFAULT 0')
    expect(attachmentStatement).toContain('tags TEXT NOT NULL DEFAULT \'[]\'')
  })
})

import { describe, expect, it } from 'vitest'
import {
  attachmentDateFolder,
  attachmentObjectKey,
  attachmentObjectKeyCandidates,
  legacyAttachmentObjectKey,
} from '../src/worker/attachments/keys'
import { attachmentQuotaBytesForStorage } from '../src/worker/attachments/backend'
import { LIMITS } from '../src/shared/constants'
import { renderMarkdown } from '../src/client/lib/markdown/renderer'

describe('attachment keys', () => {
  it('formats date folder correctly from timestamp', () => {
    const ts = Date.UTC(2026, 8, 3, 10, 0, 0)
    expect(attachmentDateFolder(ts)).toBe('2026-09-03')
  })

  it('scopes the object key to the owning user', () => {
    const ts = Date.UTC(2026, 8, 3, 10, 0, 0)
    const key = attachmentObjectKey({
      id: 'att-1',
      user_id: 'user-1',
      filename: 'my-avatar.png',
      mime: 'image/png',
      created_at: ts,
    })
    expect(key).toBe('images/2026-09-03/user-1/my-avatar.png')
  })

  it('keeps documents in the files folder under the owning user', () => {
    const ts = Date.UTC(2026, 8, 3, 10, 0, 0)
    const key = attachmentObjectKey({
      id: 'att-2',
      user_id: 'user-1',
      filename: 'report.pdf',
      mime: 'application/pdf',
      created_at: ts,
    })
    expect(key).toBe('files/2026-09-03/user-1/report.pdf')
  })

  it('prefers the persisted key and falls back to the legacy layout', () => {
    const row = {
      id: 'att-3',
      user_id: 'user-1',
      filename: 'photo.jpg',
      mime: 'image/jpeg',
      created_at: Date.UTC(2026, 8, 3, 10, 0, 0),
      object_key: 'images/2026-09-03/photo.jpg',
    }
    expect(attachmentObjectKeyCandidates(row)).toEqual([
      'images/2026-09-03/photo.jpg',
      'user-1/att-3.jpg',
    ])

    const unmigrated = { ...row, object_key: null }
    expect(attachmentObjectKeyCandidates(unmigrated)[0]).toBe('images/2026-09-03/user-1/photo.jpg')
  })

  it('generates legacy attachment object key for backward compatibility', () => {
    const key = legacyAttachmentObjectKey({
      id: '01m1j6t8963cpjw0eme1b7spsm',
      user_id: '01m1dkaegwjdna4r97vrshptp9',
      filename: 'photo.jpg',
      mime: 'image/jpeg',
    })
    expect(key).toBe('01m1dkaegwjdna4r97vrshptp9/01m1j6t8963cpjw0eme1b7spsm.jpg')
  })

  it('selects the quota by the bound storage backend', () => {
    expect(attachmentQuotaBytesForStorage('r2')).toBe(LIMITS.attachmentQuotaBytesR2)
    expect(attachmentQuotaBytesForStorage('kv')).toBe(LIMITS.attachmentQuotaBytesKv)
    expect(attachmentQuotaBytesForStorage(null)).toBe(LIMITS.attachmentQuotaBytesR2)
  })
})

describe('file card markdown rendering', () => {
  it('renders standalone file attachment link as a file card with action buttons', () => {
    const md = '[spec.pdf](/api/files/abc123xyz)'
    const rendered = renderMarkdown(md)
    expect(rendered.html).toContain('class="file-card"')
    expect(rendered.html).toContain('data-file-card')
    expect(rendered.html).toContain('data-file-url="/api/files/abc123xyz"')
    expect(rendered.html).toContain('data-file-name="spec.pdf"')
    expect(rendered.html).toContain('data-file-action="preview"')
    expect(rendered.html).toContain('data-file-action="download"')
    expect(rendered.html).toContain('data-file-action="delete"')
    expect(rendered.html).toContain('spec.pdf')
    expect(rendered.html).toContain('data-category="pdf"')
  })

  it('renders inline file link as an inline file chip', () => {
    const md = 'See [spec.pdf](/api/files/abc123xyz) for details.'
    const rendered = renderMarkdown(md)
    expect(rendered.html).not.toContain('class="file-card"')
    expect(rendered.html).toContain('inline-file-chip')
    expect(rendered.html).toContain('href="/api/files/abc123xyz"')
  })

  it('keeps image markdown rendering as img tag without converting to file card', () => {
    const md = '![photo.jpg](/api/files/img123)'
    const rendered = renderMarkdown(md)
    expect(rendered.html).not.toContain('class="file-card"')
    expect(rendered.html).toContain('<img')
  })
})

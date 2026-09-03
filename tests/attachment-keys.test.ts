import { describe, expect, it } from 'vitest'
import {
  attachmentDateFolder,
  attachmentObjectKey,
  legacyAttachmentObjectKey,
} from '../src/worker/attachments/keys'
import { renderMarkdown } from '../src/client/lib/markdown/renderer'

describe('attachment keys', () => {
  it('formats date folder correctly from timestamp', () => {
    const ts = Date.UTC(2026, 8, 3, 10, 0, 0)
    expect(attachmentDateFolder(ts)).toBe('2026-09-03')
  })

  it('generates image object key with images folder and original filename', () => {
    const ts = Date.UTC(2026, 8, 3, 10, 0, 0)
    const key = attachmentObjectKey({
      id: 'att-1',
      user_id: 'user-1',
      filename: 'my-avatar.png',
      mime: 'image/png',
      created_at: ts,
    })
    expect(key).toBe('images/2026-09-03/my-avatar.png')
  })

  it('generates document object key with files folder and original filename', () => {
    const ts = Date.UTC(2026, 8, 3, 10, 0, 0)
    const key = attachmentObjectKey({
      id: 'att-2',
      user_id: 'user-1',
      filename: 'report.pdf',
      mime: 'application/pdf',
      created_at: ts,
    })
    expect(key).toBe('files/2026-09-03/report.pdf')
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

import { extractAttachmentIds } from '@shared/markdown-utils'
import type { ShareInfo } from '@shared/types'
import type { DemoState } from '../../state'

export function attachmentReferenceCounts(state: DemoState): Map<string, number> {
  const references = new Map<string, number>()
  for (const note of state.notes.values()) {
    for (const id of extractAttachmentIds(note.content)) {
      if (!state.attachments.has(id)) continue
      references.set(id, (references.get(id) ?? 0) + 1)
    }
    for (const attachment of state.attachments.values()) {
      if (!note.content.includes(attachment.meta.url)) continue
      references.set(attachment.meta.id, (references.get(attachment.meta.id) ?? 0) + 1)
    }
  }
  return references
}

export async function browserFileUrl(file: File): Promise<string> {
  if (typeof URL.createObjectURL === 'function') return URL.createObjectURL(file)
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `data:${file.type || 'application/octet-stream'};base64,${btoa(binary)}`
}

export function revokeAttachment(url: string): void {
  if (url.startsWith('blob:') && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url)
}

export function absoluteShare(info: ShareInfo, requestUrl: string): ShareInfo {
  return { ...info, url: `${new URL(requestUrl).origin}/s/${info.slug}` }
}


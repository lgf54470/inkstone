import type { AttachmentWithUsage } from '@shared/types'
import { t } from '../../lib/i18n'

export type AttachmentCategory =
  | 'dashboard'
  | 'all'
  | 'image'
  | 'document'
  | 'media'
  | 'archive'
  | 'starred'
  | 'pinned'
  | 'unreferenced'

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function getFileCategory(mime: string, filename: string): 'image' | 'document' | 'media' | 'archive' | 'other' {
  if (mime.startsWith('image/')) return 'image'
  if (mime === 'application/pdf' || mime.startsWith('text/') || mime.includes('document') || mime.includes('sheet') || mime.includes('presentation') || mime.includes('word') || mime.includes('excel')) {
    return 'document'
  }
  if (mime.startsWith('audio/') || mime.startsWith('video/')) return 'media'
  if (mime.includes('zip') || mime.includes('tar') || mime.includes('rar') || mime.includes('7z') || mime.includes('gzip')) {
    return 'archive'
  }
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif'].includes(ext)) return 'image'
  if (['pdf', 'txt', 'md', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)) return 'document'
  if (['mp3', 'wav', 'm4a', 'flac', 'mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext)) return 'media'
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'archive'
  return 'other'
}

export function getFileBadgeColor(category: 'image' | 'document' | 'media' | 'archive' | 'other', ext: string): {
  bg: string
  text: string
  label: string
} {
  const cleanExt = ext.toUpperCase().slice(0, 4) || 'FILE'
  switch (category) {
    case 'image':
      return { bg: 'bg-blue-500/10 dark:bg-blue-400/15', text: 'text-blue-600 dark:text-blue-400', label: cleanExt }
    case 'document':
      if (ext === 'pdf') {
        return { bg: 'bg-rose-500/10 dark:bg-rose-400/15', text: 'text-rose-600 dark:text-rose-400', label: 'PDF' }
      }
      if (['xls', 'xlsx', 'csv'].includes(ext)) {
        return { bg: 'bg-emerald-500/10 dark:bg-emerald-400/15', text: 'text-emerald-600 dark:text-emerald-400', label: cleanExt }
      }
      return { bg: 'bg-indigo-500/10 dark:bg-indigo-400/15', text: 'text-indigo-600 dark:text-indigo-400', label: cleanExt }
    case 'media':
      return { bg: 'bg-purple-500/10 dark:bg-purple-400/15', text: 'text-purple-600 dark:text-purple-400', label: cleanExt }
    case 'archive':
      return { bg: 'bg-amber-500/10 dark:bg-amber-400/15', text: 'text-amber-600 dark:text-amber-400', label: cleanExt }
    default:
      return { bg: 'bg-slate-500/10 dark:bg-slate-400/15', text: 'text-slate-600 dark:text-slate-400', label: cleanExt }
  }
}

export interface TimelineGroup {
  label: string
  files: AttachmentWithUsage[]
}

export function groupAttachmentsByDate(files: AttachmentWithUsage[]): TimelineGroup[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayTime = today.getTime()
  const yesterdayTime = todayTime - 86400000

  const groups: Map<string, AttachmentWithUsage[]> = new Map()

  for (const file of files) {
    const fileDate = new Date(file.createdAt)
    const fileDayTime = new Date(fileDate.getFullYear(), fileDate.getMonth(), fileDate.getDate()).getTime()

    let key: string
    if (fileDayTime === todayTime) {
      key = t('attachments.today')
    } else if (fileDayTime === yesterdayTime) {
      key = t('attachments.yesterday')
    } else {
      const year = fileDate.getFullYear()
      const month = fileDate.getMonth() + 1
      key = `${year}-${String(month).padStart(2, '0')}`
    }

    const list = groups.get(key)
    if (list) {
      list.push(file)
    } else {
      groups.set(key, [file])
    }
  }

  return Array.from(groups.entries()).map(([label, groupFiles]) => ({
    label,
    files: groupFiles,
  }))
}

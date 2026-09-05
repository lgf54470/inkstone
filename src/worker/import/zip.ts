/** ZIP entry classification and backup selection for the import pipeline. */
import {
  backupCompletePath,
  backupManifestPath,
  completeManifestHash,
  MARKDOWN_BACKUP_FORMAT,
  parseMarkdownBackupManifest,
  type MarkdownBackupManifest,
} from '@shared/backup-format'
import type { UnzippedEntry } from '@shared/zip'
import { sha256Hex } from '../lib/encoding'
import { isRecord } from './shared'

export const EXPORT_FILE = 'inkstone-export.json'

export function isExportBundlePath(path: string): boolean {
  const lower = path.toLowerCase()
  return lower === EXPORT_FILE || lower.endsWith(`/${EXPORT_FILE}`)
}

export function isBackupControlPath(path: string): boolean {
  const lower = path.toLowerCase()
  return isExportBundlePath(path) ||
    lower === 'manifest.json' || lower.endsWith('/manifest.json') ||
    lower === 'complete' || lower.endsWith('/complete') ||
    isMarkdownBackupControlPath(path)
}

export function isMarkdownBackupControlPath(path: string): boolean {
  return /(?:^|\/)snapshots\/\d{8}-\d{6}-\d{3}\/(?:manifest\.json|complete|readme\.txt)$/i.test(path)
}

export function isInkstoneBackupManifest(entry: UnzippedEntry): boolean {
  if (!/(?:^|\/)manifest\.json$/i.test(entry.path)) return false
  try {
    const raw = JSON.parse(new TextDecoder().decode(entry.data)) as unknown
    return isRecord(raw) && raw.format === MARKDOWN_BACKUP_FORMAT
  } catch {
    return false
  }
}

export async function selectCompleteZipBackup(entries: readonly UnzippedEntry[]): Promise<{
  manifest: MarkdownBackupManifest
  rootPrefix: string
  warning: string | null
} | null> {
  const byPath = new Map(entries.map((entry) => [entry.path.toLowerCase(), entry]))
  const candidates: Array<{
    entry: UnzippedEntry
    manifest: MarkdownBackupManifest
    rootPrefix: string
    complete: UnzippedEntry | undefined
  }> = []
  let hasSeenManifest = false
  const skipped: string[] = []

  for (const entry of entries) {
    if (!/(?:^|\/)manifest\.json$/i.test(entry.path)) continue
    const legacyPath = /(?:^|\/)snapshots\/\d{8}-\d{6}-\d{3}\/manifest\.json$/i.test(entry.path)
    const directory = entry.path.slice(0, entry.path.lastIndexOf('/') + 1)
    const siblingComplete = byPath.get(`${directory}complete`.toLowerCase())
    let raw: unknown
    try {
      raw = JSON.parse(new TextDecoder().decode(entry.data))
    } catch {
      if (legacyPath || siblingComplete) hasSeenManifest = true
      if (siblingComplete) throw new Error(`The completed backup has an invalid manifest: ${entry.path}`)
      continue
    }
    const declaresInkstone = isRecord(raw) && raw.format === MARKDOWN_BACKUP_FORMAT
    if (legacyPath || declaresInkstone) hasSeenManifest = true
    const manifest = parseMarkdownBackupManifest(raw)
    if (!manifest) {
      if (siblingComplete && declaresInkstone) {
        throw new Error(`The completed backup has an invalid or unsupported manifest: ${entry.path}`)
      }
      continue
    }
    const suffix = backupManifestPath(manifest.snapshot, manifest.version)
    if (!entry.path.toLowerCase().endsWith(suffix.toLowerCase())) {
      if (siblingComplete) throw new Error(`The backup manifest is in an invalid path: ${entry.path}`)
      continue
    }
    const rootPrefix = entry.path.slice(0, entry.path.length - suffix.length)
    candidates.push({
      entry,
      manifest,
      rootPrefix,
      complete: byPath.get(
        `${rootPrefix}${backupCompletePath(manifest.snapshot, manifest.version)}`.toLowerCase(),
      ),
    })
  }

  candidates.sort((a, b) => b.manifest.snapshot.localeCompare(a.manifest.snapshot))
  for (const { entry, manifest, rootPrefix, complete } of candidates) {
    if (!complete) {
      skipped.push(manifest.snapshot)
      continue
    }
    const declaredHash = completeManifestHash(new TextDecoder().decode(complete.data))
    const actualHash = await sha256Hex(entry.data)
    if (!declaredHash || declaredHash !== actualHash) {
      throw new Error(`The COMPLETE marker does not match ${entry.path}`)
    }
    return {
      manifest,
      rootPrefix,
      warning: skipped.length
        ? `A newer snapshot (${skipped[0]}) was incomplete, so the newest complete snapshot was restored instead`
        : null,
    }
  }

  if (hasSeenManifest) throw new Error('The ZIP contains an incomplete Inkstone backup without a valid COMPLETE marker')
  return null
}

export function collectAttachmentArchivePaths(raw: unknown, bundlePath: string): Set<string> {
  const expected = new Set<string>()
  if (!isRecord(raw) || !Array.isArray(raw.attachments)) return expected
  const base = bundleDirectory(bundlePath)
  for (const attachment of raw.attachments) {
    if (!isRecord(attachment) || typeof attachment.id !== 'string') {
      throw new Error('The attachment manifest contains an invalid entry')
    }
    const path = validateAttachmentArchivePath(attachment.path, attachment.id)
    expected.add(`${base}${path}`.toLowerCase())
  }
  return expected
}

export function mapBundleAttachmentEntries(
  entries: readonly UnzippedEntry[],
  bundlePath: string,
): Map<string, Uint8Array> {
  const base = bundleDirectory(bundlePath)
  const baseLower = base.toLowerCase()
  const mapped = new Map<string, Uint8Array>()
  for (const entry of entries) {
    if (!entry.path.toLowerCase().startsWith(baseLower)) continue
    mapped.set(entry.path.slice(base.length).toLowerCase(), entry.data)
  }
  return mapped
}

export function bundleDirectory(bundlePath: string): string {
  const slash = bundlePath.lastIndexOf('/')
  return slash >= 0 ? bundlePath.slice(0, slash + 1) : ''
}

export function validateAttachmentArchivePath(value: unknown, sourceId: string): string {
  if (typeof value !== 'string' || !value || value.length > 512 || value.includes('\\')) {
    throw new Error(`Invalid attachment path: ${sourceId}`)
  }
  const segments = value.split('/')
  if (
    segments.length !== 3 ||
    segments[0] !== 'attachments' ||
    segments[1] !== sourceId ||
    !segments[2] ||
    segments[2] === '.' ||
    segments[2] === '..' ||
    /[\u0000-\u001f]/.test(segments[2])
  ) {
    throw new Error(`Invalid attachment path: ${sourceId}`)
  }
  return value
}

export function isMarkdownPath(path: string): boolean {
  return /\.(md|markdown|txt)$/i.test(path)
}

export function isImportableEntryPath(path: string): boolean {
  return isMarkdownPath(path) || /\.(png|jpe?g|gif|webp|avif|svg|pdf)$/i.test(path)
}
import type { ShareInfo } from '@shared/types'
import { withChannelParam } from '@shared/share-channel'
import { downloadTextFile } from '../../lib/export-note'
import { t } from '../../lib/i18n'
import type { UiState } from '../../store/ui'
import type { ShareQrSheetRequest } from './share-qr-sheet'

/**
 * The selected rows, as the batch link actions need them. Selection is a set of note ids while
 * the rows are what the store currently holds, so a selection made before a filter change can
 * name a note the list no longer carries: that gap is reported rather than quietly dropped —
 * a list that silently loses entries looks complete and is not.
 */
export function selectedShareRows(
  shares: ShareInfo[],
  selectedNoteIds: Set<string>,
): { rows: ShareInfo[]; missing: number } {
  const rows = shares.filter((share) => selectedNoteIds.has(share.noteId))
  return { rows, missing: selectedNoteIds.size - rows.length }
}

/**
 * Markdown list of the selected links, one per line: what a person pastes into a note or a mail.
 * A marker, when the owner typed one, is attached through the same helper the QR panel uses —
 * two hand-rolled `?ref=` builders would be two chances to disagree about what a valid marker is.
 */
export function buildShareLinkList(shares: ShareInfo[], channel = ''): string {
  return shares
    .map((share) => `- [${escapeLabel(share.noteTitle || share.slug)}](${withChannelParam(share.url, channel)})`)
    .join('\n')
}

/** A `]` or `[` in a note title would end the label early and turn the rest into prose. */
function escapeLabel(label: string): string {
  return label.replace(/([[\]])/g, '\\$1')
}

export async function copyShareLinksFlow(params: {
  rows: ShareInfo[]
  missing: number
  toast: UiState['toast']
  /** The marker the batch bar's field holds; empty means unmarked links. */
  channel?: string
}): Promise<void> {
  const { rows, missing, toast, channel = '' } = params
  if (!hasRows(rows.length, toast)) return
  try {
    await navigator.clipboard.writeText(buildShareLinkList(rows, channel))
    toast({
      title: t('share.batch_links_copied', { count: rows.length }),
      description: missingNote(missing),
      tone: 'success',
    })
  } catch (error) {
    console.warn('[share] failed to copy the selected links', error)
    toast({ title: t('common.action_failed'), tone: 'danger' })
  }
}

export function exportShareLinksFlow(params: {
  rows: ShareInfo[]
  missing: number
  toast: UiState['toast']
  channel?: string
}): void {
  const { rows, missing, toast, channel = '' } = params
  if (!hasRows(rows.length, toast)) return
  const stamp = new Date().toISOString().slice(0, 10)
  downloadTextFile(`inkstone-share-links-${stamp}.md`, buildShareLinkList(rows, channel), 'text/markdown;charset=utf-8')
  toast({
    title: t('share.batch_links_exported', { count: rows.length }),
    description: missingNote(missing),
    tone: 'success',
  })
}

/**
 * The sheet is the third way the same selection leaves the app, so it refuses an empty one with the
 * same words as the two above. It is also the only one that cannot report its leftovers in a toast:
 * the print dialog covers the toast it would raise, so the count is printed on the sheet itself
 * (see `ShareQrSheet`).
 */
export function printShareQrSheetFlow(params: {
  rows: ShareInfo[]
  missing: number
  channel: string
  requestPrint: (request: ShareQrSheetRequest) => void
  toast: UiState['toast']
}): void {
  const { rows, missing, channel, requestPrint, toast } = params
  if (!hasRows(rows.length, toast)) return
  requestPrint({ rows, channel, missing })
}

/** False when there is nothing to act on: the selection names no row the list is holding. */
function hasRows(count: number, toast: UiState['toast']): boolean {
  if (count > 0) return true
  toast({ title: t('share.batch_links_none'), tone: 'warning' })
  return false
}

/** Only mentioned when it happened: "0 links left out" is noise, not information. */
function missingNote(missing: number): string | undefined {
  return missing > 0 ? t('share.batch_links_missing', { count: missing }) : undefined
}

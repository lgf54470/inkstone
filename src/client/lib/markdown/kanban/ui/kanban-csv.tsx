/**
 * F-08. The fence is the board's own format, so a reader who works in a spreadsheet — or arrived
 * with one — needs a door in both directions. Both directions read and write through one document:
 * the file a reader picks is appended to the board in a single step of history, and the file the
 * board writes is the live board, so nothing that was filed away travels along.
 */
import { useId, useMemo, useRef, useState } from 'react'
import { Download, FileSpreadsheet, Upload } from 'lucide-react'
import { useClickOutside, useEscape } from '../../../../components/overlay'
import { downloadTextFile } from '../../../export-note'
import { t, useLocaleRepaint } from '../../../i18n'
import { kanbanActiveItems } from '../archive'
import { importKanbanCsv, kanbanCsvFilename, kanbanToCsv, KANBAN_CSV_MAX_ROWS } from '../csv'
import type { KanbanCsvOutcome } from '../csv'
import type { KanbanData, KanbanItem, KanbanProperty } from '../types'
import type { CommitKanbanData } from './kanban-history'

const CSV_MIME = 'text/csv;charset=utf-8'
const CSV_FILE_ACCEPT = '.csv,text/csv'

/** Only read through a call, so the message resolves against the live locale. */
const REFUSALS = {
  empty: () => t('preview.kanban_csv_import_empty'),
  no_title: () => t('preview.kanban_csv_import_no_title'),
  too_many: () => t('preview.kanban_csv_import_too_many', { count: KANBAN_CSV_MAX_ROWS }),
}

export interface KanbanCsvEntry {
  title: string
  columns: KanbanProperty[]
  /** The live board: an archived card is not part of what a spreadsheet should be handed. */
  items: KanbanItem[]
  commitData: CommitKanbanData
}

/** Stable across renders, so the memoised header is not woken by an unrelated keystroke. */
export function useKanbanCsvEntry(data: KanbanData, commitData: CommitKanbanData): KanbanCsvEntry {
  const items = useMemo(() => kanbanActiveItems(data.items), [data.items])
  const title = data.title ?? ''
  return useMemo(
    () => ({ title, columns: data.columns, items, commitData }),
    [title, data.columns, items, commitData],
  )
}

function outcomeLines(outcome: KanbanCsvOutcome): string[] {
  if (!outcome.ok) return [REFUSALS[outcome.reason]()]
  return [
    t('preview.kanban_csv_imported', { count: outcome.items.length }),
    ...(outcome.skippedRows > 0 ? [t('preview.kanban_csv_rows_skipped', { count: outcome.skippedRows })] : []),
    ...(outcome.newOptions > 0 ? [t('preview.kanban_csv_new_options', { count: outcome.newOptions })] : []),
    ...(outcome.ignoredHeaders.length > 0
      ? [t('preview.kanban_csv_headers_ignored', { headers: outcome.ignoredHeaders.join(', ') })]
      : []),
    ...(outcome.ignoredCells > 0 ? [t('preview.kanban_csv_cells_ignored', { count: outcome.ignoredCells })] : []),
  ]
}

function CsvPanelButton({
  action,
  label,
  icon,
  onClick,
}: {
  action: string
  label: string
  icon: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type='button'
      data-kanban-csv-action={action}
      onClick={onClick}
      className='flex items-center gap-1.5 rounded-[var(--r-xs)] px-1.5 py-1 text-left text-[length:var(--text-12)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

interface KanbanCsvPanelProps {
  panelId: string
  panelRef: React.RefObject<HTMLDivElement | null>
  fileRef: React.RefObject<HTMLInputElement | null>
  feedback: string[]
  onExport: () => void
  onFile: (file: File | undefined) => void
}

function KanbanCsvPanel({ panelId, panelRef, fileRef, feedback, onExport, onFile }: KanbanCsvPanelProps) {
  return (
    <div
      id={panelId}
      ref={panelRef}
      role='dialog'
      aria-label={t('preview.kanban_csv_panel')}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      className='absolute right-0 top-full z-[var(--z-popover)] mt-1 flex w-64 flex-col gap-1 rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-overlay)] p-2 shadow-[var(--shadow-pop)]'
    >
      <CsvPanelButton
        action='export'
        label={t('preview.kanban_csv_export')}
        icon={<Download size={13} aria-hidden />}
        onClick={onExport}
      />
      <CsvPanelButton
        action='import'
        label={t('preview.kanban_csv_import')}
        icon={<Upload size={13} aria-hidden />}
        onClick={() => fileRef.current?.click()}
      />
      <input
        ref={fileRef}
        type='file'
        accept={CSV_FILE_ACCEPT}
        aria-label={t('preview.kanban_csv_import_file')}
        className='hidden'
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      {feedback.length > 0 && (
        <p role='status' className='flex flex-col gap-0.5 text-[length:var(--text-11)] text-[var(--text-tertiary)]'>
          {feedback.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </p>
      )}
    </div>
  )
}

/**
 * The two doors themselves: what each writes, and the last thing either one answered. The file
 * chooser belongs here too, since emptying it is part of the import step rather than the toggle.
 */
function useCsvDoors(entry: KanbanCsvEntry) {
  const { title, columns, items, commitData } = entry
  const [feedback, setFeedback] = useState<string[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const handleExport = () => {
    downloadTextFile(kanbanCsvFilename(title), kanbanToCsv(columns, items), CSV_MIME)
    setFeedback([t('preview.kanban_csv_exported', { count: items.length })])
  }

  const handleFile = async (file: File | undefined) => {
    // Empty the chooser first: the same file picked twice is not a change otherwise.
    if (fileRef.current) fileRef.current.value = ''
    if (!file) return
    const outcome = importKanbanCsv(await file.text(), columns)
    setFeedback(outcomeLines(outcome))
    if (!outcome.ok) return
    commitData((prev) => ({
      ...prev,
      // The schema is only rewritten when the file named groups the board had never declared.
      ...(outcome.newOptions > 0 ? { columns: outcome.columns } : {}),
      items: [...prev.items, ...outcome.items],
    }))
  }

  return { feedback, fileRef, handleExport, handleFile }
}

/**
 * The board's CSV door. The panel stays open after either direction runs, because its answer —
 * how many rows went out, which file the board refused — is the one thing the reader still needs
 * once the browser has taken the file or the picker has closed.
 */
export function KanbanCsvAction(entry: KanbanCsvEntry) {
  useLocaleRepaint()
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelId = useId()
  useClickOutside([panelRef, btnRef], open, () => setOpen(false))
  useEscape(open, () => setOpen(false))
  const { feedback, fileRef, handleExport, handleFile } = useCsvDoors(entry)

  return (
    <div className='relative'>
      <button
        ref={btnRef}
        type='button'
        data-kanban-csv
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1 rounded-[var(--r-md)] px-2 py-1 text-[length:var(--text-12)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] ${
          open ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]' : ''
        }`}
        aria-haspopup='dialog'
        aria-expanded={open}
        {...(open ? { 'aria-controls': panelId } : {})}
      >
        <FileSpreadsheet size={13} aria-hidden />
        <span>{t('preview.kanban_csv')}</span>
      </button>
      {open && (
        <KanbanCsvPanel
          panelId={panelId}
          panelRef={panelRef}
          fileRef={fileRef}
          feedback={feedback}
          onExport={handleExport}
          onFile={handleFile}
        />
      )}
    </div>
  )
}

import { useState } from 'react'
import { Download, FileJson, FileSpreadsheet, FileText, Upload } from 'lucide-react'
import type { BlogLink, BlogLinkCategory } from '@shared/types'
import { Modal } from '../../../components/overlay'
import { Button } from '../../../components/primitives'
import { Textarea } from '../../../components/form'
import { t } from '../../../lib/i18n'
import { useUi } from '../../../store/ui'
import {
  IMPORT_FILE_MAX_BYTES,
  ImportParseError,
  formatFromFileName,
  generateBookmarkHtml,
  generateCfAstroJson,
  generateCsv,
  importFileRejection,
  parseImportPayload,
  type ParsedImport,
} from './link-import-format'

export interface LinkImportExportModalProps {
  open: boolean
  onClose: () => void
  links: BlogLink[]
  categories: BlogLinkCategory[]
  onImport: (payload: Pick<ParsedImport, 'categories' | 'links'>) => Promise<{ importedCategories: number; importedLinks: number } | null>
}

const MODAL_WIDTH = 620

export function LinkImportExportModal(props: LinkImportExportModalProps) {
  const state = useImportExportState(props)

  return (
    <Modal open={props.open} onClose={props.onClose} title={t('blog.link_import_export')} width={MODAL_WIDTH}>
      <div className='space-y-4 py-[var(--sp-1)]'>
        <ImportExportHeader
          activeTab={state.activeTab}
          setActiveTab={state.setActiveTab}
          format={state.format}
          setFormat={state.setFormat}
        />
        {state.activeTab === 'import' ? (
          <LinkImportTab
            format={state.format}
            inputText={state.inputText}
            setInputText={state.setInputText}
            busy={state.busy}
            handleFileUpload={state.handleFileUpload}
            handleExecuteImport={state.handleExecuteImport}
            onClose={props.onClose}
          />
        ) : (
          <LinkExportTab
            linksCount={props.links.length}
            categoriesCount={props.categories.length}
            onExport={state.handleExport}
            onClose={props.onClose}
          />
        )}
      </div>
    </Modal>
  )
}

function ImportExportHeader({
  activeTab,
  setActiveTab,
  format,
  setFormat,
}: {
  activeTab: 'import' | 'export'
  setActiveTab: (t: 'import' | 'export') => void
  format: 'json' | 'html' | 'csv'
  setFormat: (f: 'json' | 'html' | 'csv') => void
}) {
  return (
    <>
      <div className='flex border-b border-[var(--border-subtle)]'>
        <button
          type='button'
          onClick={() => setActiveTab('import')}
          className={`px-[var(--sp-4)] py-[var(--sp-2)] text-[length:var(--text-13)] font-medium border-b-2 ${
            activeTab === 'import' ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          {t('blog.link_import_title')}
        </button>
        <button
          type='button'
          onClick={() => setActiveTab('export')}
          className={`px-[var(--sp-4)] py-[var(--sp-2)] text-[length:var(--text-13)] font-medium border-b-2 ${
            activeTab === 'export' ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          {t('blog.link_export_title')}
        </button>
      </div>

      <div className='flex gap-[var(--sp-2)]'>
        <FormatSelectButton current={format} target='json' label={t('blog.link_import_format_json')} icon={<FileJson size={14} />} onSelect={setFormat} />
        <FormatSelectButton current={format} target='html' label={t('blog.link_import_format_html')} icon={<FileText size={14} />} onSelect={setFormat} />
        <FormatSelectButton current={format} target='csv' label={t('blog.link_import_format_csv')} icon={<FileSpreadsheet size={14} />} onSelect={setFormat} />
      </div>
    </>
  )
}

type ImportExportToast = ReturnType<typeof useUi.getState>['toast']

function useImportExportState({ links, categories, onImport, onClose }: LinkImportExportModalProps) {
  const toast = useUi((s) => s.toast)
  const [activeTab, setActiveTab] = useState<'import' | 'export'>('import')
  const [format, setFormat] = useState<'json' | 'html' | 'csv'>('json')
  const [inputText, setInputText] = useState('')
  const [busy, setBusy] = useState(false)

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => readChosenFile(e, { toast, setInputText, setFormat })
  const handleExecuteImport = () => executeImport({ format, inputText, onImport, onClose, toast, setInputText, setBusy })
  const handleExport = () => exportLinks(format, links, categories, toast)

  return { activeTab, setActiveTab, format, setFormat, inputText, setInputText, busy, handleFileUpload, handleExecuteImport, handleExport }
}

interface ChosenFileSink {
  toast: ImportExportToast
  setInputText: (text: string) => void
  setFormat: (format: 'json' | 'html' | 'csv') => void
}

async function readChosenFile(event: React.ChangeEvent<HTMLInputElement>, sink: ChosenFileSink): Promise<void> {
  const file = event.target.files?.[0]
  // The input is cleared before the read: choosing the same file twice has to fire `change` again,
  // which it does not while the control still remembers the name.
  event.target.value = ''
  if (!file) return
  const rejection = importFileRejection(file)
  if (rejection) {
    sink.toast({ title: t(rejection, { value0: Math.round(IMPORT_FILE_MAX_BYTES / 1024) }), tone: 'danger' })
    return
  }
  try {
    sink.setInputText(await file.text())
    // The tab follows the file: the reader chose a format by choosing a file.
    sink.setFormat(formatFromFileName(file.name))
  } catch {
    sink.toast({ title: t('blog.link_import_read_failed'), tone: 'danger' })
  }
}

interface ImportRequest {
  format: 'json' | 'html' | 'csv'
  inputText: string
  onImport: LinkImportExportModalProps['onImport']
  onClose: () => void
  toast: ImportExportToast
  setInputText: (text: string) => void
  setBusy: (busy: boolean) => void
}

async function executeImport(request: ImportRequest): Promise<void> {
  const { format, inputText, onImport, onClose, toast } = request
  if (!inputText.trim()) return
  request.setBusy(true)
  try {
    const parsed = parseImportPayload(format, inputText)
    if (parsed.links.length === 0) {
      toast({ title: t('blog.link_import_nothing_to_import'), tone: 'danger' })
      return
    }
    const result = await onImport({ categories: parsed.categories, links: parsed.links })
    if (!result) return
    toast({ title: t('blog.link_import_success', { categories: result.importedCategories, links: result.importedLinks }), tone: 'success' })
    if (parsed.skipped > 0) toast({ title: t('blog.link_import_skipped', { value0: parsed.skipped }), tone: 'default' })
    request.setInputText('')
    onClose()
  } catch (err: unknown) {
    toast({ title: err instanceof ImportParseError ? t(err.messageKey) : t('common.action_failed'), tone: 'danger' })
  } finally {
    request.setBusy(false)
  }
}

function exportLinks(format: 'json' | 'html' | 'csv', links: BlogLink[], categories: BlogLinkCategory[], toast: ImportExportToast): void {
  if (format === 'html') downloadFile(generateBookmarkHtml(links, categories), 'bookmarks.html', 'text/html')
  else if (format === 'csv') downloadFile(generateCsv(links, categories), 'links.csv', 'text/csv')
  else downloadFile(generateCfAstroJson(links, categories), 'cloudnav_backup.json', 'application/json')
  toast({ title: t('blog.link_export_success'), tone: 'success' })
}

function LinkImportTab({
  format, inputText, setInputText, busy, handleFileUpload, handleExecuteImport, onClose,
}: {
  format: 'json' | 'html' | 'csv'
  inputText: string
  setInputText: (v: string) => void
  busy: boolean
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void
  handleExecuteImport: () => void
  onClose: () => void
}) {
  const placeholder = format === 'json' ? '{"categories": [...], "links": [...]}' : format === 'csv' ? 'name,url,description,avatar,category' : '<!DOCTYPE NETSCAPE-Bookmark-file-1>...'
  return (
    <div className='space-y-3'>
      <div className='flex items-center justify-between'>
        <span className='text-[length:var(--text-12)] text-[var(--text-secondary)]'>{t('blog.link_import_paste_or_upload')}</span>
        <label className='cursor-pointer inline-flex items-center gap-[var(--sp-1)] rounded bg-[var(--bg-sunken)] px-[var(--sp-2-5)] py-[var(--sp-1)] text-[length:var(--text-11)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)]'>
          <Upload size={12} />
          {t('blog.link_choose_file')}
          <input type='file' accept='.json,.html,.htm,.csv' className='hidden' onChange={handleFileUpload} />
        </label>
      </div>
      <Textarea value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder={placeholder} rows={8} className='font-mono text-[length:var(--text-11)]' />
      <div className='flex justify-end gap-[var(--sp-2)] pt-[var(--sp-2)]'>
        <Button type='button' variant='ghost' onClick={onClose}>{t('common.cancel')}</Button>
        <Button type='button' variant='primary' loading={busy} disabled={!inputText.trim()} onClick={handleExecuteImport}>{t('blog.link_import_action')}</Button>
      </div>
    </div>
  )
}

function LinkExportTab({
  linksCount, categoriesCount, onExport, onClose,
}: {
  linksCount: number
  categoriesCount: number
  onExport: () => void
  onClose: () => void
}) {
  return (
    <div className='space-y-4 py-[var(--sp-2)]'>
      <p className='text-[length:var(--text-12)] text-[var(--text-secondary)]'>
        {t('blog.links_subtitle')} ({t('blog.link_export_summary', { links: linksCount, categories: categoriesCount })})
      </p>
      <div className='flex justify-end gap-[var(--sp-2)] pt-[var(--sp-2)]'>
        <Button type='button' variant='ghost' onClick={onClose}>{t('common.cancel')}</Button>
        <Button type='button' variant='primary' onClick={onExport}>
          <Download size={14} />
          {t('blog.link_export_action')}
        </Button>
      </div>
    </div>
  )
}

function FormatSelectButton({ current, target, label, icon, onSelect }: { current: string; target: 'json' | 'html' | 'csv'; label: string; icon: React.ReactNode; onSelect: (f: 'json' | 'html' | 'csv') => void }) {
  const isSelected = current === target
  return (
    <button
      type='button'
      onClick={() => onSelect(target)}
      className={`flex items-center gap-[var(--sp-1-5)] px-[var(--sp-2-5)] py-[var(--sp-1-5)] rounded-[var(--r-sm)] text-[length:var(--text-11)] border transition-colors ${
        isSelected
          ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)] font-medium'
          : 'border-[var(--border-subtle)] bg-[var(--bg-sunken)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

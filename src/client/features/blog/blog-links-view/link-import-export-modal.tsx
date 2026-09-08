import { useState } from 'react'
import { Download, FileJson, FileSpreadsheet, FileText, Upload } from 'lucide-react'
import type { BlogLink, BlogLinkCategory } from '@shared/types'
import { Modal } from '../../../components/overlay'
import { Button } from '../../../components/primitives'
import { Textarea } from '../../../components/form'
import { t } from '../../../lib/i18n'
import { useUi } from '../../../store/ui'

export interface LinkImportExportModalProps {
  open: boolean
  onClose: () => void
  links: BlogLink[]
  categories: BlogLinkCategory[]
  onImport: (payload: {
    categories: Array<{ id?: string; name: string; icon?: string | null; parentId?: string | null; sortOrder?: number }>
    links: Array<Partial<BlogLink>>
  }) => Promise<{ importedCategories: number; importedLinks: number }>
}

const MODAL_WIDTH = 620

export function LinkImportExportModal(props: LinkImportExportModalProps) {
  const state = useImportExportState(props)

  return (
    <Modal open={props.open} onClose={props.onClose} title={t('blog.link_import_export')} width={MODAL_WIDTH}>
      <div className='space-y-4 py-1'>
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
          className={`px-4 py-2 text-[length:var(--text-13)] font-medium border-b-2 ${
            activeTab === 'import' ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          {t('blog.link_import_title')}
        </button>
        <button
          type='button'
          onClick={() => setActiveTab('export')}
          className={`px-4 py-2 text-[length:var(--text-13)] font-medium border-b-2 ${
            activeTab === 'export' ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          {t('blog.link_export_title')}
        </button>
      </div>

      <div className='flex gap-2'>
        <FormatSelectButton current={format} target='json' label={t('blog.link_import_format_json')} icon={<FileJson size={14} />} onSelect={setFormat} />
        <FormatSelectButton current={format} target='html' label={t('blog.link_import_format_html')} icon={<FileText size={14} />} onSelect={setFormat} />
        <FormatSelectButton current={format} target='csv' label={t('blog.link_import_format_csv')} icon={<FileSpreadsheet size={14} />} onSelect={setFormat} />
      </div>
    </>
  )
}

function useImportExportState({ links, categories, onImport, onClose }: LinkImportExportModalProps) {
  const toast = useUi((s) => s.toast)
  const [activeTab, setActiveTab] = useState<'import' | 'export'>('import')
  const [format, setFormat] = useState<'json' | 'html' | 'csv'>('json')
  const [inputText, setInputText] = useState('')
  const [busy, setBusy] = useState(false)

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    setInputText(text)
    if (file.name.endsWith('.html') || file.name.endsWith('.htm')) setFormat('html')
    else if (file.name.endsWith('.csv')) setFormat('csv')
    else if (file.name.endsWith('.json')) setFormat('json')
  }

  const handleExecuteImport = async () => {
    if (!inputText.trim()) return
    setBusy(true)
    try {
      const payload = format === 'html' ? parseBookmarksHtml(inputText) : format === 'csv' ? parseCsvLinks(inputText) : parseJsonLinks(inputText)
      const result = await onImport(payload)
      toast({ title: t('blog.link_import_success', { categories: result.importedCategories, links: result.importedLinks }), tone: 'success' })
      setInputText('')
      onClose()
    } catch (err: unknown) {
      toast({ title: err instanceof Error ? err.message : 'Import failed', tone: 'danger' })
    } finally {
      setBusy(false)
    }
  }

  const handleExport = () => {
    if (format === 'html') downloadFile(generateBookmarkHtml(links, categories), 'bookmarks.html', 'text/html')
    else if (format === 'csv') downloadFile(generateCsv(links, categories), 'links.csv', 'text/csv')
    else downloadFile(generateCfAstroJson(links, categories), 'cloudnav_backup.json', 'application/json')
    toast({ title: t('blog.link_export_success'), tone: 'success' })
  }

  return { activeTab, setActiveTab, format, setFormat, inputText, setInputText, busy, handleFileUpload, handleExecuteImport, handleExport }
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
        <label className='cursor-pointer inline-flex items-center gap-1 rounded bg-[var(--bg-sunken)] px-2.5 py-1 text-[length:var(--text-11)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)]'>
          <Upload size={12} />
          {t('blog.link_choose_file')}
          <input type='file' accept='.json,.html,.htm,.csv' className='hidden' onChange={handleFileUpload} />
        </label>
      </div>
      <Textarea value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder={placeholder} rows={8} className='font-mono text-[length:var(--text-11)]' />
      <div className='flex justify-end gap-2 pt-2'>
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
    <div className='space-y-4 py-2'>
      <p className='text-[length:var(--text-12)] text-[var(--text-secondary)]'>
        {t('blog.links_subtitle')} ({t('blog.link_export_summary', { links: linksCount, categories: categoriesCount })})
      </p>
      <div className='flex justify-end gap-2 pt-2'>
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
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--r-sm)] text-[length:var(--text-11)] border transition-colors ${
        isSelected
          ? 'border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)] font-medium'
          : 'border-[var(--border-subtle)] bg-[var(--bg-sunken)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

function parseJsonLinks(text: string) {
  const parsed = JSON.parse(text)
  const categories = Array.isArray(parsed.categories) ? parsed.categories : []
  const links = Array.isArray(parsed.links) ? parsed.links : Array.isArray(parsed) ? parsed : []
  return { categories, links }
}

function resolveCsvCategory(
  rootCat: string,
  subCat: string | undefined,
  catMap: Map<string, string>,
  categories: Array<{ id: string; name: string; parentId: string | null }>,
): string | null {
  if (!rootCat) return null
  if (!catMap.has(rootCat)) {
    const id = `cat-${catMap.size + 1}`
    catMap.set(rootCat, id)
    categories.push({ id, name: rootCat, parentId: null })
  }
  const rootId = catMap.get(rootCat)!
  if (!subCat) return rootId

  const subKey = `${rootCat}/${subCat}`
  if (!catMap.has(subKey)) {
    const subId = `cat-${catMap.size + 1}`
    catMap.set(subKey, subId)
    categories.push({ id: subId, name: subCat, parentId: rootId })
  }
  return catMap.get(subKey)!
}

function parseCsvLinks(text: string) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length === 0) return { categories: [], links: [] }

  const catMap = new Map<string, string>()
  const categories: Array<{ id: string; name: string; parentId: string | null }> = []
  const links: Array<Partial<BlogLink>> = []

  const startIdx = lines[0].toLowerCase().includes('url') ? 1 : 0
  for (let i = startIdx; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim().replace(/^["']|["']$/g, ''))
    if (!cols[0] || !cols[1]) continue
    const [name, url, description, avatar, rootCat, subCat] = cols
    const catId = resolveCsvCategory(rootCat, subCat, catMap, categories)
    links.push({ name, url, description: description || null, avatar: avatar || null, categoryId: catId })
  }
  return { categories, links }
}

function processBookmarkNode(
  child: Element,
  parentCatId: string | null,
  getOrCreateCat: (name: string, parentId: string | null) => string,
  traverse: (el: Element, pId: string | null) => void,
  links: Array<Partial<BlogLink>>,
) {
  if (child.tagName.toUpperCase() !== 'DT') return
  const h3 = child.querySelector('h3')
  const dl = child.querySelector('dl')
  const a = child.querySelector('a')
  if (h3 && dl) {
    const catName = h3.textContent?.trim() || 'Folder'
    const currentCatId = getOrCreateCat(catName, parentCatId)
    traverse(dl, currentCatId)
    return
  }
  if (!a) return
  const url = a.getAttribute('href')
  if (!url || url.startsWith('chrome://') || url.startsWith('about:')) return
  const name = a.textContent?.trim() || url
  const icon = a.getAttribute('icon')
  links.push({ name, url, avatar: icon || null, categoryId: parentCatId })
}

function parseBookmarksHtml(text: string) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(text, 'text/html')
  const categories: Array<{ id: string; name: string; parentId: string | null }> = []
  const links: Array<Partial<BlogLink>> = []
  const catMap = new Map<string, string>()

  const getOrCreateCat = (name: string, parentId: string | null = null): string => {
    const key = `${parentId ?? ''}/${name}`
    if (catMap.has(key)) return catMap.get(key)!
    const id = `bm-cat-${catMap.size + 1}`
    catMap.set(key, id)
    categories.push({ id, name, parentId })
    return id
  }

  const traverse = (element: Element, parentCatId: string | null) => {
    for (const child of Array.from(element.children)) {
      processBookmarkNode(child, parentCatId, getOrCreateCat, traverse, links)
    }
  }

  const rootDl = doc.querySelector('dl')
  if (rootDl) traverse(rootDl, null)
  return { categories, links }
}

function generateCfAstroJson(links: BlogLink[], categories: BlogLinkCategory[]): string {
  const catItems = categories.map((c) => ({
    id: c.id,
    name: c.name,
    icon: c.icon || 'Folder',
    parentId: c.parentId || null,
    sortOrder: c.sortOrder || 0,
    createdAt: c.createdAt || Date.now(),
  }))
  const linkItems = links.map((l) => ({
    id: l.id,
    title: l.name,
    url: l.url,
    icon: l.avatar || null,
    description: l.description || null,
    categoryId: l.categoryId || 'default',
    pinned: Boolean(l.isPinned),
    pinnedOrder: l.pinnedOrder || 0,
    sortOrder: l.sortOrder || 0,
    createdAt: l.createdAt || Date.now(),
  }))
  return JSON.stringify({ categories: catItems, links: linkItems }, null, 2)
}

function generateBookmarkHtml(links: BlogLink[], categories: BlogLinkCategory[]): string {
  const now = Math.floor(Date.now() / 1000)
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Bookmarks</TITLE>\n<H1>Bookmarks</H1>\n<DL><p>\n`
  for (const cat of categories.filter((c) => !c.parentId)) {
    html += `  <DT><H3 ADD_DATE="${now}">${escape(cat.name)}</H3>\n  <DL><p>\n`
    for (const l of links.filter((link) => link.categoryId === cat.id)) {
      html += `    <DT><A HREF="${escape(l.url)}" ADD_DATE="${now}">${escape(l.name)}</A>\n`
    }
    for (const sub of categories.filter((c) => c.parentId === cat.id)) {
      html += `    <DT><H3 ADD_DATE="${now}">${escape(sub.name)}</H3>\n    <DL><p>\n`
      for (const l of links.filter((link) => link.categoryId === sub.id)) {
        html += `      <DT><A HREF="${escape(l.url)}" ADD_DATE="${now}">${escape(l.name)}</A>\n`
      }
      html += `    </DL><p>\n`
    }
    html += `  </DL><p>\n`
  }
  html += `</DL><p>`
  return html
}

function getCategoryCsvNames(cat: BlogLinkCategory | undefined, categories: BlogLinkCategory[]): { rootName: string; subName: string } {
  if (!cat) return { rootName: '', subName: '' }
  if (!cat.parentId) return { rootName: cat.name, subName: '' }
  const parent = categories.find((c) => c.id === cat.parentId)
  return { rootName: parent ? parent.name : '', subName: cat.name }
}

function generateCsv(links: BlogLink[], categories: BlogLinkCategory[]): string {
  const rows = ['Name,URL,Description,Avatar,Category,Subcategory']
  for (const l of links) {
    const cat = categories.find((c) => c.id === l.categoryId)
    const { rootName, subName } = getCategoryCsvNames(cat, categories)
    rows.push([
      `"${(l.name || '').replace(/"/g, '""')}"`,
      `"${(l.url || '').replace(/"/g, '""')}"`,
      `"${(l.description || '').replace(/"/g, '""')}"`,
      `"${(l.avatar || '').replace(/"/g, '""')}"`,
      `"${rootName.replace(/"/g, '""')}"`,
      `"${subName.replace(/"/g, '""')}"`,
    ].join(','))
  }
  return rows.join('\n')
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

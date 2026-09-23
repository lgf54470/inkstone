import { memo, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, Smile } from 'lucide-react'
import { Drawer, Modal, useClickOutside, useEscape } from '../../../../components/overlay'
import { t, useLocaleRepaint } from '../../../i18n'
import { Z_INDEX } from '../../../../lib/z-index'
import { getKanbanDotColor } from '../colors'
import { getKanbanDueDate } from '../date-fields'
import { formatKanbanOptionLabel, formatKanbanPropertyName } from '../i18n-helpers'
import type { KanbanItem, KanbanOption, KanbanProperty } from '../types'
import { KanbanIconBadge } from './kanban-icon-badge'
import { KanbanIconPicker } from './kanban-icon-picker'
import { DetailDescription } from './kanban-item-detail-description'
import { DetailComments } from './kanban-comments'
import {
  DetailAttachmentsAndSubtasks,
  DetailDatesGrid,
  DetailFooter,
  DetailPropertiesGrid,
  DetailTagsField,
  PriorityChips,
  StatusOptionList,
} from './kanban-item-detail-fields'

interface KanbanItemDetailProps {
  item: KanbanItem | null
  columns: KanbanProperty[]
  onClose: () => void
  onUpdate: (updated: KanbanItem) => void
  onDelete: (id: string) => void
  onConvertSubtask: (subtaskId: string) => void
  onAddColumnOption?: (columnId: string, option: KanbanOption) => void
  /** Who each member column may offer, keyed by column id. */
  people?: Record<string, string[]>
  /** How this host turns description markdown into HTML; absent means the description stays source-only. */
  renderDescription?: (source: string) => string
  /**
   * How the card is opened. A note shows one modal at a time and the board behind it is a few
   * hundred pixels tall, so the centred dialog is right there; the full screen board has room for
   * the board *and* the card, and a reader working through a column keeps the columns in view — so
   * it opens the card as a right-hand peek instead (user decision, 2026-09-23).
   */
  variant?: 'dialog' | 'peek'
}

const DETAIL_MODAL_WIDTH = 640
/** Narrower than the dialog: the peek stands beside the board rather than in place of it. */
const DETAIL_PEEK_WIDTH = 420

function DetailStatusDropdown({
  statusCol,
  statusVal,
  onChangeStatus,
}: {
  statusCol?: KanbanProperty
  statusVal?: unknown
  onChangeStatus: (val: string) => void
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const panelId = useId()
  const options = statusCol?.options ?? []
  const opt = options.find((o) => o.id === statusVal || o.label === statusVal)
  const color = opt?.color ?? 'gray'

  const handleClose = () => setOpen(false)

  useClickOutside([containerRef], open, handleClose)
  useEscape(open, handleClose)

  return (
    <div ref={containerRef} className='relative inline-block'>
      <button
        type='button'
        onClick={() => setOpen((o) => !o)}
        className='flex items-center gap-2 rounded-[var(--r-sm)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1 text-[length:var(--text-12)] font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--border-default)] hover:text-[var(--text-primary)]'
        aria-haspopup='listbox'
        aria-expanded={open}
        {...(open ? { 'aria-controls': panelId } : {})}
      >
        <span
          className='size-2.5 rounded-full shrink-0'
          style={{ backgroundColor: getKanbanDotColor(color) }}
        />
        <span>{opt ? formatKanbanOptionLabel(opt, 'status') : t('preview.kanban_not_set')}</span>
        <ChevronDown size={13} className='text-[var(--text-tertiary)]' />
      </button>

      {open && (
        <StatusOptionList
          id={panelId}
          label={statusCol ? formatKanbanPropertyName(statusCol) : t('preview.kanban_prop_status')}
          options={options}
          current={statusVal}
          onSelect={(id) => {
            onChangeStatus(id)
            setOpen(false)
          }}
        />
      )}
    </div>
  )
}

function DetailTitleDraft({
  itemId,
  title,
  onChangeTitle,
}: {
  itemId: string
  title: string
  onChangeTitle: (t: string) => void
}) {
  const [draft, setDraft] = useState(title)
  const lastTarget = useRef(itemId)
  const lastSent = useRef(title)
  if (lastTarget.current !== itemId) {
    lastTarget.current = itemId
    lastSent.current = title
    setDraft(title)
  }
  const commitDraft = () => {
    if (draft === lastSent.current) return
    lastSent.current = draft
    onChangeTitle(draft)
  }

  return (
    <input
      type='text'
      value={draft}
      data-owns-escape
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commitDraft}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commitDraft()
        if (e.key === 'Escape') setDraft(lastSent.current)
      }}
      className='w-full rounded-[var(--r-xs)] border-0 bg-transparent text-[length:var(--text-18)] font-bold text-[var(--text-primary)] outline-none focus:bg-[var(--bg-inset)] px-1'
      placeholder={t('preview.kanban_card_title')}
    />
  )
}

function DetailHeader({
  itemId,
  icon,
  title,
  statusCol,
  statusVal,
  onChangeIcon,
  onChangeTitle,
  onChangeStatus,
}: {
  itemId: string
  icon?: string
  title: string
  statusCol?: KanbanProperty
  statusVal?: unknown
  onChangeIcon: (icon: string | null) => void
  onChangeTitle: (t: string) => void
  onChangeStatus: (val: string) => void
}) {
  const [iconPickerOpen, setIconPickerOpen] = useState(false)
  const iconBtnRef = useRef<HTMLButtonElement>(null)
  const iconPanelId = useId()

  return (
    <div className='flex flex-col gap-2.5'>
      <DetailStatusDropdown
        statusCol={statusCol}
        statusVal={statusVal}
        onChangeStatus={onChangeStatus}
      />

      <div className='flex items-center gap-2'>
        <button
          ref={iconBtnRef}
          type='button'
          onClick={() => setIconPickerOpen((o) => !o)}
          className='flex size-9 shrink-0 items-center justify-center rounded-[var(--r-sm)] border border-[var(--border-subtle)] bg-[var(--bg-raised)] hover:bg-[var(--bg-hover)]'
          title={t('preview.kanban_icon_picker')}
          aria-haspopup='dialog'
          aria-expanded={iconPickerOpen}
          {...(iconPickerOpen ? { 'aria-controls': iconPanelId } : {})}
        >
          {icon ? <KanbanIconBadge icon={icon} size={20} /> : <Smile size={18} className='text-[var(--text-tertiary)]' />}
        </button>
        <KanbanIconPicker
          open={iconPickerOpen}
          panelId={iconPanelId}
          anchorRef={iconBtnRef}
          onClose={() => setIconPickerOpen(false)}
          onSelectIcon={onChangeIcon}
          currentIcon={icon}
        />
        <DetailTitleDraft itemId={itemId} title={title} onChangeTitle={onChangeTitle} />
      </div>
    </div>
  )
}

interface DetailModalContentProps {
  item: KanbanItem
  columns: KanbanProperty[]
  tagVals: string[]
  priorityCol?: KanbanProperty
  startDateVal: unknown
  dueDateVal: unknown
  localTagOptions: KanbanOption[]
  onPropertyChange: (propertyId: string, value: unknown) => void
  onAddTagOption: (option: KanbanOption) => void
  onUpdate: (updated: KanbanItem) => void
  onConvertSubtask: (subtaskId: string) => void
  people?: Record<string, string[]>
  renderDescription?: (source: string) => string
}

function DetailModalContent({
  item,
  columns,
  tagVals,
  priorityCol,
  startDateVal,
  dueDateVal,
  localTagOptions,
  onPropertyChange,
  onAddTagOption,
  onUpdate,
  onConvertSubtask,
  people,
  renderDescription,
}: DetailModalContentProps) {
  return (
    <div className='flex flex-col gap-5 py-2'>
      <DetailTagsField
        tagVals={tagVals}
        options={localTagOptions}
        onChangeTags={(nextTags, newOption) => {
          onPropertyChange('tags', nextTags)
          if (newOption) onAddTagOption(newOption)
        }}
      />

      <PriorityChips
        priorityCol={priorityCol}
        currentPriority={item.properties.priority}
        onChangePriority={(val) => onPropertyChange('priority', val)}
      />

      <DetailDatesGrid
        startDateVal={startDateVal}
        dueDateVal={dueDateVal}
        onPropertyChange={onPropertyChange}
      />

      <DetailPropertiesGrid
        columns={columns}
        properties={item.properties}
        people={people}
        onChangeProperty={onPropertyChange}
      />

      {/* A box that holds an uncommitted draft is keyed by the card it belongs to, so switching cards
      gives a fresh one. The section name is part of the key because two such boxes sit side by side
      here, and React reads a repeated key as two children being the same child. */}
      <DetailDescription
        key={`description-${item.id}`}
        content={item.content || item.description}
        renderDescription={renderDescription}
        onChange={(desc) => onUpdate({ ...item, content: desc, description: desc })}
      />

      <DetailAttachmentsAndSubtasks item={item} onUpdate={onUpdate} onConvertSubtask={onConvertSubtask} />

      <DetailComments key={`comments-${item.id}`} item={item} people={people} onUpdate={onUpdate} />
    </div>
  )
}

function useKanbanDetailState(
  item: KanbanItem | null,
  columns: KanbanProperty[],
  onUpdate: (updated: KanbanItem) => void,
  onAddColumnOption?: (columnId: string, option: KanbanOption) => void,
) {
  const handlePropertyChange = (propertyId: string, value: unknown) => {
    if (!item) return
    onUpdate({ ...item, properties: { ...item.properties, [propertyId]: value } })
  }

  const statusCol = columns.find((c) => c.id === 'status')
  const priorityCol = columns.find((c) => c.id === 'priority')
  const tagsCol = columns.find((c) => c.id === 'tags')
  const [localTagOptions, setLocalTagOptions] = useState<KanbanOption[]>(() => tagsCol?.options ?? [])

  useEffect(() => {
    if (tagsCol?.options) {
      setLocalTagOptions(tagsCol.options)
    }
  }, [tagsCol?.options])

  const handleAddTagOption = (newOpt: KanbanOption) => {
    setLocalTagOptions((prev) => {
      if (prev.some((o) => o.id === newOpt.id || o.label === newOpt.label)) return prev
      return [...prev, newOpt]
    })
    onAddColumnOption?.('tags', newOpt)
  }

  return { statusCol, priorityCol, tagsCol, localTagOptions, handlePropertyChange, handleAddTagOption }
}

interface DetailShellProps {
  onClose: () => void
  header: ReactNode
  content: ReactNode
  footer: ReactNode
}

/**
 * The overlay's shell: the card stands beside the board, so the columns a reader is working through
 * stay in view while the card is open, and the next one can be picked without leaving them.
 *
 * It carries its own head and foot so the card's name stays editable at the top and the destructive
 * action stays reachable at the bottom while the middle scrolls, which a drawer's single scroll area
 * does not do on its own. `Z_INDEX.menu` is the tier an overlay takes above a full screen surface —
 * the same move the music hub's drawers make — and it is required rather than decorative here: the
 * board itself is a modal at `--z-modal`, so a drawer at the default `--z-drawer` would be painted
 * behind the very board it peeks from.
 */
function KanbanCardPeek({ onClose, header, content, footer }: DetailShellProps) {
  return (
    <Drawer
      open
      onClose={onClose}
      side='right'
      width={DETAIL_PEEK_WIDTH}
      zIndex={Z_INDEX.menu}
      ariaLabel={t('preview.kanban_card_details')}
    >
      <div className='flex h-full flex-col'>
        <div className='shrink-0 border-b border-[var(--border-subtle)] px-4 py-3'>{header}</div>
        <div className='min-h-0 flex-1 overflow-y-auto px-4 py-3'>{content}</div>
        <div className='shrink-0 border-t border-[var(--border-subtle)] px-4 py-3'>{footer}</div>
      </div>
    </Drawer>
  )
}

/** A note's shell: the centred dialog, which is the room a block inside the editor does not have. */
function KanbanCardDialog({ onClose, header, content, footer }: DetailShellProps) {
  return (
    <Modal open onClose={onClose} width={DETAIL_MODAL_WIDTH} title={header} footer={footer}>
      {content}
    </Modal>
  )
}

function KanbanItemDetailBody({
  item,
  columns,
  onClose,
  onUpdate,
  onDelete,
  onConvertSubtask,
  onAddColumnOption,
  people,
  renderDescription,
  variant = 'dialog',
}: KanbanItemDetailProps & { item: KanbanItem }) {
  const { statusCol, priorityCol, localTagOptions, handlePropertyChange, handleAddTagOption } =
    useKanbanDetailState(item, columns, onUpdate, onAddColumnOption)

  const tagVals = Array.isArray(item.properties.tags) ? (item.properties.tags as string[]) : []
  const startDateVal = item.properties.startDate || ''
  const dueDateVal = getKanbanDueDate(item)

  const header = (
    <DetailHeader
      itemId={item.id}
      icon={item.icon}
      title={item.title}
      statusCol={statusCol}
      statusVal={item.properties.status}
      onChangeIcon={(icon) => onUpdate({ ...item, icon: icon ?? undefined })}
      onChangeTitle={(title) => onUpdate({ ...item, title })}
      onChangeStatus={(val) => handlePropertyChange('status', val)}
    />
  )
  const footer = <DetailFooter onDelete={() => { onDelete(item.id); onClose() }} onClose={onClose} />
  const content = (
    <DetailModalContent
      item={item}
      columns={columns}
      tagVals={tagVals}
      priorityCol={priorityCol}
      startDateVal={startDateVal}
      dueDateVal={dueDateVal}
      localTagOptions={localTagOptions}
      onPropertyChange={handlePropertyChange}
      onAddTagOption={handleAddTagOption}
      onUpdate={onUpdate}
      onConvertSubtask={onConvertSubtask}
      people={people}
      renderDescription={renderDescription}
    />
  )

  const shell = { onClose, header, content, footer }
  return variant === 'peek' ? <KanbanCardPeek {...shell} /> : <KanbanCardDialog {...shell} />
}

export const KanbanItemDetail = memo(function KanbanItemDetail(props: KanbanItemDetailProps) {
  useLocaleRepaint()
  if (!props.item) return null
  return <KanbanItemDetailBody {...props} item={props.item} />
})

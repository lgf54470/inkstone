import { memo, useEffect, useRef, useState } from 'react'
import { ChevronDown, Smile } from 'lucide-react'
import { Modal } from '../../../../components/overlay'
import { t } from '../../../i18n'
import { getKanbanDotColor } from '../colors'
import { formatKanbanOptionLabel } from '../i18n-helpers'
import type { KanbanItem, KanbanOption, KanbanProperty } from '../types'
import { KanbanIconBadge } from './kanban-icon-badge'
import { KanbanIconPicker } from './kanban-icon-picker'
import { KanbanTagPicker } from './kanban-tag-picker'
import {
  DetailAttachmentsAndSubtasks,
  DetailDatesGrid,
  DetailDescription,
  DetailFooter,
  DetailPropertiesGrid,
  PriorityChips,
  StatusOptionItem,
  useDropdownDismiss,
} from './kanban-item-detail-fields'

interface KanbanItemDetailProps {
  item: KanbanItem | null
  columns: KanbanProperty[]
  onClose: () => void
  onUpdate: (updated: KanbanItem) => void
  onDelete: (id: string) => void
  onAddColumnOption?: (columnId: string, option: KanbanOption) => void
}

const DETAIL_MODAL_WIDTH = 640

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
  const options = statusCol?.options ?? []
  const opt = options.find((o) => o.id === statusVal || o.label === statusVal)
  const color = opt?.color ?? 'gray'

  useDropdownDismiss(open, containerRef, () => setOpen(false))

  return (
    <div ref={containerRef} className='relative inline-block'>
      <button
        type='button'
        onClick={() => setOpen((o) => !o)}
        className='flex items-center gap-2 rounded-[var(--r-sm)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1 text-[length:var(--text-12)] font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--border-default)] hover:text-[var(--text-primary)]'
      >
        <span
          className='size-2.5 rounded-full shrink-0'
          style={{ backgroundColor: getKanbanDotColor(color) }}
        />
        <span>{opt ? formatKanbanOptionLabel(opt, 'status') : t('preview.kanban_not_set')}</span>
        <ChevronDown size={13} className='text-[var(--text-tertiary)]' />
      </button>

      {open && (
        <div
          role='listbox'
          className='absolute left-0 top-full z-50 mt-1 min-w-36 rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-overlay)] p-1 shadow-[var(--shadow-pop)]'
        >
          {options.map((o) => (
            <StatusOptionItem
              key={o.id}
              option={o}
              isSelected={o.id === statusVal || o.label === statusVal}
              onSelect={(id) => {
                onChangeStatus(id)
                setOpen(false)
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function DetailHeader({
  icon,
  title,
  statusCol,
  statusVal,
  onChangeIcon,
  onChangeTitle,
  onChangeStatus,
}: {
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
        >
          {icon ? <KanbanIconBadge icon={icon} size={20} /> : <Smile size={18} className='text-[var(--text-tertiary)]' />}
        </button>
        <KanbanIconPicker
          open={iconPickerOpen}
          anchorRef={iconBtnRef}
          onClose={() => setIconPickerOpen(false)}
          onSelectIcon={onChangeIcon}
          currentIcon={icon}
        />
        <input
          type='text'
          value={title}
          onChange={(e) => onChangeTitle(e.target.value)}
          className='w-full rounded-[var(--r-xs)] border-0 bg-transparent text-[length:var(--text-18)] font-bold text-[var(--text-primary)] outline-none focus:bg-[var(--bg-inset)] px-1'
          placeholder={t('preview.kanban_card_title')}
        />
      </div>
    </div>
  )
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
}: {
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
}) {
  return (
    <div className='flex flex-col gap-5 py-2'>
      <div className='flex flex-col gap-1.5'>
        <label className='text-[length:var(--text-11)] font-semibold text-[var(--text-tertiary)]'>
          {t('preview.kanban_prop_tags')}
        </label>
        <KanbanTagPicker
          tags={tagVals}
          options={localTagOptions}
          onChangeTags={(nextTags) => onPropertyChange('tags', nextTags)}
          onAddOption={onAddTagOption}
        />
      </div>

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
        onChangeProperty={onPropertyChange}
      />

      <DetailDescription
        content={item.content || item.description}
        onChange={(desc) => onUpdate({ ...item, content: desc, description: desc })}
      />

      <DetailAttachmentsAndSubtasks item={item} onUpdate={onUpdate} />
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

function KanbanItemDetailBody({
  item,
  columns,
  onClose,
  onUpdate,
  onDelete,
  onAddColumnOption,
}: KanbanItemDetailProps & { item: KanbanItem }) {
  const { statusCol, priorityCol, localTagOptions, handlePropertyChange, handleAddTagOption } =
    useKanbanDetailState(item, columns, onUpdate, onAddColumnOption)

  const tagVals = Array.isArray(item.properties.tags) ? (item.properties.tags as string[]) : []
  const startDateVal = item.properties.startDate || ''
  const dueDateVal = item.properties.dueDate || item.properties.endDate || ''

  return (
    <Modal
      open={Boolean(item)}
      onClose={onClose}
      width={DETAIL_MODAL_WIDTH}
      title={
        <DetailHeader
          icon={item.icon}
          title={item.title}
          statusCol={statusCol}
          statusVal={item.properties.status}
          onChangeIcon={(icon) => onUpdate({ ...item, icon: icon ?? undefined })}
          onChangeTitle={(title) => onUpdate({ ...item, title })}
          onChangeStatus={(val) => handlePropertyChange('status', val)}
        />
      }
      footer={<DetailFooter onDelete={() => { onDelete(item.id); onClose() }} onClose={onClose} />}
    >
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
      />
    </Modal>
  )
}

export const KanbanItemDetail = memo(function KanbanItemDetail(props: KanbanItemDetailProps) {
  if (!props.item) return null
  return <KanbanItemDetailBody {...props} item={props.item} />
})

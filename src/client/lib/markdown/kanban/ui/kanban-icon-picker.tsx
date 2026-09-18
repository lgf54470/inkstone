import { useRef, useState } from 'react'
import {
  AlertCircle,
  Bookmark,
  Calendar,
  CheckCircle,
  Clock,
  FileText,
  Flag,
  Folder,
  Layers,
  Smile,
  Sparkles,
  Star,
  Tag,
  Trash2,
  User,
} from 'lucide-react'
import { useClickOutside, useEscape } from '../../../../components/overlay'
import { t } from '../../../i18n'

const KANBAN_COMMON_EMOJIS = [
  '📝', '🎯', '🚀', '💡', '📌', '🏷️', '⭐', '☕', '🎨', '📦',
  '🛠️', '✅', '⏳', '🛑', '🔍', '📊', '📈', '💬', '📅', '🐛',
  '🔥', '🎉', '⚡', '💻', '🔒', '📱', '🔔', '✨', '🌐', '📚',
  '💼', '🧠', '🗂️', '🏆', '🧩', '📋', '🔑', '💎', '🌈', '☀️',
] as const

const KANBAN_COMMON_ICONS = [
  { name: 'CheckCircle', icon: CheckCircle },
  { name: 'Clock', icon: Clock },
  { name: 'AlertCircle', icon: AlertCircle },
  { name: 'FileText', icon: FileText },
  { name: 'Calendar', icon: Calendar },
  { name: 'Star', icon: Star },
  { name: 'Flag', icon: Flag },
  { name: 'Bookmark', icon: Bookmark },
  { name: 'Tag', icon: Tag },
  { name: 'User', icon: User },
  { name: 'Folder', icon: Folder },
  { name: 'Layers', icon: Layers },
  { name: 'Sparkles', icon: Sparkles },
] as const

interface KanbanIconPickerProps {
  open: boolean
  currentIcon?: string | null
  anchorRef: React.RefObject<HTMLElement | null>
  onClose: () => void
  onSelectIcon: (icon: string | null) => void
}

function EmojiGrid({
  onSelect,
}: {
  onSelect: (emoji: string) => void
}) {
  return (
    <div className='grid max-h-48 grid-cols-8 gap-1 overflow-y-auto p-2'>
      {KANBAN_COMMON_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          type='button'
          onClick={() => onSelect(emoji)}
          aria-label={emoji}
          className='flex size-7 items-center justify-center rounded-[var(--r-sm)] text-[length:var(--text-14)] transition-transform hover:scale-125 hover:bg-[var(--bg-hover)]'
        >
          {emoji}
        </button>
      ))}
    </div>
  )
}

function LucideIconGrid({
  onSelect,
}: {
  onSelect: (iconName: string) => void
}) {
  return (
    <div className='grid max-h-48 grid-cols-6 gap-1 overflow-y-auto p-2'>
      {KANBAN_COMMON_ICONS.map(({ name, icon: IconComponent }) => (
        <button
          key={name}
          type='button'
          onClick={() => onSelect(`lucide:${name}`)}
          title={name}
          aria-label={name}
          className='flex size-7 items-center justify-center rounded-[var(--r-sm)] text-[var(--text-secondary)] transition-transform hover:scale-110 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
        >
          <IconComponent size={15} />
        </button>
      ))}
    </div>
  )
}

function CustomEmojiInput({
  onSelect,
}: {
  onSelect: (emoji: string) => void
}) {
  const [val, setVal] = useState('')
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const trimmed = val.trim()
        if (trimmed) onSelect(Array.from(trimmed)[0] ?? trimmed)
      }}
      className='flex items-center gap-1.5 border-t border-[var(--border-subtle)] p-2'
    >
      <Smile size={13} className='text-[var(--text-tertiary)]' />
      <input
        type='text'
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder={t('preview.kanban_custom_emoji')}
        className='h-6 flex-1 rounded-[var(--r-xs)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-1.5 text-[length:var(--text-11)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]'
      />
    </form>
  )
}

function PickerHeaderTabs({
  tab,
  setTab,
  onRemove,
}: {
  tab: 'emoji' | 'icon'
  setTab: (t: 'emoji' | 'icon') => void
  onRemove: () => void
}) {
  return (
    <div className='flex items-center justify-between border-b border-[var(--border-subtle)] px-2 pt-1'>
      <div className='flex gap-1'>
        <button
          type='button'
          onClick={() => setTab('emoji')}
          className={`border-b-2 px-2 py-1 text-[length:var(--text-11)] font-semibold transition-colors ${
            tab === 'emoji'
              ? 'border-[var(--accent)] text-[var(--accent)]'
              : 'border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
          }`}
        >
          {t('preview.kanban_tab_emoji')}
        </button>
        <button
          type='button'
          onClick={() => setTab('icon')}
          className={`border-b-2 px-2 py-1 text-[length:var(--text-11)] font-semibold transition-colors ${
            tab === 'icon'
              ? 'border-[var(--accent)] text-[var(--accent)]'
              : 'border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
          }`}
        >
          {t('preview.kanban_tab_icons')}
        </button>
      </div>
      <button
        type='button'
        onClick={onRemove}
        title={t('preview.kanban_remove_icon')}
        className='rounded-[var(--r-xs)] p-1 text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--danger)]'
      >
        <Trash2 size={12} />
      </button>
    </div>
  )
}

export function KanbanIconPicker({
  open,
  anchorRef,
  onClose,
  onSelectIcon,
}: KanbanIconPickerProps) {
  const [tab, setTab] = useState<'emoji' | 'icon'>('emoji')
  const panelRef = useRef<HTMLDivElement>(null)

  useClickOutside([panelRef, anchorRef], open, onClose)
  useEscape(open, onClose)

  if (!open) return null

  const handleSelect = (val: string) => {
    onSelectIcon(val)
    onClose()
  }

  return (
    <div
      ref={panelRef}
      role='dialog'
      aria-label={t('preview.kanban_icon_picker')}
      className='absolute z-[var(--z-popover)] mt-1 w-64 rounded-[var(--r-lg)] border border-[var(--border-default)] bg-[var(--bg-overlay)] shadow-[var(--shadow-pop)]'
    >
      <PickerHeaderTabs
        tab={tab}
        setTab={setTab}
        onRemove={() => {
          onSelectIcon(null)
          onClose()
        }}
      />
      {tab === 'emoji' ? <EmojiGrid onSelect={handleSelect} /> : <LucideIconGrid onSelect={handleSelect} />}
      <CustomEmojiInput onSelect={handleSelect} />
    </div>
  )
}

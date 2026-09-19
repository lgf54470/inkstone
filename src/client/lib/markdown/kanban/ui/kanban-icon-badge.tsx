import type { ComponentType } from 'react'
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
  Sparkles,
  Star,
  Tag,
  User,
} from 'lucide-react'
import type { MessageKey } from '../../../i18n'

export interface KanbanIconOption {
  /** The identifier the fence stores, as `lucide:<name>`. */
  name: string
  icon: ComponentType<{ size?: number; className?: string }>
  labelKey: MessageKey
}

/**
 * The icons a board may use — one list for the picker that offers them and the badge that draws
 * them, so a name for a reader and the stored identifier cannot drift apart between the two.
 */
export const KANBAN_ICONS: readonly KanbanIconOption[] = [
  { name: 'CheckCircle', icon: CheckCircle, labelKey: 'preview.kanban_icon_check_circle' },
  { name: 'Clock', icon: Clock, labelKey: 'preview.kanban_icon_clock' },
  { name: 'AlertCircle', icon: AlertCircle, labelKey: 'preview.kanban_icon_alert_circle' },
  { name: 'FileText', icon: FileText, labelKey: 'preview.kanban_icon_file_text' },
  { name: 'Calendar', icon: Calendar, labelKey: 'preview.kanban_icon_calendar' },
  { name: 'Star', icon: Star, labelKey: 'preview.kanban_icon_star' },
  { name: 'Flag', icon: Flag, labelKey: 'preview.kanban_icon_flag' },
  { name: 'Bookmark', icon: Bookmark, labelKey: 'preview.kanban_icon_bookmark' },
  { name: 'Tag', icon: Tag, labelKey: 'preview.kanban_icon_tag' },
  { name: 'User', icon: User, labelKey: 'preview.kanban_icon_user' },
  { name: 'Folder', icon: Folder, labelKey: 'preview.kanban_icon_folder' },
  { name: 'Layers', icon: Layers, labelKey: 'preview.kanban_icon_layers' },
  { name: 'Sparkles', icon: Sparkles, labelKey: 'preview.kanban_icon_sparkles' },
]

export function KanbanIconBadge({ icon, size = 14 }: { icon?: string | null; size?: number }) {
  if (!icon) return null
  if (icon.startsWith('lucide:')) {
    const option = KANBAN_ICONS.find((entry) => entry.name === icon.slice(7))
    if (option) {
      const Component = option.icon
      return <Component size={size} className='shrink-0 text-[var(--accent)]' />
    }
  }
  return <span className='shrink-0 leading-none'>{icon}</span>
}

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

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  CheckCircle,
  Clock,
  AlertCircle,
  FileText,
  Calendar,
  Star,
  Flag,
  Bookmark,
  Tag,
  User,
  Folder,
  Layers,
  Sparkles,
}

export function KanbanIconBadge({ icon, size = 14 }: { icon?: string | null; size?: number }) {
  if (!icon) return null
  if (icon.startsWith('lucide:')) {
    const name = icon.slice(7)
    const Component = ICON_MAP[name]
    if (Component) return <Component size={size} className='shrink-0 text-[var(--accent)]' />
  }
  return <span className='shrink-0 leading-none'>{icon}</span>
}

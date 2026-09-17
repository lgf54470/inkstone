import { memo, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

interface InspectorSectionProps {
  title: string
  defaultOpen?: boolean
  action?: ReactNode
  children: ReactNode
}

export const InspectorSection = memo(function InspectorSection({
  title,
  defaultOpen = true,
  action,
  children,
}: InspectorSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className='border-b border-[var(--border-subtle)] last:border-b-0'>
      <div className='flex w-full items-center justify-between px-3 py-2 text-left font-semibold text-xs text-[var(--text-secondary)] select-none hover:bg-[var(--bg-hover)] transition-colors'>
        <button
          type='button'
          onClick={() => setIsOpen((o) => !o)}
          className='flex items-center gap-1.5 flex-1 text-left'
        >
          {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          <span>{title}</span>
        </button>
        {action && (
          <div className='flex items-center gap-1 shrink-0' onClick={(e) => e.stopPropagation()}>
            {action}
          </div>
        )}
      </div>
      {isOpen && <div className='px-3 pb-3 pt-1 space-y-3'>{children}</div>}
    </div>
  )
})

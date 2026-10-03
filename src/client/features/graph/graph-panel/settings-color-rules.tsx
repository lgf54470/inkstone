import { Check, Plus, X } from 'lucide-react'
import { ORGANIZER_COLORS, organizerColorLabel } from '@shared/organizer-colors'
import { GRAPH_COLOR_GROUP_LIMIT, type GraphColorGroup } from '../../../lib/graph-settings'
import { Button, IconButton } from '../../../components/primitives'
import { Input } from '../../../components/form'
import { Tooltip } from '../../../components/overlay'
import { secureRandomId } from '../../../lib/id'
import { cn } from '../../../lib/cn'
import { t } from '../../../lib/i18n'
import { COLOR_GROUP_QUERY_MAX } from './constants'

interface GraphColorRulesProps {
  groups: GraphColorGroup[]
  onChange: (groups: GraphColorGroup[]) => void
}

export function GraphColorRules({ groups, onChange }: GraphColorRulesProps) {
  const addGroup = () => onChange([
    ...groups,
    { id: secureRandomId(), query: '', color: ORGANIZER_COLORS[groups.length % ORGANIZER_COLORS.length] },
  ])
  return (
    <div role='group' aria-label={t('graph.color_groups')} className='space-y-2'>
      <div className='flex items-center justify-between gap-2'>
        <span className='text-[length:var(--text-12)] text-[var(--text-secondary)]'>{t('graph.color_groups')}</span>
        <Button
          type='button'
          variant='ghost'
          size='sm'
          disabled={groups.length >= GRAPH_COLOR_GROUP_LIMIT}
          onClick={addGroup}
          className='h-6 gap-1 px-1.5 text-[length:var(--text-11)] text-[var(--accent)]'
        >
          <Plus size={12}/>{t('graph.add_color_rule')}
        </Button>
      </div>
      {groups.map((group) => (
        <GraphColorRuleRow
          key={group.id}
          group={group}
          onChange={(patch) => onChange(groups.map((item) => (item.id === group.id ? { ...item, ...patch } : item)))}
          onRemove={() => onChange(groups.filter((item) => item.id !== group.id))}
        />
      ))}
      <p className='text-[length:var(--text-10\.5)] leading-relaxed text-[var(--text-quaternary)]'>{t('graph.color_rule_hint')}</p>
    </div>
  )
}

function GraphColorRuleRow({ group, onChange, onRemove }: {
  group: GraphColorGroup
  onChange: (patch: Partial<GraphColorGroup>) => void
  onRemove: () => void
}) {
  return (
    <div className='rounded-[var(--r-sm)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2'>
      <div className='flex items-center gap-1.5'>
        <Input
          value={group.query}
          onChange={(event) => onChange({ query: event.target.value })}
          placeholder={t('graph.color_rule_query')}
          aria-label={t('graph.color_rule_query')}
          maxLength={COLOR_GROUP_QUERY_MAX}
          className='h-7 min-w-0 flex-1 text-[length:var(--text-11\.5)]'
        />
        <IconButton size='sm' label={t('graph.color_rule_remove')} onClick={onRemove}>
          <X size={13}/>
        </IconButton>
      </div>
      {/* 24px is the target the app's other swatch rows use (`tag-manager-row`, the folder pickers), and
          the gap leaves room for the selected swatch's ring so it does not touch its neighbours. */}
      <div className='mt-1.5 flex flex-wrap items-center gap-1.5'>
        {ORGANIZER_COLORS.map((color) => {
          const isSelected = group.color === color
          const colorName = organizerColorLabel(color, t)
          return (
            <Tooltip key={color} label={colorName}>
              <button
                type='button'
                aria-label={colorName}
                aria-pressed={isSelected}
                onClick={() => onChange({ color })}
                className={cn(
                  'flex size-6 items-center justify-center rounded-full transition-transform hover:scale-110',
                  isSelected && 'ring-2 ring-[var(--accent-ring)] ring-offset-1 ring-offset-[var(--bg-surface)]'
                )}
                style={{ backgroundColor: color }}
              >
                {isSelected && <Check size={11} className='text-[var(--swatch-white)] drop-shadow-[var(--drop-shadow-sm)]'/>}
              </button>
            </Tooltip>
          )
        })}
      </div>
    </div>
  )
}

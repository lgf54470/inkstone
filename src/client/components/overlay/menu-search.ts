import { useState, useEffect } from 'react'
import { fuzzyMatch } from '../../lib/fuzzy'
import type { MenuItem } from './use-menu'

type PinyinFn = (typeof import('pinyin-pro'))['pinyin']

let pinyinModulePromise: Promise<typeof import('pinyin-pro') | null> | null = null
let pinyinModule: typeof import('pinyin-pro') | null = null

export function preloadPinyin(): Promise<PinyinFn | null> {
  if (pinyinModule?.pinyin) return Promise.resolve(pinyinModule.pinyin)
  pinyinModulePromise ??= import('pinyin-pro')
    .then((mod) => {
      pinyinModule = mod
      return mod
    })
    .catch(() => null)
  return pinyinModulePromise.then((mod) => mod?.pinyin ?? null)
}

export function getLoadedPinyin(): typeof import('pinyin-pro') | null {
  return pinyinModule
}

export function usePinyin(): PinyinFn | null {
  const [pinyin, setPinyin] = useState<PinyinFn | null>(() => pinyinModule?.pinyin ?? null)
  useEffect(() => {
    if (pinyin) return
    let active = true
    void preloadPinyin().then((fn) => {
      if (active && fn) {
        setPinyin(() => fn)
      }
    })
    return () => {
      active = false
    }
  }, [pinyin])
  return pinyin
}

export function matchMenuItem(query: string, label: string, pinyinFn?: PinyinFn | null): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true

  const l = label.toLowerCase()
  if (l.includes(q)) return true

  const enWords = label.trim().split(/[\s_\-›>/\\|]+/)
  const enInitials = enWords.map((w) => w[0] || '').join('').toLowerCase()
  if (enInitials) {
    if (enInitials.startsWith(q) || fuzzyMatch(enInitials, q) !== null) return true
  }

  const activePinyin = pinyinFn ?? pinyinModule?.pinyin
  if (activePinyin && /[\u4e00-\u9fa5]/.test(label)) {
    try {
      const pyInitialsRaw = activePinyin(label, { pattern: 'first', toneType: 'none', type: 'array' }).join('')
      const pyInitials = pyInitialsRaw.replace(/[^a-z0-9]/gi, '').toLowerCase()
      if (pyInitials.startsWith(q) || pyInitials.includes(q) || fuzzyMatch(pyInitials, q) !== null) return true

      const pyFullRaw = activePinyin(label, { toneType: 'none', type: 'array' }).join('')
      const pyFull = pyFullRaw.replace(/[^a-z0-9]/gi, '').toLowerCase()
      if (pyFull.startsWith(q) || pyFull.includes(q) || fuzzyMatch(pyFull, q) !== null) return true
    } catch {
      return false
    }
  }

  if (fuzzyMatch(l, q) !== null) return true

  return false
}

export interface ToolbarSearchAction {
  id: string
  label: string
  icon?: React.ReactNode
  combo?: string
  disabled?: boolean
  onSelect?: () => void
}

export function filterMenuItems(
  items: MenuItem[],
  query: string,
  pinyinFn?: PinyinFn | null,
  toolbarActions?: ToolbarSearchAction[],
): MenuItem[] {
  const q = query.trim()
  if (!q) return items

  const result: MenuItem[] = []
  const seenIds = new Set<string>()

  if (toolbarActions && toolbarActions.length > 0) {
    for (const action of toolbarActions) {
      if (action.disabled) continue
      if (matchMenuItem(q, action.label, pinyinFn)) {
        if (!seenIds.has(action.id)) {
          seenIds.add(action.id)
          result.push({
            id: `tb-${action.id}`,
            label: action.label,
            icon: action.icon,
            combo: action.combo,
            onSelect: action.onSelect,
            separatorBefore: false,
          })
        }
      }
    }
  }

  for (const item of items) {
    const itemMatches = matchMenuItem(q, item.label, pinyinFn)
    const hasSubItems = Boolean(item.subItems && item.subItems.length > 0)

    if (itemMatches) {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id)
        result.push({ ...item, separatorBefore: false })
      }
    }

    if (hasSubItems) {
      for (const sub of item.subItems!) {
        const fullLabel = `${item.label} › ${sub.label}`
        const subMatches =
          matchMenuItem(q, sub.label, pinyinFn) ||
          matchMenuItem(q, fullLabel, pinyinFn)
        if (subMatches) {
          const uniqueId = `${item.id}:${sub.id}`
          if (!seenIds.has(uniqueId)) {
            seenIds.add(uniqueId)
            result.push({
              ...sub,
              id: uniqueId,
              label: fullLabel,
              icon: sub.icon ?? item.icon,
              separatorBefore: false,
            })
          }
        }
      }
    }
  }

  return result
}

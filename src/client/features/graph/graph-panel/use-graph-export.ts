import { useCallback, useState, type RefObject } from 'react'
import { errorMessage } from '../../../lib/errors'
import { t } from '../../../lib/i18n'
import { useUi } from '../../../store/ui'
import { runGraphExport, type GraphExportKind } from './graph-export'
import type { GraphPreferences } from '../../../lib/graph-settings'
import type { CanvasState } from './types'

export interface GraphExportActions {
  isExporting: boolean
  exportPng: () => void
  exportSvg: () => void
}

/** A picture is painted off-screen and handed to the browser as a file, so the doors stay shut until it lands. */
export function useGraphExport(stateRef: RefObject<CanvasState>, prefs: GraphPreferences): GraphExportActions {
  const toast = useUi((state) => state.toast)
  const [isExporting, setIsExporting] = useState(false)
  const run = useCallback(async (kind: GraphExportKind) => {
    setIsExporting(true)
    try {
      await runGraphExport(stateRef.current, prefs, kind)
      toast({ title: t('graph.export_done'), tone: 'success' })
    } catch (error) {
      toast({ title: t('graph.export_failed'), description: errorMessage(error), tone: 'danger' })
    } finally {
      setIsExporting(false)
    }
  }, [prefs, stateRef, toast])
  return {
    isExporting,
    exportPng: useCallback(() => { void run('png') }, [run]),
    exportSvg: useCallback(() => { void run('svg') }, [run]),
  }
}

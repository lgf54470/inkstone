/**
 * The menus of the two chart block families. What a note can ask of either — an option body or a Cherry
 * table — is the choice the preview's format control writes, so each menu offers that switch as one item
 * and calls the preview's own function to carry it out, rather than a second copy of the surgery.
 */
import { ArrowLeftRight, BarChart2, Pencil } from 'lucide-react'
import type { MenuItem } from '../../../components/overlay'
import { submenuFor } from '../../../components/overlay'
import { t } from '../../../lib/i18n'
import { useUi } from '../../../store/ui'
import { detectChartMode } from '../../../lib/markdown/chart'
import { detectEchartsMode } from '../../../lib/markdown/echarts'
import { CHARTJS_TEMPLATES, ECHARTS_TEMPLATES } from '../../../editor/commands'
import { convertChartFence, convertEchartsFence } from '../../preview'
import type { MenuCtx } from './types'
import { buildTemplateItems } from './fence-template'

/**
 * The line a fence's opening backticks sit on. The menu holds the block's offset while the write looks
 * its fence up by line — the same number the renderer stamps as `data-line` — so the two meet here
 * rather than in a second copy of the surgery.
 */
function openingLine(content: string, from: number): number {
  return content.slice(0, from).split('\n').length - 1
}

/**
 * The menu's copy of the format control the preview's block head carries: the same fence surgery, the
 * same refusal when the note cannot be read the other way, so the two surfaces cannot drift into
 * offering different conversions.
 */
function convertFormatItem(kind: 'chart' | 'echarts', code: string, line: number | undefined, ctx: MenuCtx): MenuItem {
  const asTable = (kind === 'chart' ? detectChartMode(code) : detectEchartsMode(code)) !== 'table'
  const labelKey = asTable
    ? 'preview.graph_convert_to_table'
    : kind === 'echarts'
      ? 'preview.graph_convert_to_option'
      : 'preview.graph_convert_to_json'
  return {
    id: `${kind}-convert-format`,
    label: t(labelKey),
    icon: <ArrowLeftRight size={14} />,
    onSelect: () => {
      const toast = useUi.getState().toast
      if (kind === 'chart') convertChartFence(line, ctx.content, ctx.onEditContent, toast)
      else convertEchartsFence(line, ctx.content, ctx.onEditContent, toast)
    },
  }
}

export function buildChartItems(ctx: MenuCtx): MenuItem[] | null {
  const { editorView, editorContext, previewContext, onJumpToLine } = ctx

  if (editorContext?.type === 'chart' || previewContext?.type === 'chart') {
    const templates = CHARTJS_TEMPLATES.map((tpl) => ({ id: tpl.id, label: t(tpl.labelKey), text: tpl.code }))
    const tplItems = editorContext?.chart ? buildTemplateItems(editorView, editorContext.chart.from, editorContext.chart.to, 'chart', templates) : []
    return [
      ...(editorContext?.chart
        ? [
            { id: 'chart-templates-sub', label: t('contextmenu.chart_templates'), icon: <BarChart2 size={14} />, separatorBefore: true, subItems: tplItems, submenu: submenuFor(tplItems, 190) },
            convertFormatItem('chart', editorContext.chart.code, openingLine(ctx.content, editorContext.chart.from), ctx),
          ]
        : []),
      ...(previewContext
        ? [
            convertFormatItem('chart', previewContext.chart?.code ?? '', previewContext.sourceLine, ctx),
            { id: 'jump-chart', label: t('contextmenu.chart_jump_to_editor'), icon: <Pencil size={14} />, separatorBefore: true, onSelect: () => onJumpToLine(previewContext.sourceLine ?? 0) },
          ]
        : []),
    ]
  }
  return null
}

/** The echarts block's menu: the chart block's menu with the family's own templates. */
export function buildEchartsItems(ctx: MenuCtx): MenuItem[] | null {
  const { editorView, editorContext, previewContext, onJumpToLine } = ctx

  if (editorContext?.type === 'echarts' || previewContext?.type === 'echarts') {
    const templates = ECHARTS_TEMPLATES.map((tpl) => ({ id: tpl.id, label: t(tpl.labelKey), text: tpl.code }))
    const tplItems = editorContext?.echarts ? buildTemplateItems(editorView, editorContext.echarts.from, editorContext.echarts.to, 'echarts', templates) : []
    return [
      ...(editorContext?.echarts
        ? [
            { id: 'echarts-templates-sub', label: t('contextmenu.echarts_templates'), icon: <BarChart2 size={14} />, separatorBefore: true, subItems: tplItems, submenu: submenuFor(tplItems, 190) },
            convertFormatItem('echarts', editorContext.echarts.code, openingLine(ctx.content, editorContext.echarts.from), ctx),
          ]
        : []),
      ...(previewContext
        ? [
            convertFormatItem('echarts', previewContext.echarts?.code ?? '', previewContext.sourceLine, ctx),
            { id: 'jump-echarts', label: t('contextmenu.echarts_jump_to_editor'), icon: <Pencil size={14} />, separatorBefore: true, onSelect: () => onJumpToLine(previewContext.sourceLine ?? 0) },
          ]
        : []),
    ]
  }
  return null
}

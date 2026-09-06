import { EditorSelection } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import {
  BarChart2,
  CheckSquare,
  Copy,
  FileCode,
  FileText,
  Maximize2,
  Pencil,
  Sigma,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { MenuItem } from '../../../components/overlay';
import { t } from '../../../lib/i18n';
import { useUi } from '../../../store/ui';
import { formatCode } from '../../../lib/markdown/code-formatter';
import { CHARTJS_TEMPLATES, MERMAID_TEMPLATES } from '../../../editor/commands';
import type { EditorContextData, PreviewContextData } from '../context-menu-detect';
import type { MenuCtx } from './types';
import { submenuFor } from './submenu';

type CodeBlockData = NonNullable<EditorContextData['codeBlock']>;
type MathData = NonNullable<EditorContextData['math']>;
type PreviewCodeBlockData = NonNullable<PreviewContextData['codeBlock']>;

const CODE_LANGUAGES = [
  'typescript',
  'javascript',
  'python',
  'bash',
  'json',
  'html',
  'css',
  'markdown',
  'sql',
  'rust',
  'go',
];

function deleteRangeFlow(editorView: EditorView, from: number, to: number) {
  editorView.dispatch({ changes: { from, to, insert: '' } });
}

function formatCodeBlockFlow(editorView: EditorView, cb: CodeBlockData) {
  const doc = editorView.state.doc;
  const startLine = doc.lineAt(cb.from);
  const endLine = doc.lineAt(cb.to);
  editorView.dispatch({
    changes: { from: startLine.from, to: endLine.to, insert: `${startLine.text}\n${formatCode(cb.code, cb.language)}\n${endLine.text}` },
    scrollIntoView: true,
  });
}

function changeCodeLanguageFlow(editorView: EditorView, cb: CodeBlockData, lang: string) {
  const firstLine = editorView.state.doc.lineAt(cb.from);
  editorView.dispatch({ changes: { from: firstLine.from, to: firstLine.to, insert: '```' + lang } });
}

function formatCodeInContentFlow(content: string, sourceLine: number, cb: PreviewCodeBlockData, onEditContent: (content: string) => void) {
  const lines = content.split('\n');
  const formatted = formatCode(cb.code, cb.language);
  let openLine = -1;
  for (let i = sourceLine; i >= 0; i--) {
    if (/^\s*(`{3,}|~{3,})/.test(lines[i] ?? '')) {
      openLine = i;
      break;
    }
  }
  if (openLine === -1) return;
  let closeLine = -1;
  for (let i = openLine + 1; i < lines.length; i++) {
    if (/^\s*(`{3,}|~{3,})\s*$/.test(lines[i] ?? '')) {
      closeLine = i;
      break;
    }
  }
  if (closeLine === -1) return;
  lines.splice(openLine, closeLine - openLine + 1, lines[openLine]!, ...formatted.split('\n'), lines[closeLine]!);
  onEditContent(lines.join('\n'));
}

function applyTemplateFlow(editorView: EditorView, from: number, to: number, blockLang: string, text: string) {
  editorView.dispatch({ changes: { from, to, insert: '```' + blockLang + '\n' + text + '\n```' } });
}

function buildTemplateItems(editorView: EditorView | null | undefined, from: number, to: number, blockLang: string, templates: { id: string; label: string; text: string }[]) {
  return templates.map((tpl) => ({
    id: tpl.id,
    label: tpl.label,
    onSelect: () => {
      if (!editorView) return;
      applyTemplateFlow(editorView, from, to, blockLang, tpl.text);
    },
  }));
}

export function buildImageItems(ctx: MenuCtx): MenuItem[] | null {
  const { editorView, editorContext, previewContext, onJumpToLine, handleCopy } = ctx;

  if (editorContext?.type === 'image' || previewContext?.type === 'image') {
    const src = previewContext?.image?.src ?? editorContext?.image?.url ?? '';
    const alt = previewContext?.image?.alt ?? editorContext?.image?.alt ?? '';
    return [
      { id: 'preview-lightbox', label: t('contextmenu.image_preview'), icon: <Maximize2 size={14} />, onSelect: () => useUi.getState().setLightbox({ src, alt }) },
      { id: 'copy-image-url', label: t('contextmenu.image_copy_url'), icon: <Copy size={14} />, onSelect: () => handleCopy(src) },
      { id: 'copy-image-md', label: t('contextmenu.image_copy_markdown'), icon: <FileText size={14} />, onSelect: () => handleCopy(`![${alt}](${src})`) },
      ...(previewContext
        ? [
            { id: 'jump-image', label: t('contextmenu.image_jump_to_editor'), icon: <Pencil size={14} />, separatorBefore: true, onSelect: () => onJumpToLine(previewContext.sourceLine ?? 0) },
          ]
        : []),
      ...(editorContext?.image
        ? [
            { id: 'delete-image', label: t('contextmenu.image_delete'), icon: <Trash2 size={14} />, tone: 'danger' as const, separatorBefore: true, onSelect: () => { if (!editorView || !editorContext.image) return; deleteRangeFlow(editorView, editorContext.image.from, editorContext.image.to) } },
          ]
        : []),
    ];
  }
  return null;
}

export function buildMathItems(ctx: MenuCtx): MenuItem[] | null {
  const { editorView, editorContext, previewContext, onJumpToLine, handleCopy } = ctx;

  const mathData = editorContext?.math ?? previewContext?.math;
  if (editorContext?.type === 'math' || previewContext?.type === 'math') {
    const formula = mathData?.formula ?? '';
    return [
      { id: 'copy-latex', label: t('contextmenu.math_copy_latex'), icon: <Copy size={14} />, onSelect: () => handleCopy(formula) },
      ...(editorContext?.math
        ? [
            { id: 'toggle-block-math', label: t('contextmenu.math_toggle_block'), icon: <Sigma size={14} />, onSelect: () => { if (!editorView || !editorContext.math) return; toggleMathBlockFlow(editorView, editorContext.math) } },
            { id: 'delete-math', label: t('contextmenu.math_delete'), icon: <Trash2 size={14} />, tone: 'danger' as const, separatorBefore: true, onSelect: () => { if (!editorView || !editorContext.math) return; deleteRangeFlow(editorView, editorContext.math.from, editorContext.math.to) } },
          ]
        : []),
      ...(previewContext
        ? [
            { id: 'jump-math', label: t('contextmenu.math_jump_to_editor'), icon: <Pencil size={14} />, separatorBefore: true, onSelect: () => onJumpToLine(previewContext.sourceLine ?? 0) },
          ]
        : []),
    ];
  }
  return null;
}

function toggleMathBlockFlow(editorView: EditorView, math: MathData) {
  const { formula, isBlock, from, to } = math;
  const replacement = isBlock ? `$${formula.trim()}$` : `$$\n${formula.trim()}\n$$\n`;
  editorView.dispatch({ changes: { from, to, insert: replacement } });
}

export function buildCodeBlockItems(ctx: MenuCtx): MenuItem[] | null {
  const { editorView, editorContext, previewContext, content, onEditContent, onJumpToLine, handleCopy } = ctx;

  const codeData = editorContext?.codeBlock ?? previewContext?.codeBlock;
  if (editorContext?.type === 'codeblock' || previewContext?.type === 'codeblock') {
    const code = codeData?.code ?? '';
    return [
      { id: 'copy-code', label: t('contextmenu.code_copy'), icon: <Copy size={14} />, onSelect: () => handleCopy(code) },
      ...(editorContext?.codeBlock
        ? [
            { id: 'format-code', label: t('contextmenu.code_format'), icon: <Sparkles size={14} />, onSelect: () => { if (!editorView || !editorContext.codeBlock) return; formatCodeBlockFlow(editorView, editorContext.codeBlock) } },
            { id: 'select-code', label: t('contextmenu.code_select'), icon: <CheckSquare size={14} />, onSelect: () => { if (!editorView || !editorContext.codeBlock) return; editorView.dispatch({ selection: EditorSelection.range(editorContext.codeBlock.from, editorContext.codeBlock.to) }) } },
            {
              id: 'change-lang-sub',
              label: t('contextmenu.code_change_lang'),
              icon: <FileCode size={14} />,
              separatorBefore: true,
              submenu: submenuFor(CODE_LANGUAGES.map((lang) => ({ id: `lang-${lang}`, label: lang, checked: editorContext.codeBlock?.language.toLowerCase() === lang, onSelect: () => { if (!editorView || !editorContext.codeBlock) return; changeCodeLanguageFlow(editorView, editorContext.codeBlock, lang) } }))),
            },
            { id: 'delete-codeblock', label: t('contextmenu.code_delete'), icon: <Trash2 size={14} />, tone: 'danger' as const, separatorBefore: true, onSelect: () => { if (!editorView || !editorContext.codeBlock) return; deleteRangeFlow(editorView, editorContext.codeBlock.from, editorContext.codeBlock.to) } },
          ]
        : []),
      ...(previewContext?.codeBlock
        ? [
            { id: 'format-code-preview', label: t('contextmenu.code_format'), icon: <Sparkles size={14} />, onSelect: () => { if (!previewContext.codeBlock) return; formatCodeInContentFlow(content, previewContext.sourceLine ?? 0, previewContext.codeBlock, onEditContent) } },
            { id: 'jump-code', label: t('contextmenu.code_jump_to_editor'), icon: <Pencil size={14} />, separatorBefore: true, onSelect: () => onJumpToLine(previewContext.sourceLine ?? 0) },
          ]
        : []),
    ];
  }
  return null;
}

export function buildMermaidItems(ctx: MenuCtx): MenuItem[] | null {
  const { editorView, editorContext, previewContext, onJumpToLine, handleCopy } = ctx;

  const mermaidData = editorContext?.mermaid ?? previewContext?.mermaid;
  if (editorContext?.type === 'mermaid' || previewContext?.type === 'mermaid') {
    const code = mermaidData?.code ?? '';
    const templates = MERMAID_TEMPLATES.map((tpl) => ({ id: tpl.id, label: t(tpl.labelKey), text: tpl.code }));
    return [
      { id: 'copy-mermaid', label: t('contextmenu.mermaid_copy'), icon: <Copy size={14} />, onSelect: () => handleCopy(code) },
      ...(editorContext?.mermaid
        ? [
            { id: 'mermaid-templates-sub', label: t('contextmenu.mermaid_templates'), icon: <Sparkles size={14} />, separatorBefore: true, submenu: submenuFor(buildTemplateItems(editorView, editorContext.mermaid.from, editorContext.mermaid.to, 'mermaid', templates), 190) },
          ]
        : []),
      ...(previewContext
        ? [
            { id: 'jump-mermaid', label: t('contextmenu.mermaid_jump_to_editor'), icon: <Pencil size={14} />, separatorBefore: true, onSelect: () => onJumpToLine(previewContext.sourceLine ?? 0) },
          ]
        : []),
    ];
  }
  return null;
}

export function buildChartItems(ctx: MenuCtx): MenuItem[] | null {
  const { editorView, editorContext, previewContext, onJumpToLine, handleCopy } = ctx;

  const chartData = editorContext?.chart ?? previewContext?.chart;
  if (editorContext?.type === 'chart' || previewContext?.type === 'chart') {
    const code = chartData?.code ?? '';
    const templates = CHARTJS_TEMPLATES.map((tpl) => ({ id: tpl.id, label: t(tpl.labelKey), text: tpl.code }));
    return [
      { id: 'copy-chart', label: t('contextmenu.chart_copy'), icon: <Copy size={14} />, onSelect: () => handleCopy(code) },
      ...(editorContext?.chart
        ? [
            { id: 'chart-templates-sub', label: t('contextmenu.chart_templates'), icon: <BarChart2 size={14} />, separatorBefore: true, submenu: submenuFor(buildTemplateItems(editorView, editorContext.chart.from, editorContext.chart.to, 'chart', templates), 190) },
          ]
        : []),
      ...(previewContext
        ? [
            { id: 'jump-chart', label: t('contextmenu.chart_jump_to_editor'), icon: <Pencil size={14} />, separatorBefore: true, onSelect: () => onJumpToLine(previewContext.sourceLine ?? 0) },
          ]
        : []),
    ];
  }
  return null;
}
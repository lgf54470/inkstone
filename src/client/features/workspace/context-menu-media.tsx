import { EditorSelection } from '@codemirror/state';
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
import type { MenuItem } from '../../components/overlay';
import { t } from '../../lib/i18n';
import { useUi } from '../../store/ui';
import { formatCode } from '../../lib/markdown/code-formatter';
import { CHARTJS_TEMPLATES, MERMAID_TEMPLATES } from '../../editor/commands';
import type { MenuCtx } from './context-menu-types';
import { SubmenuList } from './context-menu-submenu';

export function buildImageItems(ctx: MenuCtx): MenuItem[] | null {
  const { editorView, editorContext, previewContext, onJumpToLine, handleCopy } = ctx;

  if (editorContext?.type === 'image' || previewContext?.type === 'image') {
    const src = previewContext?.image?.src ?? editorContext?.image?.url ?? '';
    const alt = previewContext?.image?.alt ?? editorContext?.image?.alt ?? '';
    return [
      {
        id: 'preview-lightbox',
        label: t('contextmenu.image_preview'),
        icon: <Maximize2 size={14} />,
        onSelect: () => useUi.getState().setLightbox({ src, alt }),
      },
      {
        id: 'copy-image-url',
        label: t('contextmenu.image_copy_url'),
        icon: <Copy size={14} />,
        onSelect: () => handleCopy(src),
      },
      {
        id: 'copy-image-md',
        label: t('contextmenu.image_copy_markdown'),
        icon: <FileText size={14} />,
        onSelect: () => handleCopy(`![${alt}](${src})`),
      },
      ...(previewContext
        ? [
            {
              id: 'jump-image',
              label: t('contextmenu.image_jump_to_editor'),
              icon: <Pencil size={14} />,
              separatorBefore: true,
              onSelect: () => onJumpToLine(previewContext.sourceLine ?? 0),
            },
          ]
        : []),
      ...(editorContext?.image
        ? [
            {
              id: 'delete-image',
              label: t('contextmenu.image_delete'),
              icon: <Trash2 size={14} />,
              tone: 'danger' as const,
              separatorBefore: true,
              onSelect: () => {
                if (!editorView || !editorContext.image) return;
                editorView.dispatch({
                  changes: { from: editorContext.image.from, to: editorContext.image.to, insert: '' },
                });
              },
            },
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
      {
        id: 'copy-latex',
        label: t('contextmenu.math_copy_latex'),
        icon: <Copy size={14} />,
        onSelect: () => handleCopy(formula),
      },
      ...(editorContext?.math
        ? [
            {
              id: 'toggle-block-math',
              label: t('contextmenu.math_toggle_block'),
              icon: <Sigma size={14} />,
              onSelect: () => {
                if (!editorView || !editorContext.math) return;
                const { formula, isBlock, from, to } = editorContext.math;
                const replacement = isBlock ? `$${formula.trim()}$` : `$$\n${formula.trim()}\n$$\n`;
                editorView.dispatch({ changes: { from, to, insert: replacement } });
              },
            },
            {
              id: 'delete-math',
              label: t('contextmenu.math_delete'),
              icon: <Trash2 size={14} />,
              tone: 'danger' as const,
              separatorBefore: true,
              onSelect: () => {
                if (!editorView || !editorContext.math) return;
                editorView.dispatch({ changes: { from: editorContext.math.from, to: editorContext.math.to, insert: '' } });
              },
            },
          ]
        : []),
      ...(previewContext
        ? [
            {
              id: 'jump-math',
              label: t('contextmenu.math_jump_to_editor'),
              icon: <Pencil size={14} />,
              separatorBefore: true,
              onSelect: () => onJumpToLine(previewContext.sourceLine ?? 0),
            },
          ]
        : []),
    ];
  }
  return null;
}

export function buildCodeBlockItems(ctx: MenuCtx): MenuItem[] | null {
  const { editorView, editorContext, previewContext, content, onEditContent, onJumpToLine, handleCopy } = ctx;

  const codeData = editorContext?.codeBlock ?? previewContext?.codeBlock;
  if (editorContext?.type === 'codeblock' || previewContext?.type === 'codeblock') {
    const code = codeData?.code ?? '';
    const languages = [
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
    return [
      {
        id: 'copy-code',
        label: t('contextmenu.code_copy'),
        icon: <Copy size={14} />,
        onSelect: () => handleCopy(code),
      },
      ...(editorContext?.codeBlock
        ? [
            {
              id: 'format-code',
              label: t('contextmenu.code_format'),
              icon: <Sparkles size={14} />,
              onSelect: () => {
                if (!editorView || !editorContext.codeBlock) return;
                const cb = editorContext.codeBlock;
                const formatted = formatCode(cb.code, cb.language);
                const doc = editorView.state.doc;
                const startLine = doc.lineAt(cb.from);
                const endLine = doc.lineAt(cb.to);
                const fenceStart = startLine.text;
                const fenceEnd = endLine.text;
                const newBlock = `${fenceStart}\n${formatted}\n${fenceEnd}`;
                editorView.dispatch({
                  changes: { from: startLine.from, to: endLine.to, insert: newBlock },
                  scrollIntoView: true,
                });
              },
            },
            {
              id: 'select-code',
              label: t('contextmenu.code_select'),
              icon: <CheckSquare size={14} />,
              onSelect: () => {
                if (!editorView || !editorContext.codeBlock) return;
                editorView.dispatch({
                  selection: EditorSelection.range(editorContext.codeBlock.from, editorContext.codeBlock.to),
                });
              },
            },
            {
              id: 'change-lang-sub',
              label: t('contextmenu.code_change_lang'),
              icon: <FileCode size={14} />,
              separatorBefore: true,
              submenu: ({ closeMenu }: { closeMenu: () => void }) => (
                <SubmenuList
                  closeMenu={closeMenu}
                  items={languages.map((lang) => ({
                    id: `lang-${lang}`,
                    label: lang,
                    checked: editorContext.codeBlock?.language.toLowerCase() === lang,
                    onSelect: () => {
                      if (!editorView || !editorContext.codeBlock) return;
                      const firstLine = editorView.state.doc.lineAt(editorContext.codeBlock.from);
                      editorView.dispatch({
                        changes: { from: firstLine.from, to: firstLine.to, insert: '```' + lang },
                      });
                    },
                  }))}
                />
              ),
            },
            {
              id: 'delete-codeblock',
              label: t('contextmenu.code_delete'),
              icon: <Trash2 size={14} />,
              tone: 'danger' as const,
              separatorBefore: true,
              onSelect: () => {
                if (!editorView || !editorContext.codeBlock) return;
                editorView.dispatch({
                  changes: { from: editorContext.codeBlock.from, to: editorContext.codeBlock.to, insert: '' },
                });
              },
            },
          ]
        : []),
      ...(previewContext?.codeBlock
        ? [
            {
              id: 'format-code-preview',
              label: t('contextmenu.code_format'),
              icon: <Sparkles size={14} />,
              onSelect: () => {
                const sLine = previewContext.sourceLine ?? 0;
                const lines = content.split('\n');
                const cb = previewContext.codeBlock;
                if (!cb) return;
                const formatted = formatCode(cb.code, cb.language);
                let openLine = -1;
                for (let i = sLine; i >= 0; i--) {
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
                const newLines = [lines[openLine]!, ...formatted.split('\n'), lines[closeLine]!];
                lines.splice(openLine, closeLine - openLine + 1, ...newLines);
                onEditContent(lines.join('\n'));
              },
            },
            {
              id: 'jump-code',
              label: t('contextmenu.code_jump_to_editor'),
              icon: <Pencil size={14} />,
              separatorBefore: true,
              onSelect: () => onJumpToLine(previewContext.sourceLine ?? 0),
            },
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
    const templates = MERMAID_TEMPLATES.map((tpl) => ({
      id: tpl.id,
      label: t(tpl.labelKey),
      text: tpl.code,
    }));
    return [
      {
        id: 'copy-mermaid',
        label: t('contextmenu.mermaid_copy'),
        icon: <Copy size={14} />,
        onSelect: () => handleCopy(code),
      },
      ...(editorContext?.mermaid
        ? [
            {
              id: 'mermaid-templates-sub',
              label: t('contextmenu.mermaid_templates'),
              icon: <Sparkles size={14} />,
              separatorBefore: true,
              submenu: ({ closeMenu }: { closeMenu: () => void }) => (
                <SubmenuList
                  closeMenu={closeMenu}
                  width={190}
                  items={templates.map((tpl) => ({
                    id: tpl.id,
                    label: tpl.label,
                    onSelect: () => {
                      if (!editorView || !editorContext.mermaid) return;
                      const block = '```mermaid\n' + tpl.text + '\n```';
                      editorView.dispatch({
                        changes: { from: editorContext.mermaid.from, to: editorContext.mermaid.to, insert: block },
                      });
                    },
                  }))}
                />
              ),
            },
          ]
        : []),
      ...(previewContext
        ? [
            {
              id: 'jump-mermaid',
              label: t('contextmenu.mermaid_jump_to_editor'),
              icon: <Pencil size={14} />,
              separatorBefore: true,
              onSelect: () => onJumpToLine(previewContext.sourceLine ?? 0),
            },
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
    return [
      {
        id: 'copy-chart',
        label: t('contextmenu.chart_copy'),
        icon: <Copy size={14} />,
        onSelect: () => handleCopy(code),
      },
      ...(editorContext?.chart
        ? [
            {
              id: 'chart-templates-sub',
              label: t('contextmenu.chart_templates'),
              icon: <BarChart2 size={14} />,
              separatorBefore: true,
              submenu: ({ closeMenu }: { closeMenu: () => void }) => (
                <SubmenuList
                  closeMenu={closeMenu}
                  width={190}
                  items={CHARTJS_TEMPLATES.map((tpl) => ({
                    id: tpl.id,
                    label: t(tpl.labelKey),
                    onSelect: () => {
                      if (!editorView || !editorContext.chart) return;
                      const block = '```chart\n' + tpl.code + '\n```';
                      editorView.dispatch({
                        changes: { from: editorContext.chart.from, to: editorContext.chart.to, insert: block },
                      });
                    },
                  }))}
                />
              ),
            },
          ]
        : []),
      ...(previewContext
        ? [
            {
              id: 'jump-chart',
              label: t('contextmenu.chart_jump_to_editor'),
              icon: <Pencil size={14} />,
              separatorBefore: true,
              onSelect: () => onJumpToLine(previewContext.sourceLine ?? 0),
            },
          ]
        : []),
    ];
  }
  return null;
}


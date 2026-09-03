import type { EditorView } from '@codemirror/view';
import type { Text } from '@codemirror/state';
import { parseMarkdownTable, type ParsedTable } from '../../lib/markdown/table-editor';

export type ContextType =
  | 'selection'
  | 'table'
  | 'image'
  | 'math'
  | 'codeblock'
  | 'mermaid'
  | 'wikilink'
  | 'link'
  | 'frontmatter'
  | 'task'
  | 'empty';

export interface EditorContextData {
  type: ContextType;
  pos: number;
  lineNumber: number;
  selectedText?: string;
  table?: ParsedTable;
  image?: { alt: string; url: string; raw: string; from: number; to: number };
  math?: { formula: string; isBlock: boolean; from: number; to: number };
  codeBlock?: { language: string; code: string; from: number; to: number };
  mermaid?: { code: string; from: number; to: number };
  wikiLink?: { target: string; alias?: string; from: number; to: number };
  link?: { text: string; url: string; from: number; to: number };
  task?: { checked: boolean; text: string; from: number; to: number };
}

export interface PreviewContextData {
  type: ContextType;
  target: HTMLElement;
  selectedText?: string;
  sourceLine?: number;
  table?: {
    rowIndex: number;
    colIndex: number;
    sourceLine?: number;
  };
  image?: {
    src: string;
    alt: string;
    sourceLine?: number;
  };
  math?: {
    formula: string;
    isBlock: boolean;
    sourceLine?: number;
  };
  codeBlock?: {
    language: string;
    code: string;
    sourceLine?: number;
  };
  mermaid?: {
    code: string;
    sourceLine?: number;
  };
  wikiLink?: {
    noteTitle: string;
    sourceLine?: number;
  };
  link?: {
    text: string;
    url: string;
    sourceLine?: number;
  };
  task?: {
    checked: boolean;
    taskLine?: number;
  };
}

export function detectEditorContext(view: EditorView, pos: number): EditorContextData {
  const doc = view.state.doc;
  const clampedPos = Math.max(0, Math.min(pos, doc.length));
  const line = doc.lineAt(clampedPos);
  const lineNumber = line.number;
  const lineText = line.text;
  const offsetInLine = clampedPos - line.from;

  const selection = view.state.selection.main;
  if (!selection.empty && clampedPos >= selection.from && clampedPos <= selection.to) {
    const selectedText = view.state.sliceDoc(selection.from, selection.to);
    return {
      type: 'selection',
      pos: clampedPos,
      lineNumber,
      selectedText,
    };
  }

  const docText = doc.toString();
  const frontMatterMatch = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---/.exec(docText);
  if (frontMatterMatch && clampedPos <= frontMatterMatch[0].length) {
    return {
      type: 'frontmatter',
      pos: clampedPos,
      lineNumber,
    };
  }

  const codeFence = findCodeFenceAround(doc, clampedPos);
  if (codeFence) {
    if (codeFence.language.toLowerCase() === 'mermaid') {
      return {
        type: 'mermaid',
        pos: clampedPos,
        lineNumber,
        mermaid: {
          code: codeFence.code,
          from: codeFence.from,
          to: codeFence.to,
        },
      };
    }
    return {
      type: 'codeblock',
      pos: clampedPos,
      lineNumber,
      codeBlock: {
        language: codeFence.language,
        code: codeFence.code,
        from: codeFence.from,
        to: codeFence.to,
      },
    };
  }

  const mathBlock = findMathBlockAround(doc, clampedPos);
  if (mathBlock) {
    return {
      type: 'math',
      pos: clampedPos,
      lineNumber,
      math: {
        formula: mathBlock.formula,
        isBlock: true,
        from: mathBlock.from,
        to: mathBlock.to,
      },
    };
  }

  if (lineText.includes('|')) {
    const lines = doc.toJSON();
    const table = parseMarkdownTable(lines, lineNumber - 1, offsetInLine);
    if (table) {
      return {
        type: 'table',
        pos: clampedPos,
        lineNumber,
        table,
      };
    }
  }

  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let imgMatch: RegExpExecArray | null;
  while ((imgMatch = imageRegex.exec(lineText)) !== null) {
    const matchStart = imgMatch.index;
    const matchEnd = matchStart + imgMatch[0].length;
    if (offsetInLine >= matchStart && offsetInLine <= matchEnd) {
      return {
        type: 'image',
        pos: clampedPos,
        lineNumber,
        image: {
          alt: imgMatch[1] ?? '',
          url: imgMatch[2] ?? '',
          raw: imgMatch[0],
          from: line.from + matchStart,
          to: line.from + matchEnd,
        },
      };
    }
  }

  const wikiRegex = /\[\[([^\]]+)\]\]/g;
  let wikiMatch: RegExpExecArray | null;
  while ((wikiMatch = wikiRegex.exec(lineText)) !== null) {
    const matchStart = wikiMatch.index;
    const matchEnd = matchStart + wikiMatch[0].length;
    if (offsetInLine >= matchStart && offsetInLine <= matchEnd) {
      const parts = (wikiMatch[1] ?? '').split('|');
      return {
        type: 'wikilink',
        pos: clampedPos,
        lineNumber,
        wikiLink: {
          target: parts[0] ? parts[0].trim() : '',
          alias: parts[1]?.trim(),
          from: line.from + matchStart,
          to: line.from + matchEnd,
        },
      };
    }
  }

  const linkRegex = /(?<!!)\[([^\]]+)\]\(([^)]+)\)/g;
  let linkMatch: RegExpExecArray | null;
  while ((linkMatch = linkRegex.exec(lineText)) !== null) {
    const matchStart = linkMatch.index;
    const matchEnd = matchStart + linkMatch[0].length;
    if (offsetInLine >= matchStart && offsetInLine <= matchEnd) {
      return {
        type: 'link',
        pos: clampedPos,
        lineNumber,
        link: {
          text: linkMatch[1] ?? '',
          url: linkMatch[2] ?? '',
          from: line.from + matchStart,
          to: line.from + matchEnd,
        },
      };
    }
  }

  const inlineMathRegex = /\$([^\$\n]+)\$/g;
  let mathMatch: RegExpExecArray | null;
  while ((mathMatch = inlineMathRegex.exec(lineText)) !== null) {
    const matchStart = mathMatch.index;
    const matchEnd = matchStart + mathMatch[0].length;
    if (offsetInLine >= matchStart && offsetInLine <= matchEnd) {
      return {
        type: 'math',
        pos: clampedPos,
        lineNumber,
        math: {
          formula: mathMatch[1] ?? '',
          isBlock: false,
          from: line.from + matchStart,
          to: line.from + matchEnd,
        },
      };
    }
  }

  const taskMatch = /^(\s*[-*+]\s+\[([ xX])\]\s+)(.*)$/.exec(lineText);
  if (taskMatch) {
    return {
      type: 'task',
      pos: clampedPos,
      lineNumber,
      task: {
        checked: taskMatch[2]?.toLowerCase() === 'x',
        text: taskMatch[3] ?? '',
        from: line.from,
        to: line.to,
      },
    };
  }

  return {
    type: 'empty',
    pos: clampedPos,
    lineNumber,
  };
}

export function detectPreviewContext(target: HTMLElement): PreviewContextData {
  const windowSelection = window.getSelection();
  if (windowSelection && !windowSelection.isCollapsed && windowSelection.toString().trim().length > 0) {
    const selectedText = windowSelection.toString();
    const sourceEl = target.closest<HTMLElement>('[data-source-line]');
    const sourceLine = sourceEl?.dataset.sourceLine ? parseInt(sourceEl.dataset.sourceLine, 10) : undefined;
    return {
      type: 'selection',
      target,
      selectedText,
      sourceLine,
    };
  }

  const getSourceLine = (el: HTMLElement | null): number | undefined => {
    const nearest = el?.closest<HTMLElement>('[data-source-line], [data-line]');
    if (!nearest) return undefined;
    const raw = nearest.dataset.sourceLine ?? nearest.dataset.line;
    return raw ? parseInt(raw, 10) : undefined;
  };

  const tableCell = target.closest<HTMLTableCellElement>('td, th');
  if (tableCell) {
    const tableRow = tableCell.closest('tr');
    const tableEl = tableCell.closest('table');
    if (tableEl && tableRow) {
      const colIndex = tableCell.cellIndex;
      let rowIndex = 0;
      if (tableCell.tagName.toLowerCase() === 'th') {
        rowIndex = 0;
      } else {
        const tbody = tableEl.querySelector('tbody');
        const rows = tbody ? Array.from(tbody.querySelectorAll('tr')) : [];
        rowIndex = rows.indexOf(tableRow) + 1;
      }
      return {
        type: 'table',
        target,
        table: {
          rowIndex,
          colIndex,
          sourceLine: getSourceLine(tableEl),
        },
      };
    }
  }

  const imgEl = target.closest<HTMLImageElement>('img');
  if (imgEl) {
    return {
      type: 'image',
      target,
      image: {
        src: imgEl.src,
        alt: imgEl.alt,
        sourceLine: getSourceLine(imgEl),
      },
    };
  }

  const mathEl = target.closest<HTMLElement>('.katex, [data-math], .math');
  if (mathEl) {
    const texEl = mathEl.querySelector('annotation[encoding="application/x-tex"]');
    const formula = texEl?.textContent ?? mathEl.dataset.math ?? mathEl.textContent ?? '';
    const isBlock = mathEl.classList.contains('katex-display') || mathEl.tagName.toLowerCase() === 'div';
    return {
      type: 'math',
      target,
      math: {
        formula,
        isBlock,
        sourceLine: getSourceLine(mathEl),
      },
    };
  }

  const mermaidEl = target.closest<HTMLElement>('.mermaid, [data-mermaid]');
  if (mermaidEl) {
    return {
      type: 'mermaid',
      target,
      mermaid: {
        code: mermaidEl.dataset.code ?? mermaidEl.textContent ?? '',
        sourceLine: getSourceLine(mermaidEl),
      },
    };
  }

  const codeEl = target.closest<HTMLElement>('pre code, pre');
  if (codeEl) {
    const pre = codeEl.tagName.toLowerCase() === 'pre' ? codeEl : codeEl.closest('pre');
    const code = pre?.textContent ?? '';
    const classAttr = (codeEl.getAttribute('class') ?? '') + ' ' + (pre?.getAttribute('class') ?? '');
    const langMatch = /language-([a-zA-Z0-9_-]+)/.exec(classAttr);
    return {
      type: 'codeblock',
      target,
      codeBlock: {
        language: langMatch ? langMatch[1]! : '',
        code,
        sourceLine: getSourceLine(pre),
      },
    };
  }

  const wikiEl = target.closest<HTMLElement>('[data-wikilink]');
  if (wikiEl) {
    return {
      type: 'wikilink',
      target,
      wikiLink: {
        noteTitle: wikiEl.dataset.wikilink ?? wikiEl.textContent ?? '',
        sourceLine: getSourceLine(wikiEl),
      },
    };
  }

  const linkEl = target.closest<HTMLAnchorElement>('a[href]');
  if (linkEl && !linkEl.hasAttribute('data-wikilink')) {
    return {
      type: 'link',
      target,
      link: {
        text: linkEl.textContent ?? '',
        url: linkEl.href,
        sourceLine: getSourceLine(linkEl),
      },
    };
  }

  const frontmatterEl = target.closest<HTMLElement>('[data-frontmatter], .note-properties-editor');
  if (frontmatterEl) {
    return {
      type: 'frontmatter',
      target,
      sourceLine: 0,
    };
  }

  const taskItem = target.closest<HTMLElement>('li.task-list-item, li:has(input[type="checkbox"])');
  if (taskItem) {
    const checkbox = taskItem.querySelector<HTMLInputElement>('input[type="checkbox"]');
    return {
      type: 'task',
      target,
      task: {
        checked: checkbox ? checkbox.checked : false,
        taskLine: getSourceLine(taskItem),
      },
    };
  }

  return {
    type: 'empty',
    target,
    sourceLine: getSourceLine(target),
  };
}

function findCodeFenceAround(doc: Text, pos: number): { language: string; code: string; from: number; to: number } | null {
  const currentLine = doc.lineAt(pos);
  let openFenceLine = -1;
  let openLanguage = '';

  for (let i = currentLine.number; i >= 1; i--) {
    const l = doc.line(i);
    const match = /^\s*```([a-zA-Z0-9_-]*)/.exec(l.text);
    if (match) {
      if (i === currentLine.number && /^\s*```\s*$/.test(l.text)) {
        continue;
      }
      openFenceLine = i;
      openLanguage = match[1] ?? '';
      break;
    }
  }

  if (openFenceLine === -1) return null;

  let closeFenceLine = -1;
  for (let i = openFenceLine + 1; i <= doc.lines; i++) {
    const l = doc.line(i);
    if (/^\s*```\s*$/.test(l.text)) {
      closeFenceLine = i;
      break;
    }
  }

  if (closeFenceLine === -1 || currentLine.number > closeFenceLine) {
    return null;
  }

  const from = doc.line(openFenceLine).from;
  const to = doc.line(closeFenceLine).to;
  const codeLines: string[] = [];
  for (let i = openFenceLine + 1; i < closeFenceLine; i++) {
    codeLines.push(doc.line(i).text);
  }

  return {
    language: openLanguage,
    code: codeLines.join('\n'),
    from,
    to,
  };
}

function findMathBlockAround(doc: Text, pos: number): { formula: string; from: number; to: number } | null {
  const currentLine = doc.lineAt(pos);
  let openFenceLine = -1;

  for (let i = currentLine.number; i >= 1; i--) {
    const l = doc.line(i);
    if (/^\s*\$\$\s*$/.test(l.text)) {
      openFenceLine = i;
      break;
    }
  }

  if (openFenceLine === -1) return null;

  let closeFenceLine = -1;
  for (let i = openFenceLine + 1; i <= doc.lines; i++) {
    const l = doc.line(i);
    if (/^\s*\$\$\s*$/.test(l.text)) {
      closeFenceLine = i;
      break;
    }
  }

  if (closeFenceLine === -1 || currentLine.number > closeFenceLine) {
    return null;
  }

  const from = doc.line(openFenceLine).from;
  const to = doc.line(closeFenceLine).to;
  const mathLines: string[] = [];
  for (let i = openFenceLine + 1; i < closeFenceLine; i++) {
    mathLines.push(doc.line(i).text);
  }

  return {
    formula: mathLines.join('\n'),
    from,
    to,
  };
}

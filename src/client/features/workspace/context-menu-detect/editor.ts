import { type EditorView } from '@codemirror/view';
import { parseMarkdownTable } from '../../../lib/markdown/table-editor';
import { type Text } from '@codemirror/state';

import type { EditorContextData } from './types';

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
    if (codeFence.language.toLowerCase() === 'chart' || codeFence.language.toLowerCase() === 'chartjs') {
      return {
        type: 'chart',
        pos: clampedPos,
        lineNumber,
        chart: {
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


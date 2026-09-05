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

  return detectSelection(view, clampedPos, lineNumber)
    ?? detectFrontMatter(doc, clampedPos, lineNumber)
    ?? detectFencedBlock(doc, clampedPos, lineNumber)
    ?? detectTable(doc, lineText, lineNumber, offsetInLine, clampedPos)
    ?? detectLinePatterns(line, lineText, offsetInLine, clampedPos, lineNumber)
    ?? { type: 'empty', pos: clampedPos, lineNumber };
}

function detectSelection(view: EditorView, pos: number, lineNumber: number): EditorContextData | null {
  const selection = view.state.selection.main;
  if (selection.empty || pos < selection.from || pos > selection.to) return null;
  const selectedText = view.state.sliceDoc(selection.from, selection.to);
  return {
    type: 'selection',
    pos,
    lineNumber,
    selectedText,
  };
}

function detectFrontMatter(doc: Text, pos: number, lineNumber: number): EditorContextData | null {
  const frontMatterMatch = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---/.exec(doc.toString());
  if (!frontMatterMatch || pos > frontMatterMatch[0].length) return null;
  return {
    type: 'frontmatter',
    pos,
    lineNumber,
  };
}

function detectFencedBlock(doc: Text, pos: number, lineNumber: number): EditorContextData | null {
  const codeFence = findCodeFenceAround(doc, pos);
  if (codeFence) return codeFenceContext(pos, lineNumber, codeFence);
  const mathBlock = findMathBlockAround(doc, pos);
  if (mathBlock) return mathBlockContext(pos, lineNumber, mathBlock);
  return null;
}

function detectTable(doc: Text, lineText: string, lineNumber: number, offsetInLine: number, pos: number): EditorContextData | null {
  if (!lineText.includes('|')) return null;
  const lines = doc.toJSON();
  const table = parseMarkdownTable(lines, lineNumber - 1, offsetInLine);
  if (!table) return null;
  return {
    type: 'table',
    pos,
    lineNumber,
    table,
  };
}

function detectLinePatterns(
  line: { from: number; to: number },
  lineText: string,
  offsetInLine: number,
  pos: number,
  lineNumber: number,
): EditorContextData | null {
  return inlineMatchContext({
    regex: /!\[([^\]]*)\]\(([^)]+)\)/g,
    lineText,
    offset: offsetInLine,
    lineFrom: line.from,
    pos,
    lineNumber,
    build: (m, from, to) => ({ type: 'image', image: { alt: m[1] ?? '', url: m[2] ?? '', raw: m[0], from, to } }),
  })
    ?? inlineMatchContext({
      regex: /\[\[([^\]]+)\]\]/g,
      lineText,
      offset: offsetInLine,
      lineFrom: line.from,
      pos,
      lineNumber,
      build: (m, from, to) => {
        const parts = (m[1] ?? '').split('|');
        return { type: 'wikilink', wikiLink: { target: parts[0] ? parts[0].trim() : '', alias: parts[1]?.trim(), from, to } };
      },
    })
    ?? inlineMatchContext({
      regex: /(?<!!)\[([^\]]+)\]\(([^)]+)\)/g,
      lineText,
      offset: offsetInLine,
      lineFrom: line.from,
      pos,
      lineNumber,
      build: (m, from, to) => ({ type: 'link', link: { text: m[1] ?? '', url: m[2] ?? '', from, to } }),
    })
    ?? inlineMatchContext({
      regex: /\$([^\$\n]+)\$/g,
      lineText,
      offset: offsetInLine,
      lineFrom: line.from,
      pos,
      lineNumber,
      build: (m, from, to) => ({ type: 'math', math: { formula: m[1] ?? '', isBlock: false, from, to } }),
    })
    ?? detectTask(lineText, line, pos, lineNumber);
}

function inlineMatchContext(args: {
  regex: RegExp;
  lineText: string;
  offset: number;
  lineFrom: number;
  pos: number;
  lineNumber: number;
  build: (match: RegExpExecArray, from: number, to: number) => Omit<EditorContextData, 'pos' | 'lineNumber'>;
}): EditorContextData | null {
  const match = findMatchAt(args.regex, args.lineText, args.offset);
  if (!match) return null;
  const matchStart = match.index;
  const matchEnd = matchStart + match[0].length;
  const built = args.build(match, args.lineFrom + matchStart, args.lineFrom + matchEnd);
  return { ...built, pos: args.pos, lineNumber: args.lineNumber };
}

function detectTask(lineText: string, line: { from: number; to: number }, pos: number, lineNumber: number): EditorContextData | null {
  const taskMatch = /^(\s*[-*+]\s+\[([ xX])\]\s+)(.*)$/.exec(lineText);
  if (!taskMatch) return null;
  return {
    type: 'task',
    pos,
    lineNumber,
    task: {
      checked: taskMatch[2]?.toLowerCase() === 'x',
      text: taskMatch[3] ?? '',
      from: line.from,
      to: line.to,
    },
  };
}

function findMatchAt(regex: RegExp, lineText: string, offset: number): RegExpExecArray | null {
  let match: RegExpExecArray | null;
  while ((match = regex.exec(lineText)) !== null) {
    if (offset >= match.index && offset <= match.index + match[0].length) return match;
  }
  return null;
}

function codeFenceContext(
  pos: number,
  lineNumber: number,
  codeFence: { language: string; code: string; from: number; to: number },
): EditorContextData {
  if (codeFence.language.toLowerCase() === 'mermaid') {
    return {
      type: 'mermaid',
      pos,
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
      pos,
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
    pos,
    lineNumber,
    codeBlock: {
      language: codeFence.language,
      code: codeFence.code,
      from: codeFence.from,
      to: codeFence.to,
    },
  };
}

function mathBlockContext(
  pos: number,
  lineNumber: number,
  mathBlock: { formula: string; from: number; to: number },
): EditorContextData {
  return {
    type: 'math',
    pos,
    lineNumber,
    math: {
      formula: mathBlock.formula,
      isBlock: true,
      from: mathBlock.from,
      to: mathBlock.to,
    },
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
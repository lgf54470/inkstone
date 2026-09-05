import { decodeDataValue } from '../../../lib/markdown/data-attr';

import type { PreviewContextData } from './types';

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

  const chartEl = target.closest<HTMLElement>('.chartjs-block, [data-chart]');
  if (chartEl) {
    return {
      type: 'chart',
      target,
      chart: {
        code: decodeDataValue(chartEl.dataset.chart ?? '') || chartEl.textContent || '',
        sourceLine: getSourceLine(chartEl),
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


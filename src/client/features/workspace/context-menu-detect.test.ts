import { describe, expect, it } from 'vitest';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { detectEditorContext, detectPreviewContext } from './context-menu-detect';

describe('detectEditorContext', () => {
  function createView(doc: string, selection?: { from: number; to: number }) {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const state = EditorState.create({
      doc,
      selection: selection ? EditorSelection.single(selection.from, selection.to) : undefined,
    });
    return new EditorView({
      state,
      parent,
    });
  }

  it('detects text selection', () => {
    const doc = 'Hello world from Inkstone';
    const view = createView(doc, { from: 6, to: 11 });
    const ctx = detectEditorContext(view, 8);
    expect(ctx.type).toBe('selection');
    expect(ctx.selectedText).toBe('world');
    view.destroy();
  });

  it('detects table context', () => {
    const doc = '| A | B |\n| --- | --- |\n| 1 | 2 |';
    const view = createView(doc);
    const ctx = detectEditorContext(view, 2);
    expect(ctx.type).toBe('table');
    expect(ctx.table).toBeDefined();
    expect(ctx.table?.columnCount).toBe(2);
    view.destroy();
  });

  it('detects fenced code block', () => {
    const doc = '```typescript\nconst x = 1;\n```';
    const view = createView(doc);
    const ctx = detectEditorContext(view, 18);
    expect(ctx.type).toBe('codeblock');
    expect(ctx.codeBlock?.language).toBe('typescript');
    expect(ctx.codeBlock?.code).toBe('const x = 1;');
    view.destroy();
  });

  it('detects mermaid block', () => {
    const doc = '```mermaid\nflowchart TD\nA --> B\n```';
    const view = createView(doc);
    const ctx = detectEditorContext(view, 15);
    expect(ctx.type).toBe('mermaid');
    expect(ctx.mermaid?.code).toBe('flowchart TD\nA --> B');
    view.destroy();
  });

  it('detects wikilink and normal link', () => {
    const doc = 'Check this [[My Note|Alias]] and [Inkstone](https://inkstone.app)';
    const view = createView(doc);
    const wikiCtx = detectEditorContext(view, 18);
    expect(wikiCtx.type).toBe('wikilink');
    expect(wikiCtx.wikiLink?.target).toBe('My Note');
    expect(wikiCtx.wikiLink?.alias).toBe('Alias');

    const linkCtx = detectEditorContext(view, 40);
    expect(linkCtx.type).toBe('link');
    expect(linkCtx.link?.text).toBe('Inkstone');
    expect(linkCtx.link?.url).toBe('https://inkstone.app');
    view.destroy();
  });
});

describe('detectPreviewContext', () => {
  it('detects table cell in preview DOM', () => {
    const table = document.createElement('table');
    table.dataset.sourceLine = '10';
    const tbody = document.createElement('tbody');
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.textContent = 'Cell 1';
    tr.appendChild(td);
    tbody.appendChild(tr);
    table.appendChild(tbody);
    document.body.appendChild(table);

    const ctx = detectPreviewContext(td);
    expect(ctx.type).toBe('table');
    expect(ctx.table?.rowIndex).toBe(1);
    expect(ctx.table?.colIndex).toBe(0);
    expect(ctx.table?.sourceLine).toBe(10);
    table.remove();
  });
});

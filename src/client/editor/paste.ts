import { EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { truncateText } from '@shared/text-utils';
import { t } from '../lib/i18n';


export interface PasteHandlers {
  uploadFile: (file: File) => Promise<{
    url: string;
    filename: string;
    isImage: boolean;
  } | null>;
  replaceDetachedUpload?: (placeholder: string, replacement: string) => void;
}
const URL_RE = /^https?:\/\/\S+$/i;
export function pasteExtension(handlers: PasteHandlers) {
  return EditorView.domEventHandlers({
    paste(event, view) {
      const clipboard = event.clipboardData;
      if (!clipboard)
        return false;
      const files = clipboardFiles(clipboard);
      if (files.length) {
        event.preventDefault();
        void insertFiles(view, files, handlers);
        return true;
      }
      if (pasteContent(view, clipboard)) {
        event.preventDefault();
        return true;
      }
      return false;
    },
    drop(event, view) {
      const files = [...(event.dataTransfer?.files ?? [])];
      if (!files.length)
        return false;
      event.preventDefault();
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos != null)
        view.dispatch({ selection: EditorSelection.cursor(pos) });
      void insertFiles(view, files, handlers);
      return true;
    },
    dragover(event) {
      if (event.dataTransfer?.types.includes('Files'))
        event.preventDefault();
      return false;
    },
  });
}

function clipboardFiles(clipboard: DataTransfer): File[] {
  const files = [...clipboard.files];
  if (files.length)
    return files;
  const types = clipboard.types ? Array.from(clipboard.types) : [];
  if (types.includes('text/html') || types.includes('text/plain'))
    return files;
  if (!clipboard.items)
    return files;
  for (const item of [...clipboard.items]) {
    const file = item.kind === 'file' && item.type.startsWith('image/') ? item.getAsFile() : null;
    if (file)
      files.push(file);
  }
  return files;
}

function pasteContent(view: EditorView, clipboard: DataTransfer): boolean {
  const range = view.state.selection.main;
  const plainText = clipboard.getData('text/plain');
  if (isInsideCodeBlock(view.state.doc, range.from)) {
    if (plainText) {
      dispatchPasteInsert(view, plainText);
      return true;
    }
  }
  const text = plainText?.trim();
  if (text && URL_RE.test(text) && pasteUrlOverSelection(view, range, text))
    return true;
  const html = clipboard.getData('text/html');
  if (isFromVsCode(clipboard, html)) {
    if (plainText) {
      dispatchPasteInsert(view, plainText);
      return true;
    }
  }
  if (html && !looksLikeMarkdown(text)) {
    const markdown = htmlToMarkdown(html);
    if (markdown && markdown !== text) {
      dispatchPasteInsert(view, markdown);
      return true;
    }
  }
  return false;
}

function dispatchPasteInsert(view: EditorView, insert: string) {
  const range = view.state.selection.main;
  view.dispatch({
    changes: { from: range.from, to: range.to, insert },
    selection: EditorSelection.cursor(range.from + insert.length),
    userEvent: 'input.paste',
  });
}

function pasteUrlOverSelection(view: EditorView, range: { from: number; to: number; empty: boolean }, text: string): boolean {
  if (range.empty)
    return false;
  const selected = view.state.sliceDoc(range.from, range.to);
  if (URL_RE.test(selected.trim()))
    return false;
  dispatchPasteInsert(view, markdownLink(selected, text));
  return true;
}

function isFromVsCode(clipboard: DataTransfer, html: string): boolean {
  const viaType = clipboard.types ? Array.from(clipboard.types).includes('vscode-editor-data') : false;
  const viaMarkup = html ? html.includes('vscode-light') || html.includes('vscode-dark') || html.includes('white-space: pre') || html.includes('white-space:pre') : false;
  return viaType || viaMarkup;
}

export async function insertFiles(view: EditorView, files: File[], handlers: PasteHandlers): Promise<void> {


  const pending = files.map((file) => {
    const range = view.state.selection.main;
    const marker = `<!-- inkstone-upload:${uploadId()} -->`;
    const placeholder = `${t('editor.uploading_value0', { value0: escapeMarkdownLabel(file.name) })}${marker}`;
    view.dispatch({
      changes: { from: range.from, to: range.to, insert: placeholder },
      selection: EditorSelection.cursor(range.from + placeholder.length),
      userEvent: 'input.paste',
    });
    return { file, placeholder };
  });
  await Promise.all(pending.map(async ({ file, placeholder }) => {
    let result: Awaited<ReturnType<PasteHandlers['uploadFile']>> = null;
    try {
      result = await handlers.uploadFile(file);
    }
    catch {
      // Upload failure degrades to the error placeholder below via the null result.
    }
    const markdown = result
      ? uploadedFileMarkdown(result)
      : t('editor.upload_failed_value0', { value0: safeHtmlComment(file.name) });
    if (!view.dom.isConnected) {
      handlers.replaceDetachedUpload?.(placeholder, markdown);
      return;
    }
    const doc = view.state.doc.toString();
    const at = doc.indexOf(placeholder);
    if (at < 0) {
      handlers.replaceDetachedUpload?.(placeholder, markdown);
      return;
    }
    view.dispatch({
      changes: { from: at, to: at + placeholder.length, insert: markdown },
      userEvent: 'input.paste',
    });
  }));
}

function uploadedFileMarkdown(result: {
  url: string;
  filename: string;
  isImage: boolean;
}): string {
  const label = escapeMarkdownLabel(result.isImage ? stripExt(result.filename) : result.filename);
  return markdownLink(label, result.url, result.isImage, true);
}
function stripExt(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}
function escapeMarkdownLabel(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').replace(/\\/g, '\\\\').replace(/[\[\]]/g, '\\$&');
}
function safeHtmlComment(value: string): string {
  return truncateText(value.replace(/[\r\n<>]+/g, ' ').replace(/--+/g, '\u2014'), 240);
}
function uploadId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
function looksLikeMarkdown(text: string | undefined): boolean {
  if (!text)
    return false;
  return /^(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```|\|)/m.test(text) || /\[[^\]]*\]\([^)]*\)/.test(text);
}



function htmlToMarkdown(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style, meta, link, noscript').forEach((el) => el.remove());
  return walkHtml(doc.body)
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

const WRAP_TAGS: Record<string, string> = { strong: '**', b: '**', em: '*', i: '*', del: '~~', s: '~~', strike: '~~' }

function walkHtml(node: Node, listIndent = ''): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent ?? '').replace(/\s+/g, ' ');
  }
  if (node.nodeType !== Node.ELEMENT_NODE)
    return '';
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  const children = () => [...el.childNodes].map((child) => walkHtml(child, listIndent)).join('');
  if (tag.length === 2 && tag[0] === 'h' && tag[1] >= '1' && tag[1] <= '6') {
    return `\n\n${'#'.repeat(Number(tag[1]))} ${children().trim()}\n\n`;
  }
  const wrap = WRAP_TAGS[tag];
  if (wrap) {
    return wrapped(children(), wrap);
  }
  switch (tag) {
    case 'p':
    case 'div':
      return `\n\n${children().trim()}\n\n`;
    case 'br':
      return '\n';
    case 'hr':
      return '\n\n---\n\n';
    case 'code':
      if (el.closest('pre'))
        return el.textContent ?? '';
      return inlineCode(el.textContent ?? '');
    case 'pre':
      return `\n\n${preBlockMarkdown(el)}\n\n`;
    case 'blockquote':
      return `\n\n${quoteLines(children().trim())}\n\n`;
    case 'a':
      return anchorMarkdown(el, children().trim());
    case 'img':
      return imageMarkdown(el);
    case 'ul':
    case 'ol':
      return `\n\n${renderHtmlList(el, listIndent)}\n\n`;
    case 'li':
      return children();
    case 'table':
      return `\n\n${tableMarkdown(el, listIndent)}\n\n`;
    default:
      return children();
  }
}

function wrapped(text: string, marker: string): string {
  const content = text.trim();
  return content ? `${marker}${content}${marker}` : '';
}

function preBlockMarkdown(el: HTMLElement): string {
  const code = el.textContent ?? '';
  const lang = /language-([a-z0-9+#-]+)/i.exec(el.querySelector('code')?.className ?? '')?.[1] ?? '';
  const fence = '`'.repeat(Math.max(3, longestRun(code, '`') + 1));
  return `${fence}${lang}\n${code.replace(/\n$/, '')}\n${fence}`;
}

function quoteLines(text: string): string {
  return text.split('\n').map((line) => `> ${line}`).join('\n');
}

function anchorMarkdown(el: HTMLElement, label: string): string {
  const href = safePastedHref(el.getAttribute('href') ?? '', false);
  return href ? markdownLink(label || href || '', href) : label;
}

function imageMarkdown(el: HTMLElement): string {
  const src = safePastedHref(el.getAttribute('src') ?? '', true);
  const alt = el.getAttribute('alt') ?? '';
  return src ? markdownLink(alt, src, true) : '';
}

function tableMarkdown(el: HTMLElement, listIndent: string): string {
  const rows = [...el.querySelectorAll('tr')];
  if (!rows.length)
    return [...el.childNodes].map((child) => walkHtml(child, listIndent)).join('');
  const cells = (row: Element) => [...row.querySelectorAll('th, td')].map((c) => (c.textContent ?? '').trim().replace(/\|/g, '\\|'));
  const header = cells(rows[0]!);
  const lines = [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.slice(1).map((row) => `| ${cells(row).join(' | ')} |`),
  ];
  return lines.join('\n');
}

function renderHtmlList(list: HTMLElement, indent: string): string {
  const ordered = list.tagName.toLowerCase() === 'ol';
  const parsedStart = Number.parseInt(list.getAttribute('start') ?? '1', 10);
  const start = Number.isFinite(parsedStart) ? parsedStart : 1;
  const items = [...list.children].filter((child) => child.tagName.toLowerCase() === 'li');
  const lines: string[] = [];
  items.forEach((item, index) => {
    const explicit = Number.parseInt(item.getAttribute('value') ?? '', 10);
    const number = Number.isFinite(explicit) ? explicit : start + index;
    const marker = ordered ? `${number}. ` : '- ';
    const nested: HTMLElement[] = [];
    const content = [...item.childNodes]
      .map((child) => {
        if (child.nodeType === Node.ELEMENT_NODE && /^(?:ul|ol)$/i.test((child as Element).tagName)) {
          nested.push(child as HTMLElement);
          return '';
        }
        return walkHtml(child, indent + ' '.repeat(marker.length));
      })
      .join('')
      .trim()
      .replace(/\n{2,}/g, '\n');
    const contentLines = content ? content.split('\n') : [''];
    lines.push(`${indent}${marker}${contentLines[0]}`);
    for (const continuation of contentLines.slice(1)) {
      lines.push(`${indent}${' '.repeat(marker.length)}${continuation}`);
    }
    for (const childList of nested) {
      lines.push(renderHtmlList(childList, indent + ' '.repeat(marker.length)));
    }
  });
  return lines.join('\n');
}

function markdownLink(label: string, url: string, image = false, labelEscaped = false): string {
  const safeLabel = labelEscaped ? label : escapeMarkdownLabel(label);
  const destination = `<${url.replace(/[\u0000-\u0020<>]/g, (value) => encodeURIComponent(value))}>`;
  return `${image ? '!' : ''}[${safeLabel}](${destination})`;
}

function safePastedHref(value: string, image: boolean): string | null {
  const href = value.trim();
  if (!href)
    return null;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(href)?.[1]?.toLowerCase();
  if (scheme && !(image ? ['http', 'https'] : ['http', 'https', 'mailto', 'tel']).includes(scheme))
    return null;
  return href;
}

function inlineCode(value: string): string {
  const content = value.replace(/[\r\n]+/g, ' ');
  const fence = '`'.repeat(Math.max(1, longestRun(content, '`') + 1));
  const pad = /^(?:\s|`)|(?:\s|`)$/.test(content) ? ' ' : '';
  return `${fence}${pad}${content}${pad}${fence}`;
}

function longestRun(value: string, character: string): number {
  return Math.max(0, ...[...value.matchAll(new RegExp(`${character}+`, 'g'))].map((match) => match[0].length));
}

export function isInsideCodeBlock(doc: { lines: number; line: (n: number) => { text: string; number: number }; lineAt?: (pos: number) => { number: number } }, pos: number): boolean {
  const currentLine = doc.lineAt ? doc.lineAt(pos) : doc.line(1);
  let isInFence = false;
  for (let i = 1; i <= currentLine.number; i++) {
    const line = doc.line(i);
    const match = /^\s*(`{3,}|~{3,})/.exec(line.text);
    if (match) {
      if (i === currentLine.number) {
        return true;
      }
      isInFence = !isInFence;
    }
  }
  return isInFence;
}

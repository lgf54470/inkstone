import { t } from '../../i18n';
import { highlightWithPrism } from '../prism';
import { sanitizeCodeTokenHtml } from '../sanitize';

export function decorateCodeBlock(block: HTMLElement): void {
    const pre = block.querySelector<HTMLElement>('pre');
    const code = pre?.querySelector<HTMLElement>('code');
    if (!pre || !code)
        return;
    let lines = [...code.querySelectorAll<HTMLElement>(':scope > .line')];
    if (!lines.length) {
        const values = splitNodesAtNewlines([...code.childNodes]);
        if ((code.textContent ?? '').endsWith('\n'))
            values.pop();
        code.replaceChildren();
        values.forEach((value, index) => {
            const line = document.createElement('span');
            line.className = 'line';
            line.append(...value);
            if (!line.textContent)
                line.textContent = ' ';
            code.append(line);
            if (index < values.length - 1)
                code.append('\n');
        });
        lines = [...code.querySelectorAll<HTMLElement>(':scope > .line')];
    }
    const start = Math.max(1, Number(block.dataset.codeStart) || 1);
    const highlighted = new Set((block.dataset.highlightLines ?? '')
        .split(',')
        .map(Number)
        .filter((value) => Number.isInteger(value) && value > 0));
    const numbered = block.dataset.lineNumbers === 'true';
    block.classList.toggle('has-line-numbers', numbered);
    lines.forEach((line, index) => {
        line.dataset.lineNumber = String(start + index);
        line.classList.toggle('highlighted', highlighted.has(index + 1));
    });
}

function splitNodesAtNewlines(nodes: Node[]): Node[][] {
    const lines: Node[][] = [[]];
    for (const node of nodes) {
        const parts = splitNodeAtNewlines(node);
        lines[lines.length - 1]!.push(...parts[0]!);
        for (let index = 1; index < parts.length; index++)
            lines.push(parts[index]!);
    }
    return lines;
}

function splitNodeAtNewlines(node: Node): Node[][] {
    if (node.nodeType === Node.TEXT_NODE)
        return (node.textContent ?? '').split('\n').map((text) => [document.createTextNode(text)]);
    if (!(node instanceof HTMLElement))
        return [[node.cloneNode(true)]];
    return splitNodesAtNewlines([...node.childNodes]).map((children) => {
        const clone = node.cloneNode(false) as HTMLElement;
        clone.append(...children);
        return [clone];
    });
}

export async function highlightCodeBlocks(root: HTMLElement): Promise<void> {
    await Promise.all([...root.querySelectorAll<HTMLElement>('.code-block')].map(async (block) => {
        const code = block.querySelector<HTMLElement>(':scope > pre > code');
        if (!code)
            return;
        const source = (code.textContent ?? '').replace(/\n$/, '');
        try {
            const highlighted = await highlightWithPrism(source, block.dataset.lang ?? '');
            if (highlighted) {
                code.innerHTML = sanitizeCodeTokenHtml(highlighted.html);
                code.classList.add(`language-${highlighted.language}`);
            }
            else {
                code.textContent = source;
            }
        }
        catch (err) {
            code.textContent = source;
            console.warn(t("markdown.inkstone_code_highlighting_failed_showing_plain_text"), err);
        }
        decorateCodeBlock(block);
    }));
}
let generatedCodeBlockId = 0;

export function configureCodeBlockCollapsing(root: HTMLElement, collapseLines: number): void {
    const threshold = Number.isInteger(collapseLines) && collapseLines >= 8 ? collapseLines : 0;
    root.querySelectorAll<HTMLElement>('.code-block:not(.markdown-example-code)').forEach((block) => {
        const button = block.querySelector<HTMLButtonElement>('[data-code-collapse]');
        const pre = block.querySelector<HTMLElement>(':scope > pre');
        const lineCount = block.querySelectorAll(':scope pre code > .line').length;
        const wasExpanded = block.classList.contains('is-code-expanded');
        block.classList.remove('is-code-collapsed', 'is-code-expanded');
        delete block.dataset.codeCollapseLines;
        delete block.dataset.codeLineCount;
        delete block.dataset.codeCollapseMaxHeight;
        if (pre)
            pre.style.maxHeight = '';
        button?.remove();
        if (!threshold || lineCount <= threshold)
            return;
        const head = block.querySelector<HTMLElement>(':scope > .code-block-head');
        if (!head)
            return;
        block.dataset.codeCollapseLines = String(threshold);
        block.dataset.codeLineCount = String(lineCount);
        block.classList.add(wasExpanded ? 'is-code-expanded' : 'is-code-collapsed');
        const maxHeight = `${threshold * 1.56 + 1.5}em`;
        block.dataset.codeCollapseMaxHeight = maxHeight;
        if (pre)
            pre.style.maxHeight = wasExpanded ? '' : maxHeight;
        const codeId = pre?.id || `ink-code-${++generatedCodeBlockId}`;
        if (pre)
            pre.id = codeId;
        const toggle = document.createElement('button');
        toggle.className = 'code-collapse';
        toggle.type = 'button';
        toggle.dataset.codeCollapse = '1';
        toggle.setAttribute('aria-controls', codeId);
        toggle.setAttribute('aria-expanded', String(wasExpanded));
        toggle.textContent = wasExpanded
            ? t('markdown.collapse_code')
            : t('markdown.show_more_code', { count: lineCount - threshold });
        head.insertBefore(toggle, head.querySelector('[data-copy]'));
    });
}
export function toggleCodeBlockCollapse(button: HTMLButtonElement): void {
    const block = button.closest<HTMLElement>('.code-block');
    if (!block)
        return;
    const expanded = block.classList.toggle('is-code-expanded');
    block.classList.toggle('is-code-collapsed', !expanded);
    const pre = block.querySelector<HTMLElement>(':scope > pre');
    if (pre)
        pre.style.maxHeight = expanded ? '' : block.dataset.codeCollapseMaxHeight ?? '';
    button.setAttribute('aria-expanded', String(expanded));
    button.textContent = expanded
        ? t('markdown.collapse_code')
        : t('markdown.show_more_code', {
            count: Math.max(0, Number(block.dataset.codeLineCount) - Number(block.dataset.codeCollapseLines)),
        });
}

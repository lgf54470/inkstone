import MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import { escapeHtml } from '@shared/escape';
import { t } from '../../i18n';
import { escapeAttr } from './util';
export 
function matchingClose(tokens: Token[], start: number, openType: string, closeType: string): number {
    let depth = 0;
    for (let index = start; index < tokens.length; index++) {
        if (tokens[index]!.type === openType)
            depth++;
        else if (tokens[index]!.type === closeType && --depth === 0)
            return index;
    }
    return -1;
}
export 
function normalizeCalloutType(value: string): string {
    const type = value.toLowerCase();
    const aliases: Record<string, string> = {
        summary: 'abstract',
        tldr: 'abstract',
        hint: 'tip',
        important: 'tip',
        check: 'success',
        done: 'success',
        help: 'question',
        faq: 'question',
        caution: 'warning',
        attention: 'warning',
        fail: 'failure',
        missing: 'failure',
        error: 'danger',
        bug: 'danger',
        cite: 'quote',
    };
    return (aliases[type] ?? type.replace(/[^a-z0-9_-]/g, '')) || 'note';
}
export 
function calloutDefaultTitle(type: string): string {
    const names: Record<string, string> = {
        note: t("markdown.note"),
        abstract: t("markdown.abstract"),
        info: t("markdown.info"),
        todo: t("markdown.todo"),
        tip: t("markdown.tip"),
        success: t("markdown.success"),
        question: t("markdown.question"),
        warning: t("markdown.warning"),
        failure: t("markdown.failure"),
        danger: t("markdown.danger"),
        example: t("markdown.example"),
        quote: t("common.quote"),
    };
    return names[type] ?? type;
}
export 
function findOpeningToken(tokens: Token[], inlineIndex: number): Token | null {
    const previous = tokens[inlineIndex - 1];
    if (previous && ['paragraph_open', 'heading_open'].includes(previous.type))
        return previous;
    return null;
}
export 
function expandBlockReferences(inline: Token, TokenConstructor: new (type: string, tag: string, nesting: -1 | 0 | 1) => Token): void {
    if (!inline.children)
        return;
    const expanded: Token[] = [];
    for (const child of inline.children) {
        if (child.type !== 'text' || !child.content.includes('((')) {
            expanded.push(child);
            continue;
        }
        let cursor = 0;
        const pattern = /\(\(([A-Za-z0-9][A-Za-z0-9_-]{0,63})\)\)/g;
        for (const match of child.content.matchAll(pattern)) {
            if (match.index! > cursor) {
                const textToken = new TokenConstructor('text', '', 0);
                textToken.content = child.content.slice(cursor, match.index);
                expanded.push(textToken);
            }
            const reference = new TokenConstructor('block_reference', 'a', 0);
            reference.content = match[1]!;
            expanded.push(reference);
            cursor = match.index! + match[0].length;
        }
        if (cursor < child.content.length) {
            const textToken = new TokenConstructor('text', '', 0);
            textToken.content = child.content.slice(cursor);
            expanded.push(textToken);
        }
    }
    inline.children = expanded;
}
export 
function reparseInline(token: Token, content: string, markdown: MarkdownIt, env: unknown): void {
    const children: Token[] = [];
    markdown.inline.parse(content, markdown, env, children);
    token.content = content;
    token.children = children;
}
export 
function setTokenAttribute(token: Token, name: string, value: string): void {
    if (name === 'class') {
        value.split(/\s+/).filter(Boolean).forEach((className) => appendTokenClass(token, className));
    }
    else {
        token.attrSet(name, value);
    }
}
export 
function appendTokenClass(token: Token, className: string): void {
    const current = token.attrGet('class')?.split(/\s+/).filter(Boolean) ?? [];
    if (!current.includes(className))
        current.push(className);
    token.attrSet('class', current.join(' '));
}

export function registerObsidian(md: MarkdownIt): void {

    md.core.ruler.before('github-task-lists', 'obsidian_blocks', (state) => {
        const seenBlockIds = new Set<string>();
        for (let index = 0; index < state.tokens.length; index++) {
            const inline = state.tokens[index]!;
            if (inline.type !== 'inline')
                continue;
            expandBlockReferences(inline, state.Token);
            const opening = findOpeningToken(state.tokens, index);
            if (!opening)
                continue;
            let content = inline.content;
            const block = /(?:^|\s)\^([A-Za-z0-9][A-Za-z0-9_-]{0,63})\s*$/.exec(content);
            if (block) {
                let id = block[1]!;
                const original = id;
                let suffix = 2;
                while (seenBlockIds.has(id))
                    id = `${original}-${suffix++}`;
                seenBlockIds.add(id);
                setTokenAttribute(opening, 'id', `^${id}`);
                setTokenAttribute(opening, 'data-block-id', id);
                content = content.slice(0, block.index).trimEnd();
            }
            if (content !== inline.content)
                reparseInline(inline, content, state.md, state.env);
        }
        return true;
    });
    md.core.ruler.after('github-task-lists', 'obsidian_callouts', (state) => {
        for (let index = 0; index < state.tokens.length; index++) {
            const open = state.tokens[index]!;
            if (open.type !== 'blockquote_open')
                continue;
            const paragraphOpen = state.tokens[index + 1];
            const inline = state.tokens[index + 2];
            if (paragraphOpen?.type !== 'paragraph_open' || inline?.type !== 'inline')
                continue;
            const firstBreak = inline.content.indexOf('\n');
            const firstLine = firstBreak >= 0 ? inline.content.slice(0, firstBreak) : inline.content;
            const marker = /^\[!([A-Za-z][A-Za-z0-9_-]{0,31})\]([+-])?(?:[ \t]+(.+?))?[ \t]*$/.exec(firstLine);
            if (!marker)
                continue;
            const closeIndex = matchingClose(state.tokens, index, 'blockquote_open', 'blockquote_close');
            if (closeIndex < 0)
                continue;
            const type = normalizeCalloutType(marker[1]!);
            const fold = marker[2] ?? '';
            const title = marker[3]?.trim() || calloutDefaultTitle(type);
            open.type = 'callout_open';
            open.tag = fold ? 'details' : 'aside';
            open.meta = { type, title, fold };
            const close = state.tokens[closeIndex]!;
            close.type = 'callout_close';
            close.tag = open.tag;
            close.meta = { fold };
            const remaining = firstBreak >= 0 ? inline.content.slice(firstBreak + 1) : '';
            if (remaining.trim()) {
                reparseInline(inline, remaining, state.md, state.env);
            }
            else {
                const paragraphClose = state.tokens[index + 3];
                if (paragraphClose?.type === 'paragraph_close')
                    state.tokens.splice(index + 1, 3);
            }
        }
        return true;
    });
    md.renderer.rules.callout_open = (tokens, index) => {
        const sourceLine = tokens[index]!.map?.[0];
        const line = sourceLine === undefined ? '' : ` data-line="${sourceLine}"`;
        const { type, title, fold } = tokens[index]!.meta as {
            type: string;
            title: string;
            fold: string;
        };
        if (fold) {
            return `<details class="callout callout-${escapeAttr(type)}" data-callout="${escapeAttr(type)}"${line}${fold === '+' ? ' open' : ''}><summary class="callout-title">${escapeHtml(title)}</summary><div class="callout-content">`;
        }
        return `<aside class="callout callout-${escapeAttr(type)}" data-callout="${escapeAttr(type)}"${line}><div class="callout-title">${escapeHtml(title)}</div><div class="callout-content">`;
    };
    md.renderer.rules.callout_close = (tokens, index) => `</div>${(tokens[index]!.meta as {
        fold: string;
    }).fold ? '</details>' : '</aside>'}`;
}

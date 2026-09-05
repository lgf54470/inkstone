import MarkdownIt from 'markdown-it';
import { escapeHtml } from '@shared/escape';
import { t } from '../../i18n';
import { renderEnv } from './env';
import { escapeAttr } from './util';
export 
function renderFrontMatterValue(value: unknown): string {
    if (value == null)
        return '<span class="frontmatter-empty">—</span>';
    if (Array.isArray(value)) {
        return value.map((item) => `<span class="frontmatter-chip">${escapeHtml(formatScalar(item))}</span>`).join('');
    }
    if (typeof value === 'object')
        return `<code>${escapeHtml(JSON.stringify(value))}</code>`;
    return escapeHtml(formatScalar(value));
}
export 
function formatScalar(value: unknown): string {
    if (value instanceof Date)
        return value.toISOString();
    return String(value);
}
export 
function blockLine(state: {
    src: string;
    bMarks: number[];
    tShift: number[];
    eMarks: number[];
}, line: number): string {
    const from = state.bMarks[line]! + state.tShift[line]!;
    return state.src.slice(from, state.eMarks[line]!);
}
export 
function findContainerEnd(state: {
    src: string;
    bMarks: number[];
    tShift: number[];
    eMarks: number[];
}, startLine: number, endLine: number, markerLength: number): number {
    let depth = 1;
    let fence: {
        char: string;
        length: number;
    } | null = null;
    for (let line = startLine + 1; line < endLine; line++) {
        const text = blockLine(state, line);
        const fenceMatch = /^(`{3,}|~{3,})/.exec(text);
        if (fenceMatch) {
            const marker = fenceMatch[1]!;
            if (!fence)
                fence = { char: marker[0]!, length: marker.length };
            else if (marker[0] === fence.char && marker.length >= fence.length)
                fence = null;
            continue;
        }
        if (fence)
            continue;
        if (new RegExp(`^:{${markerLength},}(?:\\s+(?:details|tabs)\\b|\\{tab-set\\})`).test(text))
            depth++;
        else if (new RegExp(`^:{${markerLength},}\\s*$`).test(text) && --depth === 0)
            return line;
    }
    return -1;
}
export 
function findTabSegments(state: {
    src: string;
    bMarks: number[];
    tShift: number[];
    eMarks: number[];
}, start: number, end: number): Array<{
    title: string;
    start: number;
    end: number;
    selected: boolean;
}> {
    const directiveTabs = findDirectiveTabSegments(state, start, end);
    if (directiveTabs.length)
        return directiveTabs;
    const markers: Array<{
        line: number;
        title: string;
        selected: boolean;
    }> = [];
    let fence: {
        char: string;
        length: number;
    } | null = null;
    for (let line = start; line < end; line++) {
        const text = blockLine(state, line);
        const fenceMatch = /^(`{3,}|~{3,})/.exec(text);
        if (fenceMatch) {
            const marker = fenceMatch[1]!;
            if (!fence)
                fence = { char: marker[0]!, length: marker.length };
            else if (marker[0] === fence.char && marker.length >= fence.length)
                fence = null;
            continue;
        }
        if (fence)
            continue;
        const tab = /^@tab(?::active|\+)?\b[ \t]+(.+?)[ \t]*$/.exec(text);
        if (tab) {
            const selected = /^@tab(?::active|\+)\b/.test(text);
            markers.push({ line, title: stripBracketTitle(tab[1]!) || t("common.tabs"), selected });
        }
    }
    return markers.map((marker, index) => ({
        title: marker.title,
        start: marker.line + 1,
        end: markers[index + 1]?.line ?? end,
        selected: marker.selected,
    }));
}
export 
function findDirectiveTabSegments(state: {
    src: string;
    bMarks: number[];
    tShift: number[];
    eMarks: number[];
}, start: number, end: number): Array<{
    title: string;
    start: number;
    end: number;
    selected: boolean;
}> {
    const tabs: Array<{ title: string; start: number; end: number; selected: boolean }> = [];
    for (let line = start; line < end;) {
        const match = /^(:{3,})(?:\{tab-item\}|[ \t]+tab-item)(?:[ \t]+(.*?))?[ \t]*$/.exec(blockLine(state, line));
        if (!match) {
            line++;
            continue;
        }
        const close = findColonFenceEnd(state, line + 1, end, match[1]!.length);
        if (close < 0)
            return [];
        let contentStart = line + 1;
        let isSelected = false;
        while (contentStart < close) {
            const option = /^:([a-z][a-z0-9_-]*):(?:[ \t]+.*)?$/i.exec(blockLine(state, contentStart));
            if (!option)
                break;
            if (option[1]!.toLowerCase() === 'selected')
                isSelected = true;
            contentStart++;
        }
        if (contentStart < close && !blockLine(state, contentStart).trim())
            contentStart++;
        tabs.push({
            title: stripBracketTitle(match[2] ?? '') || t("common.tabs"),
            start: contentStart,
            end: close,
            selected: isSelected,
        });
        line = close + 1;
    }
    return tabs;
}
export 
function findColonFenceEnd(state: {
    src: string;
    bMarks: number[];
    tShift: number[];
    eMarks: number[];
}, start: number, end: number, markerLength: number): number {
    let fence: { char: string; length: number } | null = null;
    for (let line = start; line < end; line++) {
        const text = blockLine(state, line);
        const codeFence = /^(`{3,}|~{3,})/.exec(text);
        if (codeFence) {
            const marker = codeFence[1]!;
            if (!fence)
                fence = { char: marker[0]!, length: marker.length };
            else if (marker[0] === fence.char && marker.length >= fence.length)
                fence = null;
            continue;
        }
        if (!fence && new RegExp(`^:{${markerLength},}\\s*$`).test(text))
            return line;
    }
    return -1;
}
export 
function stripBracketTitle(value: string): string {
    const trimmed = value.trim();
    return /^\[[\s\S]*\]$/.test(trimmed) ? trimmed.slice(1, -1).trim() : trimmed;
}

export function registerContainers(md: MarkdownIt): void {

    md.block.ruler.before('fence', 'modern_container', (state, startLine, endLine, silent) => {
        const source = blockLine(state, startLine);
        const legacyMatch = /^(:{3,})[ \t]+(details|tabs)\b(?:[ \t]+(.*))?$/.exec(source);
        const directiveMatch = /^(:{3,})\{(tab-set)\}[ \t]*(.*)$/.exec(source);
        if (!legacyMatch && !directiveMatch)
            return false;
        const markerLength = (legacyMatch?.[1] ?? directiveMatch![1]!).length;
        const end = findContainerEnd(state, startLine, endLine, markerLength);
        if (end < 0)
            return false;
        if (silent)
            return true;
        const kind = legacyMatch?.[2] ?? directiveMatch![2]!;
        if (kind === 'details') {
            const rawInfo = (legacyMatch?.[3] ?? '').trim();
            const open = /^(?:open|\+)\b/.test(rawInfo);
            const title = stripBracketTitle(rawInfo.replace(/^(?:open|\+)\b[ \t]*/, '')) || t("markdown.details");
            const openToken = state.push('details_open', 'details', 1);
            openToken.block = true;
            openToken.map = [startLine, end + 1];
            openToken.meta = { open };
            const summary = state.push('details_summary', 'summary', 0);
            summary.content = title;
            state.md.block.tokenize(state, startLine + 1, end);
            state.push('details_close', 'details', -1).block = true;
        }
        else {
            const tabs = findTabSegments(state, startLine + 1, end);
            if (!tabs.length) {
                state.line = end + 1;
                return true;
            }
            const env = renderEnv(state.env);
            const id = `${env.docId}-tabs-${++env.tabSequence}`;
            const selectedIndex = Math.max(0, tabs.findIndex((tab) => tab.selected));
            const openToken = state.push('tabs_open', 'div', 1);
            openToken.block = true;
            openToken.map = [startLine, end + 1];
            openToken.meta = { id, titles: tabs.map((tab) => tab.title), selectedIndex };
            tabs.forEach((tab, tabIndex) => {
                const panelOpen = state.push('tab_panel_open', 'section', 1);
                panelOpen.block = true;
                panelOpen.meta = { id, tabIndex, selected: tabIndex === selectedIndex };
                state.md.block.tokenize(state, tab.start, tab.end);
                const panelClose = state.push('tab_panel_close', 'section', -1);
                panelClose.block = true;
                panelClose.meta = { id, tabIndex };
            });
            state.push('tabs_close', 'div', -1).block = true;
        }
        state.line = end + 1;
        return true;
    });
    md.renderer.rules.details_open = (tokens, index) => {
        const sourceLine = tokens[index]!.map?.[0];
        const open = Boolean((tokens[index]!.meta as {
            open?: boolean;
        })?.open);
        return `<details class="markdown-details"${sourceLine === undefined ? '' : ` data-line="${sourceLine}"`}${open ? ' open' : ''}>`;
    };
    md.renderer.rules.details_summary = (tokens, index) => `<summary>${escapeHtml(tokens[index]!.content)}</summary>`;
    md.renderer.rules.details_close = () => '</details>';
    md.renderer.rules.tabs_open = (tokens, index) => {
        const sourceLine = tokens[index]!.map?.[0];
        const { id, titles, selectedIndex } = tokens[index]!.meta as {
            id: string;
            titles: string[];
            selectedIndex: number;
        };
        const buttons = titles
            .map((title, tabIndex) => `<button type="button" role="tab" id="${id}-tab-${tabIndex}" aria-controls="${id}-panel-${tabIndex}" aria-selected="${tabIndex === selectedIndex ? 'true' : 'false'}" tabindex="${tabIndex === selectedIndex ? '0' : '-1'}" data-tab-button="${tabIndex}">${escapeHtml(title)}</button>`)
            .join('');
        return `<div class="markdown-tabs" data-tabs${sourceLine === undefined ? '' : ` data-line="${sourceLine}"`}><div class="tab-list" role="tablist" aria-label="${escapeAttr(t("common.tabs"))}">${buttons}</div>`;
    };
    md.renderer.rules.tabs_close = () => '</div>';
    md.renderer.rules.tab_panel_open = (tokens, index) => {
        const { id, tabIndex, selected } = tokens[index]!.meta as {
            id: string;
            tabIndex: number;
            selected: boolean;
        };
        return `<section class="tab-panel" role="tabpanel" id="${id}-panel-${tabIndex}" aria-labelledby="${id}-tab-${tabIndex}" data-tab-panel="${tabIndex}"${selected ? '' : ' hidden'}>`;
    };
    md.renderer.rules.tab_panel_close = () => '</section>';
}

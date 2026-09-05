import type { WikiTarget, FenceInfo } from './types';
import { clamp } from './util';
export 

function stripObsidianComments(source: string): string {
    const lines = source.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g)?.filter(Boolean) ?? [];
    let isInComment = false;
    let fenceChar = '';
    let fenceLength = 0;
    return lines.map((line) => {
        const ending = /\r\n$|[\r\n]$/.exec(line)?.[0] ?? '';
        const body = ending ? line.slice(0, -ending.length) : line;
        const fence = !isInComment ? /^ {0,3}(`{3,}|~{3,})/.exec(body) : null;
        if (fence) {
            const marker = fence[1]!;
            if (!fenceChar) {
                fenceChar = marker[0]!;
                fenceLength = marker.length;
            }
            else if (marker[0] === fenceChar && marker.length >= fenceLength) {
                fenceChar = '';
                fenceLength = 0;
            }
            return line;
        }
        if (fenceChar)
            return line;
        let output = '';
        let inlineTicks = 0;
        for (let index = 0; index < body.length;) {
            if (body[index] === '`' && !isInComment) {
                let end = index + 1;
                while (body[end] === '`')
                    end++;
                const ticks = end - index;
                if (!inlineTicks || inlineTicks === ticks)
                    inlineTicks = inlineTicks ? 0 : ticks;
                output += body.slice(index, end);
                index = end;
                continue;
            }
            const marker = body.startsWith('%%', index) && body[index - 1] !== '\\';
            if (marker && !inlineTicks) {
                isInComment = !isInComment;
                output += '  ';
                index += 2;
                continue;
            }
            output += isInComment ? ' ' : body[index]!;
            index++;
        }
        return output + ending;
    }).join('');
}

export function parseWikiTarget(source: string): WikiTarget {
    const pipe = source.indexOf('|');
    const rawTarget = (pipe >= 0 ? source.slice(0, pipe) : source).trim();
    const alias = pipe >= 0 ? source.slice(pipe + 1).trim() || null : null;
    let noteTitle = rawTarget;
    let heading: string | null = null;
    let blockId: string | null = null;
    if (rawTarget.startsWith('^')) {
        noteTitle = '';
        blockId = rawTarget.slice(1);
    }
    else {
        const hash = rawTarget.indexOf('#');
        if (hash >= 0) {
            noteTitle = rawTarget.slice(0, hash).trim();
            const fragment = rawTarget.slice(hash + 1).trim();
            if (fragment.startsWith('^'))
                blockId = fragment.slice(1);
            else
                heading = fragment || null;
        }
    }
    return { raw: rawTarget, noteTitle, heading, blockId, alias };
}

export function parseFenceInfo(source: string): FenceInfo {
    let rest = source.trim();
    let language = '';
    let title = '';
    let hasLineNumbers = false;
    let startLine = 1;
    const highlighted = new Set<number>();
    const leadingCodeOptions = /^\{([^{}]+)\}/.exec(rest);
    if (leadingCodeOptions && !/^\d[\d,\s-]*$/.test(leadingCodeOptions[1]!.trim())) {
        const classes = [...leadingCodeOptions[1]!.matchAll(/(?:^|\s)\.([A-Za-z][\w-]{0,63})/g)]
            .map((match) => match[1]!);
        language = classes.find((className) => !isReservedCodeClass(className))?.toLowerCase() ?? '';
        hasLineNumbers = classes.some(isReservedCodeClass);
        title = codeMetadataValue(leadingCodeOptions[1]!, 'title') ?? '';
        const startAttribute = codeMetadataValue(leadingCodeOptions[1]!, 'start', 'startfrom');
        if (startAttribute && /^\d+$/.test(startAttribute))
            startLine = clamp(Number(startAttribute), 1, 100000);
        const highlightAttribute = codeMetadataValue(leadingCodeOptions[1]!, 'hl_lines', 'highlight');
        if (highlightAttribute)
            parseLineSpec(highlightAttribute).forEach((line) => highlighted.add(line));
        rest = rest.slice(leadingCodeOptions[0].length).trim();
    }
    if (!language) {
        const lang = /^([^\s{]+)/.exec(rest);
        if (lang) {
            language = lang[1]!.toLowerCase();
            rest = rest.slice(lang[0].length).trim();
        }
    }
    const titleMatch = /(?:^|\s)title=(?:"([^"]*)"|'([^']*)'|([^\s]+))/.exec(rest);
    if (titleMatch)
        title = titleMatch[1] ?? titleMatch[2] ?? titleMatch[3] ?? '';
    const bracketTitle = /(?:^|\s)\[([^\]\n]+)\]/.exec(rest);
    if (!title && bracketTitle)
        title = bracketTitle[1]!.trim();
    const hasLineNumbersDisable = /(?:^|[\s{])\.?(?:line-?numbers|linenos|number-?lines|show-?line-?numbers)=(?:"?false"?|0)(?=[\s}]|$)/i.test(rest);
    const hasLineNumbersEnable = /(?:^|[\s{])\.?(?:line-?numbers|linenos|number-?lines|show-?line-?numbers)(?:=(?:"?true"?|1))?(?=[\s}]|$)/i.test(rest);
    if (hasLineNumbersDisable) {
        hasLineNumbers = false;
    }
    else if (hasLineNumbersEnable) {
        hasLineNumbers = true;
    }
    const start = /(?:^|\s)(?:start|startFrom)=(?:"(\d+)"|'(\d+)'|(\d+))/.exec(rest);
    if (start)
        startLine = clamp(Number(start[1] ?? start[2] ?? start[3]), 1, 100000);
    for (const highlight of rest.matchAll(/(?:^|\s)\{(\d[\d,\s-]*)\}/g)) {
        parseLineSpec(highlight[1]!).forEach((line) => highlighted.add(line));
    }
    const highlightNamed = /(?:^|\s)(?:hl_lines|highlight)=(?:"([^"]*)"|'([^']*)'|([^\s]+))/.exec(rest);
    if (highlightNamed) {
        parseLineSpec(highlightNamed[1] ?? highlightNamed[2] ?? highlightNamed[3] ?? '').forEach((line) => highlighted.add(line));
    }
    return {
        language,
        title,
        lineNumbers: hasLineNumbers,
        startLine,
        highlightedLines: [...highlighted].sort((a, b) => a - b),
    };
}
export 
function parseLineSpec(source: string): number[] {
    const lines = new Set<number>();
    for (const part of source.split(/[ ,]+/).filter(Boolean).slice(0, 200)) {
        const range = /^(\d+)-(\d+)$/.exec(part);
        if (range) {
            const from = clamp(Number(range[1]), 1, 100000);
            const to = clamp(Number(range[2]), from, Math.min(100000, from + 1000));
            for (let line = from; line <= to; line++)
                lines.add(line);
        }
        else if (/^\d+$/.test(part)) {
            lines.add(clamp(Number(part), 1, 100000));
        }
    }
    return [...lines];
}
export 
function isReservedCodeClass(value: string): boolean {
    const normalized = value.toLowerCase().replace(/[-_]/g, '');
    return ['numberlines', 'linenumbers', 'linenos', 'showlinenumbers'].includes(normalized);
}
export 
function codeMetadataValue(source: string, ...names: string[]): string | null {
    const wanted = new Set(names.map((name) => name.toLowerCase()));
    const pattern = /(?:^|\s)([A-Za-z][\w-]*)=(?:"([^"]*)"|'([^']*)'|([^\s]+))/g;
    for (const match of source.matchAll(pattern)) {
        if (wanted.has(match[1]!.toLowerCase()))
            return (match[2] ?? match[3] ?? match[4] ?? '').slice(0, 512);
    }
    return null;
}

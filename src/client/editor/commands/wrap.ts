import { EditorSelection, type ChangeSpec, EditorState, SelectionRange, StateCommand } from '@codemirror/state';
import { selectedLineBounds, lineIndent, linePrefixMatch } from './enter';




export function toggleWrap(open: string, close = open): StateCommand {
    return ({ state, dispatch }) => {
        const changes = state.changeByRange((range) => {
            const surrounding = surroundingMarkers(state, range, open, close);

            if (surrounding) {
                return {
                    changes: [
                        { from: range.from - surrounding.open, to: range.from },
                        { from: range.to, to: range.to + surrounding.close },
                    ],
                    range: EditorSelection.range(range.from - surrounding.open, range.to - surrounding.open),
                };
            }

            let { from, to } = range;
            if (from === to) {
                const line = state.doc.lineAt(from);
                const offset = from - line.from;
                const wordStart = /[\p{L}\p{N}_]+$/u.exec(line.text.slice(0, offset));
                const wordEnd = /^[\p{L}\p{N}_]+/u.exec(line.text.slice(offset));
                if (wordStart || wordEnd) {
                    from = line.from + offset - (wordStart?.[0].length ?? 0);
                    to = line.from + offset + (wordEnd?.[0].length ?? 0);
                }
            }
            const text = state.sliceDoc(from, to);

            const contained = containedMarkers(text, open, close);
            if (contained) {
                return {
                    changes: { from, to, insert: text.slice(contained.open, text.length - contained.close) },
                    range: EditorSelection.range(from, to - contained.open - contained.close),
                };
            }
            return {
                changes: { from, to, insert: `${open}${text}${close}` },
                range: text
                    ? EditorSelection.range(from + open.length, to + open.length)
                    : EditorSelection.cursor(from + open.length),
            };
        });
        dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input.format' }));
        return true;
    };
}


export function toggleLinePrefix(
    prefix: string | ((index: number) => string),
    pattern: RegExp,
    replacementPattern?: RegExp,
): StateCommand {
    return ({ state, dispatch }) => {
        const changes: ChangeSpec[] = [];
        const seen = new Set<number>();
        let index = 0;
        for (const range of state.selection.ranges) {
            const { startLine, endLine } = selectedLineBounds(state, range);
            let isAllPrefixed = true;
            for (let n = startLine; n <= endLine; n++) {
                if (!linePrefixMatch(state.doc.line(n).text, pattern)) {
                    isAllPrefixed = false;
                    break;
                }
            }
            for (let n = startLine; n <= endLine; n++) {
                if (seen.has(n))
                    continue;
                seen.add(n);
                const line = state.doc.line(n);
                const indent = lineIndent(line.text);
                const match = linePrefixMatch(line.text, pattern);
                const replacement = replacementPattern
                    ? linePrefixMatch(line.text, replacementPattern)
                    : null;
                if (isAllPrefixed && match) {
                    changes.push({
                        from: line.from + indent.length,
                        to: line.from + indent.length + match[0].length,
                    });
                }
                else if (!match) {
                    const value = typeof prefix === 'function' ? prefix(index) : prefix;
                    changes.push({
                        from: line.from + indent.length,
                        to: replacement
                            ? line.from + indent.length + replacement[0].length
                            : line.from + indent.length,
                        insert: value,
                    });
                }
                index++;
            }
        }
        if (!changes.length)
            return false;
        const changeSet = state.changes(changes);
        dispatch(state.update({
            changes: changeSet,
            selection: state.selection.map(changeSet, 1),
            scrollIntoView: true,
            userEvent: 'input.format',
        }));
        return true;
    };
}


export const toggleBold = toggleWrap('**');


export const toggleItalic = toggleWrap('*');


export const toggleInlineCode: StateCommand = ({ state, dispatch }) => {
    const changes = state.changeByRange((range) => {
        let { from, to } = range;
        if (from === to) {
            const line = state.doc.lineAt(from);
            const offset = from - line.from;
            const wordStart = /[\p{L}\p{N}_]+$/u.exec(line.text.slice(0, offset));
            const wordEnd = /^[\p{L}\p{N}_]+/u.exec(line.text.slice(offset));
            if (wordStart || wordEnd) {
                from -= wordStart?.[0].length ?? 0;
                to += wordEnd?.[0].length ?? 0;
            }
        }
        const selected = state.sliceDoc(from, to);
        const contained = codeSpanMarkers(selected);
        if (contained) {
            let content = selected.slice(contained, selected.length - contained);
            if (content.startsWith(' ') && content.endsWith(' ') && /\S/.test(content))
                content = content.slice(1, -1);
            return {
                changes: { from, to, insert: content },
                range: EditorSelection.range(from, from + content.length),
            };
        }
        const before = countRunBefore(state, from, '`');
        const after = countRunAfter(state, to, '`');
        if (before > 0 && before === after) {
            return {
                changes: [
                    { from: from - before, to: from },
                    { from: to, to: to + after },
                ],
                range: EditorSelection.range(from - before, to - before),
            };
        }
        const fence = '`'.repeat(Math.max(1, longestCharacterRun(selected, '`') + 1));
        const pad = selected && /^(?:\s|`)|(?:\s|`)$/.test(selected) ? ' ' : '';
        const insert = `${fence}${pad}${selected}${pad}${fence}`;
        const selectionFrom = from + fence.length + pad.length;
        return {
            changes: { from, to, insert },
            range: selected
                ? EditorSelection.range(selectionFrom, selectionFrom + selected.length)
                : EditorSelection.cursor(from + fence.length),
        };
    });
    dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input.format' }));
    return true;
};


export const toggleStrikethrough = toggleWrap('~~');


export const toggleUnderline = toggleWrap('++');


export const toggleHighlight = toggleWrap('==');


export const toggleSubscript = toggleWrap('~');


export const toggleSuperscript = toggleWrap('^');


export const toggleInlineMath = toggleWrap('$');


export const toggleWikiLink = toggleWrap('[[', ']]');


export const toggleNoteEmbed = toggleWrap('![[', ']]');


export const toggleBlockReference = toggleWrap('[[#^', ']]');


export const toggleQuote = toggleLinePrefix('> ', /^>\s?/);


export const ANY_LIST_PREFIX = /^(?:[-*+]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/;


export const toggleBulletList = toggleLinePrefix(
    '- ',
    /^[-*+][ \t]+(?!\[[ xX]\][ \t]+)/,
    ANY_LIST_PREFIX,
);


export const toggleTaskList = toggleLinePrefix(
    '- [ ] ',
    /^(?:[-*+]|\d+[.)])[ \t]+\[[ xX]\][ \t]+/,
    ANY_LIST_PREFIX,
);


export const toggleOrderedList = toggleLinePrefix(
    (i) => `${i + 1}. `,
    /^\d+[.)][ \t]+(?!\[[ xX]\][ \t]+)/,
    ANY_LIST_PREFIX,
);



export function surroundingMarkers(
    state: EditorState,
    range: SelectionRange,
    open: string,
    close: string,
): { open: number; close: number } | null {
    if (open === '*' && close === '*') {
        const before = countRunBefore(state, range.from, '*');
        const after = countRunAfter(state, range.to, '*');
        return before % 2 === 1 && after % 2 === 1 ? { open: 1, close: 1 } : null;
    }
    return state.sliceDoc(Math.max(0, range.from - open.length), range.from) === open &&
        state.sliceDoc(range.to, Math.min(state.doc.length, range.to + close.length)) === close
        ? { open: open.length, close: close.length }
        : null;
}



export function containedMarkers(text: string, open: string, close: string): { open: number; close: number } | null {
    if (open === '*' && close === '*') {
        const before = countStringRun(text, 0, 1, '*');
        const after = countStringRun(text, text.length - 1, -1, '*');
        return before % 2 === 1 && after % 2 === 1 && text.length > 2
            ? { open: 1, close: 1 }
            : null;
    }
    return text.startsWith(open) && text.endsWith(close) && text.length > open.length + close.length
        ? { open: open.length, close: close.length }
        : null;
}



export function codeSpanMarkers(text: string): number {
    const before = countStringRun(text, 0, 1, '`');
    const after = countStringRun(text, text.length - 1, -1, '`');
    return before > 0 && before === after && text.length > before * 2 ? before : 0;
}



export function countRunBefore(state: EditorState, position: number, character: string): number {
    let count = 0;
    while (position - count - 1 >= 0 && state.sliceDoc(position - count - 1, position - count) === character)
        count++;
    return count;
}



export function countRunAfter(state: EditorState, position: number, character: string): number {
    let count = 0;
    while (position + count < state.doc.length && state.sliceDoc(position + count, position + count + 1) === character)
        count++;
    return count;
}



export function countStringRun(value: string, start: number, step: 1 | -1, character: string): number {
    let count = 0;
    for (let index = start; index >= 0 && index < value.length && value[index] === character; index += step)
        count++;
    return count;
}



export function longestCharacterRun(value: string, character: string): number {
    let longest = 0;
    let current = 0;
    for (const valueCharacter of value) {
        current = valueCharacter === character ? current + 1 : 0;
        longest = Math.max(longest, current);
    }
    return longest;
}

import { EditorSelection, type ChangeSpec, StateCommand } from '@codemirror/state';
import { t } from '../../lib/i18n';
import { selectedLineBounds } from './enter';


export function setHeading(level: number): StateCommand {
    return ({ state, dispatch }) => {
        const changes: ChangeSpec[] = [];
        const seen = new Set<number>();
        for (const range of state.selection.ranges) {
            const { startLine, endLine } = selectedLineBounds(state, range);
            for (let n = startLine; n <= endLine; n++) {
                if (seen.has(n))
                    continue;
                seen.add(n);
                const line = state.doc.line(n);
                const match = /^(#{1,6})\s+/.exec(line.text);
                const marker = '#'.repeat(level);
                if (match && match[1]!.length === level) {
                    changes.push({ from: line.from, to: line.from + match[0].length });
                }
                else if (match) {
                    changes.push({ from: line.from, to: line.from + match[0].length, insert: `${marker} ` });
                }
                else {
                    changes.push({ from: line.from, insert: `${marker} ` });
                }
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


export function insertLink(url = ''): StateCommand {
    return ({ state, dispatch }) => {
        const changes = state.changeByRange((range) => {
            const text = state.sliceDoc(range.from, range.to);
            const label = text.replace(/\\/g, '\\\\').replace(/[\[\]]/g, '\\$&');
            const destination = url
                ? `<${url.replace(/[\u0000-\u0020<>]/g, (value) => encodeURIComponent(value))}>`
                : '';
            const insert = `[${label}](${destination})`;
            const cursor = text
                ? range.from + insert.length - 1
                : range.from + 1;
            return {
                changes: { from: range.from, to: range.to, insert },
                range: EditorSelection.cursor(cursor),
            };
        });
        dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input.format' }));
        return true;
    };
}


export function insertImage(url = ''): StateCommand {
    return ({ state, dispatch }) => {
        const changes = state.changeByRange((range) => {
            const alt = state.sliceDoc(range.from, range.to).replace(/\\/g, '\\\\').replace(/[\[\]]/g, '\\$&');
            const destination = url
                ? `<${url.replace(/[\u0000-\u0020<>]/g, (value) => encodeURIComponent(value))}>`
                : '';
            const insert = `![${alt}](${destination})`;
            return {
                changes: { from: range.from, to: range.to, insert },
                range: EditorSelection.cursor(alt ? range.from + insert.length - 1 : range.from + 2),
            };
        });
        dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input.format' }));
        return true;
    };
}


export function insertText(text: string, cursorOffset?: number): StateCommand {
    return ({ state, dispatch }) => {
        const changes = state.changeByRange((range) => ({
            changes: { from: range.from, to: range.to, insert: text },
            range: EditorSelection.cursor(range.from + (cursorOffset ?? text.length)),
        }));
        dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input.insert' }));
        return true;
    };
}



export function insertPrefix(prefix: string): StateCommand {
    return ({ state, dispatch }) => {
        const changes = state.changeByRange((range) => ({
            changes: { from: range.from, insert: prefix },
            range: range.empty
                ? EditorSelection.cursor(range.from + prefix.length)
                : EditorSelection.range(range.from + prefix.length, range.to + prefix.length),
        }));
        dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input.insert' }));
        return true;
    };
}



export const insertTag = insertPrefix('#');



export const insertBlockId: StateCommand = ({ state, dispatch }) => {
    const range = state.selection.main;
    const position = range.to;
    const prefix = position > 0 && !/\s/.test(state.sliceDoc(position - 1, position)) ? ' ' : '';
    const insert = `${prefix}^`;
    dispatch(state.update({
        changes: { from: position, insert },
        selection: EditorSelection.cursor(position + insert.length),
        scrollIntoView: true,
        userEvent: 'input.insert',
    }));
    return true;
};



export const insertFootnote: StateCommand = ({ state, dispatch }) => {
    const source = state.doc.toString();
    let number = 1;
    while (source.includes(`[^${number}]`))
        number++;
    const reference = `[^${number}]`;
    const separator = source.length === 0 ? '\n\n' : source.endsWith('\n\n') ? '' : source.endsWith('\n') ? '\n' : '\n\n';
    const definition = `${separator}[^${number}]: `;
    const position = state.selection.main.to;
    const changes: ChangeSpec[] = [
        { from: position, insert: reference },
        { from: state.doc.length, insert: definition },
    ];
    const definitionStart = state.doc.length + definition.length + (position === state.doc.length ? reference.length : 0);
    dispatch(state.update({
        changes,
        selection: EditorSelection.cursor(definitionStart),
        scrollIntoView: true,
        userEvent: 'input.insert',
    }));
    return true;
};



export const insertTableOfContents: StateCommand = ({ state, dispatch }) => {
    const range = state.selection.main;
    const insert = '[TOC]\n\n';
    dispatch(state.update({
        changes: { from: range.from, to: range.to, insert },
        selection: EditorSelection.cursor(range.from + insert.length),
        scrollIntoView: true,
        userEvent: 'input.insert',
    }));
    return true;
};



export const insertRuby: StateCommand = ({ state, dispatch }) => {
    const range = state.selection.main;
    const selected = state.sliceDoc(range.from, range.to);
    const base = selected || t('workspace.ruby_base_placeholder');
    const ruby = t('workspace.ruby_text_placeholder');
    const insert = `{${base}|${ruby}}`;
    const rubyStart = range.from + 1 + base.length + 1;
    dispatch(state.update({
        changes: { from: range.from, to: range.to, insert },
        selection: EditorSelection.range(rubyStart, rubyStart + ruby.length),
        scrollIntoView: true,
        userEvent: 'input.insert',
    }));
    return true;
};



export const insertDefinitionList: StateCommand = ({ state, dispatch }) => {
    const range = state.selection.main;
    const selected = state.sliceDoc(range.from, range.to);
    const term = selected || t('workspace.deflist_term_placeholder');
    const def = t('workspace.deflist_desc_placeholder');
    const insert = `${term}\n: ${def}\n\n`;
    const defStart = range.from + term.length + 3;
    dispatch(state.update({
        changes: { from: range.from, to: range.to, insert },
        selection: EditorSelection.range(defStart, defStart + def.length),
        scrollIntoView: true,
        userEvent: 'input.insert',
    }));
    return true;
};



export const insertAbbreviation: StateCommand = ({ state, dispatch }) => {
    const range = state.selection.main;
    const selected = state.sliceDoc(range.from, range.to);
    const abbr = selected || 'HTML';
    const def = t('workspace.abbr_desc_placeholder');
    const insert = `*[${abbr}]: ${def}\n`;
    const defStart = range.from + 4 + abbr.length;
    dispatch(state.update({
        changes: { from: range.from, to: range.to, insert },
        selection: EditorSelection.range(defStart, defStart + def.length),
        scrollIntoView: true,
        userEvent: 'input.insert',
    }));
    return true;
};



export const insertEmoji = (emoji: string): StateCommand => ({ state, dispatch }) => {
    const range = state.selection.main;
    dispatch(state.update({
        changes: { from: range.from, to: range.to, insert: emoji },
        selection: EditorSelection.cursor(range.from + emoji.length),
        scrollIntoView: true,
        userEvent: 'input.insert',
    }));
    return true;
};



export const insertTaskWithStatus = (marker: string): StateCommand => ({ state, dispatch }) => {
    const range = state.selection.main;
    const insert = `- [${marker}] `;
    dispatch(state.update({
        changes: { from: range.from, to: range.to, insert },
        selection: EditorSelection.cursor(range.from + insert.length),
        scrollIntoView: true,
        userEvent: 'input.insert',
    }));
    return true;
};



export const COMMON_EMOJIS = [
    { emoji: '😀', code: ':smile:' },
    { emoji: '🎉', code: ':tada:' },
    { emoji: '🔥', code: ':fire:' },
    { emoji: '🚀', code: ':rocket:' },
    { emoji: '✨', code: ':sparkles:' },
    { emoji: '⭐', code: ':star:' },
    { emoji: '💡', code: ':bulb:' },
    { emoji: '📌', code: ':pushpin:' },
    { emoji: '✅', code: ':white_check_mark:' },
    { emoji: '⚠️', code: ':warning:' },
    { emoji: '❤️', code: ':heart:' },
    { emoji: '👍', code: ':+1:' },
] as const;

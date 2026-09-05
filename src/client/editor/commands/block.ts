import { EditorSelection, type StateCommand } from '@codemirror/state';
import { renderNewNoteTemplate } from '@shared/markdown-utils';
import { t } from '../../lib/i18n';
import { useNotes } from '../../store/notes';
import { useSession } from '../../store/session';
import { useUi } from '../../store/ui';
import { longestCharacterRun } from './wrap';



export const insertCallout: StateCommand = ({ state, dispatch }) => {
    const range = state.selection.main;
    const selected = state.sliceDoc(range.from, range.to);
    const body = selected ? selected.split('\n').map((line) => `> ${line}`).join('\n') : '> ';
    const insert = `> [!NOTE]\n${body}`;
    dispatch(state.update({
        changes: { from: range.from, to: range.to, insert },
        selection: EditorSelection.cursor(range.from + insert.length),
        scrollIntoView: true,
        userEvent: 'input.insert',
    }));
    return true;
};



export const insertDetails: StateCommand = (target) => insertWrappedBlock(
    '::: details []',
    ':::',
    '',
    '::: details ['.length,
)(target);



export const insertTabs: StateCommand = ({ state, dispatch }) => {
    const range = state.selection.main;
    const selected = state.sliceDoc(range.from, range.to);
    const firstContent = selected ? `\n${selected}` : '';
    const insert = `:::: tabs\n::: tab-item ${t("editor.tab_1")}${firstContent}\n\n:::\n::: tab-item ${t("editor.tab_2")}\n\n:::\n::::\n`;
    const cursor = selected
        ? range.from + insert.indexOf(selected) + selected.length
        : range.from + insert.indexOf(t("editor.tab_1"));
    dispatch(state.update({
        changes: { from: range.from, to: range.to, insert },
        selection: selected
            ? EditorSelection.cursor(cursor)
            : EditorSelection.range(cursor, cursor + t("editor.tab_1").length),
        scrollIntoView: true,
        userEvent: 'input.insert',
    }));
    return true;
};



export const insertNoteTemplate: StateCommand = ({ state, dispatch }) => {
    const settings = useSession.getState().settings.notes;
    const template = settings?.newNoteTemplate ?? '';
    const noteStore = useNotes.getState();
    const noteId = useUi.getState().activeNoteId;
    const summary = noteId ? noteStore.notes[noteId] : null;
    if (!template.trim())
        return false;
    const extra: Record<string, string> = {};
    const folder = summary?.folderId ? noteStore.folders.find((item) => item.id === summary.folderId) : null;
    if (folder?.name)
        extra.folder = folder.name;
    if (summary?.tags.length)
        extra.tags = summary.tags.join(', ');
    const rendered = renderNewNoteTemplate(
        settings.newNoteTemplate,
        summary?.title || t("common.new_note"),
        new Date(),
        extra,
    );
    const range = state.selection.main;
    dispatch(state.update({
        changes: { from: range.from, to: range.to, insert: rendered.content },
        selection: EditorSelection.cursor(range.from + (rendered.cursor ?? rendered.content.length)),
        scrollIntoView: true,
        userEvent: 'input.insert',
    }));
    return true;
};



export const insertFrontMatter: StateCommand = ({ state, dispatch }) => {
    const source = state.doc.toString();
    if (/^---[ \t]*\r?\n/.test(source)) {
        const firstLineEnd = source.indexOf('\n') + 1;
        dispatch(state.update({
            selection: EditorSelection.cursor(firstLineEnd),
            scrollIntoView: true,
        }));
        return true;
    }
    const insert = '---\ntitle: \ntags: []\n---\n\n';
    dispatch(state.update({
        changes: { from: 0, insert },
        selection: EditorSelection.cursor('---\ntitle: '.length),
        scrollIntoView: true,
        userEvent: 'input.insert',
    }));
    return true;
};


export const insertTable: StateCommand = (target) => {
    const template = [t("editor.column_1_column_2_column_3"), '| --- | --- | --- |', '|  |  |  |', ''].join('\n');
    return insertPrefixedBlock(template, 2)(target);
};


export const insertCodeBlock: StateCommand = ({ state, dispatch }) => {
    const changes = state.changeByRange((range) => {
        const selected = state.sliceDoc(range.from, range.to);
        const fence = '`'.repeat(Math.max(3, longestCharacterRun(selected, '`') + 1));
        const insert = `${fence}\n${selected}\n${fence}\n`;
        return {
            changes: { from: range.from, to: range.to, insert },
            range: EditorSelection.cursor(range.from + fence.length),
        };
    });
    dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input.insert' }));
    return true;
};


export const insertAdvancedCodeBlock: StateCommand = ({ state, dispatch }) => {
    const changes = state.changeByRange((range) => {
        const selected = state.sliceDoc(range.from, range.to);
        const fence = '`'.repeat(Math.max(3, longestCharacterRun(selected, '`') + 1));
        const info = 'text title="" line-numbers {1}';
        const insert = `${fence}${info}\n${selected}\n${fence}\n`;
        return {
            changes: { from: range.from, to: range.to, insert },
            range: selected
                ? EditorSelection.range(range.from + fence.length + info.length + 1, range.from + fence.length + info.length + 1 + selected.length)
                : EditorSelection.cursor(range.from + fence.length),
        };
    });
    dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input.insert' }));
    return true;
};


export const insertRunnableJsBlock: StateCommand = ({ state, dispatch }) => {
    const changes = state.changeByRange((range) => {
        const selected = state.sliceDoc(range.from, range.to);
        const fence = '~'.repeat(Math.max(4, longestCharacterRun(selected, '~') + 1));
        const defaultCode = 'console.log("Hello, Inkstone!");';
        const code = selected || defaultCode;
        const info = `javascript-example title="${t("workspace.runnable_javascript_code")}"`;
        const insert = `${fence}${info}\n${code}\n${fence}\n`;
        return {
            changes: { from: range.from, to: range.to, insert },
            range: selected
                ? EditorSelection.range(range.from + fence.length + info.length + 1, range.from + fence.length + info.length + 1 + selected.length)
                : EditorSelection.range(range.from + fence.length + info.length + 1, range.from + fence.length + info.length + 1 + defaultCode.length),
        };
    });
    dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input.insert' }));
    return true;
};


export const insertHorizontalRule: StateCommand = (target) => insertPrefixedBlock('---\n\n', 5)(target);



export function insertWrappedBlock(open: string, close: string, fallback: string, emptyCursorOffset?: number): StateCommand {
    return ({ state, dispatch }) => {
        const range = state.selection.main;
        const selected = state.sliceDoc(range.from, range.to);
        const content = selected || fallback;
        const insert = `${open}\n${content}\n${close}\n`;
        const cursor = selected
            ? range.from + open.length + 1 + selected.length
            : range.from + (emptyCursorOffset ?? open.length + 1);
        dispatch(state.update({
            changes: { from: range.from, to: range.to, insert },
            selection: EditorSelection.cursor(cursor),
            scrollIntoView: true,
            userEvent: 'input.insert',
        }));
        return true;
    };
}


export function insertPrefixedBlock(text: string, cursorOffset: number): StateCommand {
    return ({ state, dispatch }) => {
        const range = state.selection.main;
        const line = state.doc.lineAt(range.head);
        const needsBreak = line.text.trim().length > 0;
        const insert = (needsBreak ? '\n' : '') + text;
        dispatch(state.update({
            changes: { from: line.to, insert },
            selection: EditorSelection.cursor(line.to + (needsBreak ? 1 : 0) + cursorOffset),
            scrollIntoView: true,
            userEvent: 'input.insert',
        }));
        return true;
    };
}

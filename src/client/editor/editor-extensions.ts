import { Annotation, Compartment, EditorState, type Extension } from '@codemirror/state';
import { EditorView, drawSelection, dropCursor, keymap, lineNumbers, placeholder as placeholderExt, rectangularSelection, } from '@codemirror/view';
import { foldGutter, indentOnInput, indentUnit, } from '@codemirror/language';
import { defaultKeymap, history, historyKeymap, indentWithTab, standardKeymap, } from '@codemirror/commands';
import { search, searchKeymap } from '@codemirror/search';
import { acceptCompletion, autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, } from '@codemirror/autocomplete';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import type { EditorSettings } from '@shared/types';
import { editorTheme } from './theme';
import { focusModePlugin, markdownDecorations, typewriterPlugin } from './decorations';
import { codeFenceSource, tagSource, wikiLinkSource, type CompletionSources } from './completion';
import { pasteExtension, type PasteHandlers } from './paste';
import { linkHoverExtension, linkHoverFacet } from './link-hover-plugin';
import { completeCodeFenceOnEnter, setHeading, smartEnter, tableTab, toggleBold, toggleBulletList, toggleHighlight, toggleInlineCode, toggleItalic, toggleOrderedList, toggleQuote, toggleStrikethrough, toggleTaskDone, toggleTaskList, } from './commands';

export const externalValueUpdate = Annotation.define<boolean>();

export interface CodeEditorCallbacks {
    sources: CompletionSources;
    handlers: PasteHandlers;
    onChange: (value: string) => void;
    onScroll?: (view: EditorView) => void;
    onCursorLine?: (line: number) => void;
    onContextMenu?: (event: MouseEvent, view: EditorView) => void;
}

export interface EditorLiveRefs {
    cb: { current: CodeEditorCallbacks };
    propose: { current: (link: HTMLElement | null, options?: { immediate?: boolean }) => void };
    linkHover: { current: { card: unknown | null; hideNow: () => void } };
}

export interface EditorCompartments {
    lineNumbers: Compartment;
    tabSize: Compartment;
    placeholder: Compartment;
}

export interface EditorExtensionInput {
    settings: EditorSettings;
    placeholder: string;
    live: EditorLiveRefs;
    compartments: EditorCompartments;
}

export function editorExtensions(input: EditorExtensionInput): Extension[] {
    return [
        ...baseExtensions(),
        input.compartments.tabSize.of(indentUnit.of(' '.repeat(input.settings.tabSize))),
        ...lineNumberExtension(input),
        ...placeholderExtensions(input),
        search({ top: true }),
        ...autocompleteExtensions(input),
        markdown({ base: markdownLanguage, addKeymap: false }),
        editorTheme(),
        markdownDecorations,
        focusModePlugin,
        typewriterPlugin,
        pasteExtension(input.live.cb.current.handlers),
        ...commandKeymaps(),
        ...frameworkKeymaps(),
        ...listenerExtensions(input.live),
    ];
}

function baseExtensions(): Extension[] {
    return [
        history(),
        drawSelection(),
        dropCursor(),
        rectangularSelection(),
        closeBrackets(),
        indentOnInput(),
        EditorState.allowMultipleSelections.of(true),
        EditorView.lineWrapping,
    ];
}

function lineNumberExtension(input: EditorExtensionInput): Extension[] {
    return [input.compartments.lineNumbers.of(input.settings.lineNumbers ? [lineNumbers(), foldGutter()] : [])];
}

function placeholderExtensions(input: EditorExtensionInput): Extension[] {
    return [input.compartments.placeholder.of([
        placeholderExt(input.placeholder),
        EditorView.contentAttributes.of({ 'aria-label': input.placeholder }),
    ])];
}

function autocompleteExtensions(input: EditorExtensionInput): Extension[] {
    return [autocompletion({
        override: [
            wikiLinkSource(() => input.live.cb.current.sources),
            tagSource(() => input.live.cb.current.sources),
            codeFenceSource,
        ],
        activateOnTyping: true,
        closeOnBlur: true,
        maxRenderedOptions: 24,
        icons: false,
    })];
}

function commandKeymaps(): Extension[] {
    return [keymap.of([
        { key: 'Enter', run: (view) => completeCodeFenceOnEnter(view) || smartEnter(view) },
        { key: 'Tab', run: (view) => acceptCompletion(view) || tableTab(view) },
        { key: 'Mod-b', run: toggleBold, preventDefault: true },
        { key: 'Mod-i', run: toggleItalic, preventDefault: true },
        { key: 'Mod-e', run: toggleInlineCode, preventDefault: true },
        { key: 'Mod-Shift-x', run: toggleStrikethrough },
        { key: 'Mod-Shift-h', run: toggleHighlight },
        { key: 'Mod-Shift-.', run: toggleQuote },
        { key: 'Mod-Shift-8', run: toggleBulletList },
        { key: 'Mod-Shift-7', run: toggleOrderedList },
        { key: 'Mod-Shift-9', run: toggleTaskList },
        { key: 'Mod-Shift-Enter', run: toggleTaskDone },
        { key: 'Mod-1', run: setHeading(1) },
        { key: 'Mod-2', run: setHeading(2) },
        { key: 'Mod-3', run: setHeading(3) },
        { key: 'Mod-4', run: setHeading(4) },
        { key: 'Mod-5', run: setHeading(5) },
        { key: 'Mod-6', run: setHeading(6) },
    ])];
}

function frameworkKeymaps(): Extension[] {
    return [
        keymap.of([...closeBracketsKeymap, ...completionKeymap, ...searchKeymap, ...historyKeymap]),
        keymap.of(standardKeymap),
        keymap.of(defaultKeymap),
        keymap.of([indentWithTab]),
    ];
}

function listenerExtensions(live: EditorLiveRefs): Extension[] {
    return [
        EditorView.updateListener.of((update) => {
            const external = update.transactions.some((transaction) => transaction.annotation(externalValueUpdate));
            if (update.docChanged && !external) {
                live.cb.current.onChange(update.state.doc.toString());
            }
            if (update.selectionSet && live.cb.current.onCursorLine) {
                const line = update.state.doc.lineAt(update.state.selection.main.head).number;
                live.cb.current.onCursorLine(line);
            }
        }),
        EditorView.domEventHandlers({
            scroll(_event, view) {
                live.cb.current.onScroll?.(view);
            },
            contextmenu(event, view) {
                if (live.cb.current.onContextMenu) {
                    live.cb.current.onContextMenu(event, view);
                    return true;
                }
                return false;
            },
        }),
        linkHoverExtension(),
        linkHoverFacet.of({
            propose: (link, options) => live.propose.current(link, options),
            hide: () => {
                if (!live.linkHover.current.card) return false;
                live.linkHover.current.hideNow();
                return true;
            },
        }),
    ];
}

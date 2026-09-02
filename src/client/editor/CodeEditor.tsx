import { useCallback, useEffect, useRef, useState } from 'react';
import { Annotation, Compartment, EditorSelection, EditorState, type Extension } from '@codemirror/state';
import { EditorView, drawSelection, dropCursor, keymap, lineNumbers, placeholder as placeholderExt, rectangularSelection, } from '@codemirror/view';
import { foldGutter, indentOnInput, indentUnit, } from '@codemirror/language';
import { defaultKeymap, history, historyKeymap, indentWithTab, standardKeymap, } from '@codemirror/commands';
import { search, searchKeymap } from '@codemirror/search';
import { acceptCompletion, autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, } from '@codemirror/autocomplete';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import type { EditorSettings } from '@shared/types';
import { cn } from '../lib/cn';
import { editorTheme } from './theme';
import { focusModePlugin, markdownDecorations, setFocusMode, typewriterPlugin } from './decorations';
import { codeFenceSource, tagSource, wikiLinkSource, type CompletionSources } from './completion';
import { pasteExtension, type PasteHandlers } from './paste';
import { decodeDataValue } from '../lib/markdown/data-attr';
import { parseWikiTarget } from '../lib/markdown/renderer';
import { findNoteByTitle } from '../store/notes/selectors';
import { takePendingEditorCursor } from '../store/notes/new-note';
import { useNotes } from '../store/notes';
import { useSession } from '../store/session';
import { WikiLinkHoverCard, type WikiLinkHoverCardState } from '../features/preview/WikiLinkHoverCard';
import { useLinkHover } from '../features/preview/link-hover';
import { linkHoverExtension, linkHoverFacet } from './link-hover-plugin';
import { usePinnedWindows } from '../store/pinned-windows';
import { completeCodeFenceOnEnter, setHeading, smartEnter, tableTab, toggleBold, toggleBulletList, toggleHighlight, toggleInlineCode, toggleItalic, toggleOrderedList, toggleQuote, toggleStrikethrough, toggleTaskDone, toggleTaskList, } from './commands';
import { t } from "../lib/i18n";

const externalValueUpdate = Annotation.define<boolean>();
export interface CodeEditorProps {
    value: string;
    onChange: (value: string) => void;
    settings: EditorSettings;
    sources: CompletionSources;
    handlers: PasteHandlers;
    noteId?: string | null;
    onReady?: (view: EditorView | null) => void;
    onScroll?: (view: EditorView) => void;
    onCursorLine?: (line: number) => void;
    placeholder?: string;
    className?: string;
}
export function CodeEditor({ value, onChange, settings, sources, handlers, noteId = null, onReady, onScroll, onCursorLine, placeholder = t("editor.start_writing"), className, }: CodeEditorProps) {
    const hostRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const previewSettings = useSession((s) => s.settings.preview);
    const [dark, setDark] = useState(() => (document.documentElement.dataset.theme ?? 'dark') === 'dark');
    const proposeRef = useRef<(link: HTMLElement | null, options?: { immediate?: boolean }) => void>(() => {});

    const resolveEditorCandidate = useCallback((link: HTMLElement): WikiLinkHoverCardState | null => {
        const parsed = parseWikiTarget(decodeDataValue(link.dataset.wikilink));
        const notes = useNotes.getState().notes;
        if (parsed.noteTitle) {
            const note = findNoteByTitle(parsed.noteTitle);
            if (note) {
                return { anchor: link, title: parsed.alias ?? note.title, noteId: note.id, missing: false, headline: parsed.heading ?? note.title };
            }
            return { anchor: link, title: parsed.alias ?? parsed.noteTitle, noteId: null, missing: true, headline: parsed.heading ?? parsed.noteTitle };
        }
        const currentId = noteId;
        const summary = currentId ? notes[currentId] : undefined;
        if (!summary) return null;
        return { anchor: link, title: parsed.alias ?? summary.title, noteId: currentId, missing: false, headline: parsed.heading ?? summary.title };
    }, [noteId]);

    const linkHover = useLinkHover({
        resolve: resolveEditorCandidate,
        delay: previewSettings.linkHoverDelayMs,
        enabled: previewSettings.linkHover,
        armOnNonLink: true,
    });
    proposeRef.current = linkHover.propose;
    const linkHoverRef = useRef(linkHover);
    linkHoverRef.current = linkHover;

    const handlePin = useCallback((card: WikiLinkHoverCardState, rect: DOMRect) => {
        usePinnedWindows.getState().pin(card, rect);
        linkHover.hideNow();
    }, [linkHover.hideNow]);

    const cbRef = useRef({ onChange, onScroll, onCursorLine, sources, handlers });
    cbRef.current = { onChange, onScroll, onCursorLine, sources, handlers };

    const lineNumbersCompartment = useRef(new Compartment());
    const tabSizeCompartment = useRef(new Compartment());
    const placeholderCompartment = useRef(new Compartment());

    useEffect(() => {
        const host = hostRef.current;
        if (!host)
            return;
        const extensions: Extension[] = [
            history(),
            drawSelection(),
            dropCursor(),
            rectangularSelection(),
            closeBrackets(),
            indentOnInput(),
            tabSizeCompartment.current.of(indentUnit.of(' '.repeat(settings.tabSize))),
            EditorState.allowMultipleSelections.of(true),
            EditorView.lineWrapping,
            placeholderCompartment.current.of([
                placeholderExt(placeholder),
                EditorView.contentAttributes.of({ 'aria-label': placeholder }),
            ]),
            search({ top: true }),
            autocompletion({
                override: [

                    wikiLinkSource(() => cbRef.current.sources),
                    tagSource(() => cbRef.current.sources),
                    codeFenceSource,
                ],
                activateOnTyping: true,
                closeOnBlur: true,
                maxRenderedOptions: 24,
                icons: false,
            }),
            markdown({
                base: markdownLanguage,
                addKeymap: false,
            }),
            editorTheme(),
            markdownDecorations,
            focusModePlugin,
            typewriterPlugin,
            pasteExtension(cbRef.current.handlers),
            keymap.of([
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
            ]),
            keymap.of([...closeBracketsKeymap, ...completionKeymap, ...searchKeymap, ...historyKeymap]),
            keymap.of(standardKeymap),
            keymap.of(defaultKeymap),
            keymap.of([indentWithTab]),
            lineNumbersCompartment.current.of(
                settings.lineNumbers
                    ? [lineNumbers(), foldGutter()]
                    : [],
            ),
            EditorView.updateListener.of((update) => {
                const external = update.transactions.some((transaction) => transaction.annotation(externalValueUpdate));
                if (update.docChanged && !external) {
                    cbRef.current.onChange(update.state.doc.toString());
                }
                if (update.selectionSet && cbRef.current.onCursorLine) {
                    const line = update.state.doc.lineAt(update.state.selection.main.head).number;
                    cbRef.current.onCursorLine(line);
                }
            }),
            EditorView.domEventHandlers({
                scroll(_event, view) {
                    cbRef.current.onScroll?.(view);
                },
            }),
            linkHoverExtension(),
            linkHoverFacet.of({
                propose: (link, options) => proposeRef.current(link, options),
                hide: () => {
                    if (!linkHoverRef.current.card) return false;
                    linkHoverRef.current.hideNow();
                    return true;
                },
            }),
        ];
        const view = new EditorView({
            state: EditorState.create({ doc: value, extensions }),
            parent: host,
        });
        view.contentDOM.spellcheck = settings.spellcheck;
        viewRef.current = view;
        const pendingCursor = noteId ? takePendingEditorCursor(noteId) : null;
        if (pendingCursor !== null) {
            view.dispatch({
                selection: EditorSelection.cursor(Math.min(pendingCursor, view.state.doc.length)),
                scrollIntoView: true,
            });
        }
        onReady?.(view);
        return () => {
            onReady?.(null);
            view.destroy();
            viewRef.current = null;
        };
    }, []);

    useEffect(() => {
        const view = viewRef.current;
        if (!view) return;
        view.dispatch({
            effects: lineNumbersCompartment.current.reconfigure(
                settings.lineNumbers
                    ? [lineNumbers(), foldGutter()]
                    : [],
            ),
        });
    }, [settings.lineNumbers]);

    useEffect(() => {
        const view = viewRef.current;
        if (!view) return;
        view.dispatch({
            effects: tabSizeCompartment.current.reconfigure(
                indentUnit.of(' '.repeat(settings.tabSize)),
            ),
        });
    }, [settings.tabSize]);

    useEffect(() => {
        const view = viewRef.current;
        if (!view) return;
        view.dispatch({
            effects: placeholderCompartment.current.reconfigure([
                placeholderExt(placeholder),
                EditorView.contentAttributes.of({ 'aria-label': placeholder }),
            ]),
        });
    }, [placeholder]);

    useEffect(() => {
        const view = viewRef.current;
        if (!view)
            return;
        const current = view.state.doc.toString();
        if (current === value)
            return;
        view.dispatch({
            changes: { from: 0, to: current.length, insert: value },
            selection: { anchor: Math.min(view.state.selection.main.anchor, value.length) },
            annotations: externalValueUpdate.of(true),
        });
    }, [value]);

    useEffect(() => {
        const content = viewRef.current?.contentDOM;
        if (content)
            content.spellcheck = settings.spellcheck;
    }, [settings.spellcheck]);

    useEffect(() => {
        viewRef.current?.dispatch({ effects: setFocusMode.of(settings.focusMode) });
    }, [settings.focusMode]);

    useEffect(() => {
        const observer = new MutationObserver(() => {
            setDark((document.documentElement.dataset.theme ?? 'dark') === 'dark');
        });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const onScroll = (event: Event) => {
            const target = event.target as Element | null;
            if (target && typeof target.closest === 'function' && target.closest('[role="tooltip"]'))
                return;
            linkHover.hideNow();
        };
        window.addEventListener('scroll', onScroll, true);
        return () => window.removeEventListener('scroll', onScroll, true);
    }, [linkHover.hideNow]);

    return (<div ref={hostRef} className={cn('ink-editor', className)} data-family={settings.fontFamily} data-focus-mode={settings.focusMode} data-typewriter={settings.typewriter}>
      {linkHover.card && (
        <WikiLinkHoverCard
          card={linkHover.card}
          path={linkHover.card.noteId ? [linkHover.card.noteId] : []}
          depth={1}
          dark={dark}
          onClose={linkHover.hideNow}
          onEnter={linkHover.clearPendingHide}
          onLeave={linkHover.armHide}
          onPin={handlePin}
        />
      )}
    </div>);
}

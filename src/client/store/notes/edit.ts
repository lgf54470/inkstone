import type { NotesState, SetNotesState } from './model';
import { setFrontMatterProperty } from '@shared/markdown-utils';
import { LIMITS } from '@shared/constants';
import { localDb } from '../../lib/db';
import { frontMatterTitleOf } from './new-note';
import { pendingNoteCount, replayOutbox } from './outbox';
import { stageNoteTextWrite } from './persist';
import { commitAllPendingSummaryDerivations } from './summary';
import { hasOwnContent } from './util';
import { dirty, notePersistCoalescer, noteState } from './model';
import { useSession } from '../session';

export const edit = (set: SetNotesState, get: () => NotesState): Pick<NotesState, 'editTitle' | 'editContent' | 'flush'> => ({

    editTitle(id, title) {
        const state = get();
        const summary = state.notes[id];
        const content = state.contents[id];
        if (!summary || content === undefined)
            return;
        const nextTitle = title.slice(0, LIMITS.titleMaxLength);
        if (summary.title === nextTitle)
            return;
        // Keep the front matter `title` property in sync with the note title
        // whenever the note already declares one (opt-out per settings).
        const syncedContent = useSession.getState().settings.notes?.syncTitleToFrontMatter
            ? setFrontMatterProperty(content, 'title', nextTitle || null)
            : null;
        stageNoteTextWrite(id, syncedContent ?? content, nextTitle, set, get);
    },

    editContent(id, content) {
        const state = get();
        const summary = state.notes[id];
        if (!summary || !hasOwnContent(state.contents, id) || state.contents[id] === content)
            return;
        // Reverse sync: when the body's front matter `title` property changes,
        // adopt it as the note title so both stay in agreement (opt-out per
        // settings).
        let nextTitle = dirty.get(id)?.title;
        if (useSession.getState().settings.notes?.syncFrontMatterTitle) {
            const nextFrontMatterTitle = frontMatterTitleOf(content);
            const previousFrontMatterTitle = frontMatterTitleOf(state.contents[id]);
            if (nextFrontMatterTitle !== undefined && nextFrontMatterTitle !== previousFrontMatterTitle)
                nextTitle = nextFrontMatterTitle.slice(0, LIMITS.titleMaxLength);
        }
        stageNoteTextWrite(id, content, nextTitle, set, get);
    },

    async flush(options) {
        await notePersistCoalescer.flush();
        commitAllPendingSummaryDerivations();
        if (options?.immediate)
            window.clearTimeout(noteState.saveTimer);
        if (dirty.size)
            set((state) => ({ saveStatus: state.online ? 'saving' : 'offline' }));
        await replayOutbox(get, set);
        commitAllPendingSummaryDerivations();
        const remaining = await localDb.getOutbox();
        const pendingCount = pendingNoteCount(remaining);
        set((state) => ({
            saveStatus: pendingCount ? (state.online ? 'dirty' : 'offline') : 'synced',
            pendingCount,
        }));
    }
});

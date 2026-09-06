import { tryParseStringArray } from '../../../lib/json';

export const NOTE_DRAG_TYPE = 'application/x-inkstone-note';
export const NOTES_DRAG_TYPE = 'application/x-inkstone-notes';
export const FOLDER_DRAG_TYPE = 'application/x-inkstone-folder';

export function leftDropTarget(event: React.DragEvent<HTMLElement>): boolean {
    const next = event.relatedTarget;
    return !(next instanceof Node) || !event.currentTarget.contains(next);
}

export function isNoteDragEvent(event: React.DragEvent): boolean {
    return event.dataTransfer.types.includes(NOTE_DRAG_TYPE)
        || event.dataTransfer.types.includes(NOTES_DRAG_TYPE);
}

/** Reads the dropped note ids from a DataTransfer, accepting both the
 * multi-select payload and its single-note fallback. */
export function readDraggedNoteIds(event: React.DragEvent): string[] {
    let ids: string[] = [];
    const multi = event.dataTransfer.getData(NOTES_DRAG_TYPE);
    if (multi)
        ids = tryParseStringArray(multi);
    if (ids.length === 0) {
        const single = event.dataTransfer.getData(NOTE_DRAG_TYPE);
        if (single)
            ids = [single];
    }
    return ids;
}

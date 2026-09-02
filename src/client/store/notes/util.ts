/** ID generation, outbox key helpers, and tiny shared predicates for the notes store. */
import { CLIENT_ID } from '../../lib/api';
import type { OutboxItem } from '../../lib/db';

export function equalStringArrays(a: readonly string[], b: readonly string[]): boolean {
    return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function hasOwnContent(contents: Record<string, string>, id: string): boolean {
    return Object.prototype.hasOwnProperty.call(contents, id);
}

export function outboxId(noteId: string): string {
    return `patch:${CLIENT_ID}:${noteId}`;
}
export function newLocalWriteId(): string {
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
export const NOTE_ID_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';
export function newLocalEntityId(): string {
    let timestamp = '';
    let value = Date.now();
    for (let index = 0; index < 10; index++) {
        timestamp = NOTE_ID_ALPHABET[value % 32] + timestamp;
        value = Math.floor(value / 32);
    }
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    let random = '';
    for (const byte of bytes)
        random += NOTE_ID_ALPHABET[byte & 31];
    return timestamp + random;
}
export function newRecoveryNoteId(): string {
    return newLocalEntityId();
}
export function outboxAttemptKey(item: OutboxItem): string {
    return `${item.id}\u0000${item.writeId}`;
}
export function replayAttemptKey(item: OutboxItem): string {
    return `${outboxAttemptKey(item)}\u0000${String(item.payload.rev)}`;
}

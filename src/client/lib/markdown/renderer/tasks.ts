import MarkdownIt from 'markdown-it';
import type StateCore from 'markdown-it/lib/rules_core/state_core.mjs';
import type Token from 'markdown-it/lib/token.mjs';
import { setTokenAttribute, appendTokenClass } from './obsidian';
import { renderEnv } from './env';
export function registerTasks(md: MarkdownIt): void {

    md.core.ruler.after('github-task-lists', 'trusted_task_placeholders', (state) => {
        const env = renderEnv(state.env);
        for (let index = 2; index < state.tokens.length; index++) {
            const inline = state.tokens[index]!;
            const paragraph = state.tokens[index - 1]!;
            const item = state.tokens[index - 2]!;
            if (inline.type !== 'inline' ||
                paragraph.type !== 'paragraph_open' ||
                item.type !== 'list_item_open' ||
                !inline.children?.length) {
                continue;
            }
            const sourceLine = item.map?.[0];
            if (sourceLine == null)
                continue;
            const status = resolveTaskStatus(state, inline, item, index, sourceLine, env);
            if (!status)
                continue;
            setTokenAttribute(item, 'data-task-line', String(sourceLine));
            setTokenAttribute(item, 'data-task-status', status);
            appendTokenClass(item, `task-status-${status}`);
            if (status === 'done')
                appendTokenClass(item, 'done');
            else if (status === 'cancelled')
                appendTokenClass(item, 'cancelled');
        }
        return true;
    });
}

function resolveTaskStatus(
    state: StateCore,
    inline: Token,
    item: Token,
    index: number,
    sourceLine: number,
    env: { taskNonce: string },
): string | null {
    if (!inline.children)
        return null;
    const checkboxIndex = inline.children.findIndex((child) => child.type === 'html_inline' && /task-list-item-checkbox/.test(child.content));
    if (checkboxIndex < 0)
        return resolveExtensionStatus(state, inline, item, index, sourceLine, env);
    const checkbox = inline.children[checkboxIndex]!;
    const isChecked = /\schecked(?:=|\s|>)/.test(checkbox.content);
    const status = isChecked ? 'done' : 'todo';
    checkbox.content = `<span class="task-checkbox-placeholder" data-task-placeholder="${env.taskNonce}" data-task-line="${sourceLine}" data-task-status="${status}" data-task-checked="${isChecked ? '1' : '0'}"></span>`;
    const labelOpen = new state.Token('html_inline', '', 0);
    labelOpen.content = '<span class="task-label">';
    const labelClose = new state.Token('html_inline', '', 0);
    labelClose.content = '</span>';
    inline.children.splice(checkboxIndex + 1, 0, labelOpen);
    inline.children.push(labelClose);
    return status;
}

function resolveExtensionStatus(
    state: StateCore,
    inline: Token,
    item: Token,
    index: number,
    sourceLine: number,
    env: { taskNonce: string },
): string | null {
    if (!inline.children)
        return null;
    const firstChild = inline.children[0];
    if (firstChild?.type !== 'text')
        return null;
    const extMatch = /^\[([/\-?!])\][ \t]*/.exec(firstChild.content);
    if (!extMatch)
        return null;
    const ch = extMatch[1]!;
    const status = ch === '/' ? 'in-progress' :
        ch === '-' ? 'cancelled' :
            ch === '?' ? 'question' :
                ch === '!' ? 'important' : 'todo';
    firstChild.content = firstChild.content.slice(extMatch[0].length);
    appendTokenClass(item, 'task-list-item');
    const listOpen = state.tokens.slice(0, index - 2).reverse().find((t) => t.type === 'bullet_list_open' || t.type === 'ordered_list_open');
    if (listOpen)
        appendTokenClass(listOpen, 'contains-task-list');
    const placeholder = new state.Token('html_inline', '', 0);
    placeholder.content = `<span class="task-checkbox-placeholder" data-task-placeholder="${env.taskNonce}" data-task-line="${sourceLine}" data-task-status="${status}" data-task-checked="0"></span>`;
    const labelOpen = new state.Token('html_inline', '', 0);
    labelOpen.content = '<span class="task-label">';
    const labelClose = new state.Token('html_inline', '', 0);
    labelClose.content = '</span>';
    inline.children.unshift(placeholder);
    inline.children.splice(1, 0, labelOpen);
    inline.children.push(labelClose);
    return status;
}
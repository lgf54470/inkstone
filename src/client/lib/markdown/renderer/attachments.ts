import MarkdownIt from 'markdown-it';
import type StateCore from 'markdown-it/lib/rules_core/state_core.mjs';
import type Token from 'markdown-it/lib/token.mjs';
import { escapeHtml } from '@shared/escape';
import { t } from '../../i18n';
import { escapeAttr } from './util';

type FileLink = {
    url: string;
    filename: string;
};

function blockNoteEmbedsRule(state: StateCore): boolean {
    for (let index = 1; index < state.tokens.length - 1; index++) {
        const inline = state.tokens[index]!;
        const open = state.tokens[index - 1]!;
        const close = state.tokens[index + 1]!;
        if (inline.type !== 'inline' || open.type !== 'paragraph_open' || close.type !== 'paragraph_close' ||
            !inline.children?.some((child) => child.type === 'note_embed')) {
            continue;
        }
        open.type = 'note_embed_paragraph_open';
        open.tag = 'div';
        open.attrJoin('class', 'note-embed-paragraph');
        close.type = 'note_embed_paragraph_close';
        close.tag = 'div';
    }
    return true;
}

function scanFileLinkParagraph(children: Token[]): FileLink[] | null {
    const fileLinks: FileLink[] = [];
    let isInLink = false;
    let currentUrl = '';
    let currentFilename = '';
    for (const child of children) {
        if (child.type === 'link_open') {
            const href = child.attrGet('href') ?? '';
            if (!href.startsWith('/api/files/'))
                return null;
            isInLink = true;
            currentUrl = href;
            currentFilename = '';
            continue;
        }
        if (child.type === 'link_close') {
            if (!isInLink)
                return null;
            fileLinks.push({ url: currentUrl, filename: currentFilename || 'file' });
            isInLink = false;
            continue;
        }
        if (isInLink) {
            currentFilename += child.content;
            continue;
        }
        if (child.type === 'softbreak' || child.type === 'hardbreak')
            continue;
        if (child.type === 'text' && child.content.trim().length === 0)
            continue;
        return null;
    }
    return !isInLink && fileLinks.length > 0 ? fileLinks : null;
}

function fileAttachmentsRule(state: StateCore): boolean {
    for (let index = 0; index < state.tokens.length; index++) {
        const open = state.tokens[index]!;
        if (open.type !== 'paragraph_open')
            continue;
        const inline = state.tokens[index + 1];
        const close = state.tokens[index + 2];
        if (!inline || inline.type !== 'inline' || !close || close.type !== 'paragraph_close')
            continue;
        const fileLinks = scanFileLinkParagraph(inline.children ?? []);
        if (!fileLinks)
            continue;
        const sourceLine = open.map?.[0] ?? 0;
        const newTokens = fileLinks.map((link) => {
            const token = new state.Token('file_card', 'div', 0);
            token.block = true;
            token.meta = { url: link.url, filename: link.filename, line: sourceLine };
            token.map = open.map;
            return token;
        });
        state.tokens.splice(index, 3, ...newTokens);
        index += newTokens.length - 1;
    }
    return true;
}

function getFileExtension(filename: string): string {
    const dot = filename.lastIndexOf('.');
    return dot > 0 ? filename.slice(dot + 1).toLowerCase() : '';
}

function getFileCategory(ext: string): string {
    if (ext === 'pdf')
        return 'pdf';
    if (['doc', 'docx', 'odt', 'rtf'].includes(ext))
        return 'doc';
    if (['xls', 'xlsx', 'csv', 'tsv'].includes(ext))
        return 'sheet';
    if (['ppt', 'pptx'].includes(ext))
        return 'slide';
    if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext))
        return 'archive';
    if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(ext))
        return 'audio';
    if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext))
        return 'video';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext))
        return 'image';
    if (['js', 'ts', 'jsx', 'tsx', 'py', 'go', 'rs', 'c', 'cpp', 'h', 'java', 'html', 'css', 'json', 'yaml', 'yml', 'xml', 'sql', 'sh'].includes(ext))
        return 'code';
    if (['txt', 'md', 'markdown'].includes(ext))
        return 'text';
    return 'file';
}

function renderFileCard(tokens: Token[], index: number): string {
    const token = tokens[index]!;
    const { url, filename, line } = token.meta as {
        url: string;
        filename: string;
        line: number;
    };
    const ext = getFileExtension(filename);
    const category = getFileCategory(ext);
    const badgeText = (ext ? ext.slice(0, 4) : 'FILE').toUpperCase();
    const lineAttr = Number.isInteger(line) && line >= 0 ? ` data-file-line="${line}"` : '';
    return [
        `<div class="file-card" data-file-card data-file-url="${escapeAttr(url)}" data-file-name="${escapeAttr(filename)}"${lineAttr}>`,
        `<div class="file-card-main">`,
        `<div class="file-card-badge" data-category="${escapeAttr(category)}">`,
        `<span class="file-card-ext">${escapeHtml(badgeText)}</span>`,
        `</div>`,
        `<div class="file-card-meta">`,
        `<span class="file-card-name" title="${escapeAttr(filename)}">${escapeHtml(filename)}</span>`,
        `<span class="file-card-info">${escapeHtml(badgeText)} · ${escapeHtml(t("workspace.file_attachment"))}</span>`,
        `</div>`,
        `</div>`,
        `<div class="file-card-actions">`,
        `<button type="button" class="file-card-btn" data-file-action="preview" aria-label="${escapeAttr(t("workspace.preview_file"))}">`,
        `<span class="file-card-btn-icon file-icon-preview"></span>`,
        `<span>${escapeHtml(t("workspace.preview_file"))}</span>`,
        `</button>`,
        `<a href="${escapeAttr(url)}" download="${escapeAttr(filename)}" class="file-card-btn" data-file-action="download" aria-label="${escapeAttr(t("workspace.download_file"))}">`,
        `<span class="file-card-btn-icon file-icon-download"></span>`,
        `<span>${escapeHtml(t("workspace.download_file"))}</span>`,
        `</a>`,
        `<button type="button" class="file-card-btn file-card-btn-danger" data-file-action="delete" aria-label="${escapeAttr(t("workspace.delete_file"))}">`,
        `<span class="file-card-btn-icon file-icon-delete"></span>`,
        `<span>${escapeHtml(t("workspace.delete_file"))}</span>`,
        `</button>`,
        `</div>`,
        `</div>`,
    ].join('');
}
export function registerAttachments(md: MarkdownIt): void {

    md.core.ruler.after('trusted_task_placeholders', 'block_note_embeds', blockNoteEmbedsRule);
    md.core.ruler.after('block_note_embeds', 'file_attachments', fileAttachmentsRule);
    md.renderer.rules.file_card = renderFileCard;
}

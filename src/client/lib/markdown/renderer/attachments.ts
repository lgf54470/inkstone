import MarkdownIt from 'markdown-it';
import { escapeHtml } from '@shared/escape';
import { t } from '../../i18n';
import { escapeAttr } from './util';
export function registerAttachments(md: MarkdownIt): void {

    md.core.ruler.after('trusted_task_placeholders', 'block_note_embeds', (state) => {
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
    });
    md.core.ruler.after('block_note_embeds', 'file_attachments', (state) => {
        for (let index = 0; index < state.tokens.length; index++) {
            const open = state.tokens[index]!;
            if (open.type !== 'paragraph_open')
                continue;
            const inline = state.tokens[index + 1];
            const close = state.tokens[index + 2];
            if (!inline || inline.type !== 'inline' || !close || close.type !== 'paragraph_close')
                continue;
            const children = inline.children ?? [];
            if (!children.length)
                continue;
            const fileLinks: { url: string; filename: string }[] = [];
            let isAllFileLinks = true;
            let isInLink = false;
            let currentUrl = '';
            let currentFilename = '';
            for (const child of children) {
                if (child.type === 'link_open') {
                    const href = child.attrGet('href') ?? '';
                    if (href.startsWith('/api/files/')) {
                        isInLink = true;
                        currentUrl = href;
                        currentFilename = '';
                    }
                    else {
                        isAllFileLinks = false;
                        break;
                    }
                }
                else if (child.type === 'link_close') {
                    if (isInLink) {
                        fileLinks.push({ url: currentUrl, filename: currentFilename || 'file' });
                        isInLink = false;
                    }
                    else {
                        isAllFileLinks = false;
                        break;
                    }
                }
                else if (isInLink) {
                    currentFilename += child.content;
                }
                else if (child.type === 'softbreak' || child.type === 'hardbreak') {
                }
                else if (child.type === 'text') {
                    if (child.content.trim().length > 0) {
                        isAllFileLinks = false;
                        break;
                    }
                }
                else {
                    isAllFileLinks = false;
                    break;
                }
            }
            if (isAllFileLinks && fileLinks.length > 0 && !isInLink) {
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
        }
        return true;
    });
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
    md.renderer.rules.file_card = (tokens, index) => {
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
    };
}

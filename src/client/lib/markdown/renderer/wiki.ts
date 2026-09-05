import MarkdownIt from 'markdown-it';
import { escapeHtml } from '@shared/escape';
import { t } from '../../i18n';
import { encodeDataValue } from '../data-attr';
import { renderEnv } from './env';
import { parseWikiTarget } from './parse';
import { escapeAttr } from './util';
export function registerWiki(md: MarkdownIt): void {

    const WIKI_RE = /^\[\[([^\[\]\n]{1,400})\]\]/;
    const EMBED_RE = /^!\[\[([^\[\]\n]{1,400})\]\]/;
    const BLOCK_REF_RE = /^\(\(([A-Za-z0-9][A-Za-z0-9_-]{0,63})\)\)/;
    const TAG_RE = /^#([\p{L}\p{N}_\-/·]{1,60})(?![\p{L}\p{N}_\-/·])/u;
    md.inline.ruler.before('image', 'note_embed', (state, silent) => {
        if (!state.src.startsWith('![[', state.pos))
            return false;
        const match = EMBED_RE.exec(state.src.slice(state.pos));
        if (!match)
            return false;
        if (!silent) {
            const token = state.push('note_embed', 'div', 0);
            token.content = match[1]!.trim();
            renderEnv(state.env).hasEmbeds = true;
        }
        state.pos += match[0].length;
        return true;
    });
    md.inline.ruler.before('link', 'wikilink', (state, silent) => {
        if (!state.src.startsWith('[[', state.pos))
            return false;
        const match = WIKI_RE.exec(state.src.slice(state.pos));
        if (!match)
            return false;
        if (!silent) {
            const token = state.push('wikilink', 'a', 0);
            token.content = match[1]!.trim();
        }
        state.pos += match[0].length;
        return true;
    });
    md.inline.ruler.before('text', 'block_reference', (state, silent) => {
        if (!state.src.startsWith('((', state.pos))
            return false;
        const match = BLOCK_REF_RE.exec(state.src.slice(state.pos));
        if (!match)
            return false;
        if (!silent) {
            const token = state.push('block_reference', 'a', 0);
            token.content = match[1]!;
        }
        state.pos += match[0].length;
        return true;
    });
    md.inline.ruler.before('text', 'inline_tag', (state, silent) => {
        if (state.src[state.pos] !== '#')
            return false;
        const previous = state.pos > 0 ? state.src[state.pos - 1]! : ' ';
        if (!/[\s(\uff08[\u3010>\u300c\u300e\uff0c,\u3001;\uff1b]/.test(previous) && state.pos !== 0)
            return false;
        const match = TAG_RE.exec(state.src.slice(state.pos));
        if (!match)
            return false;
        if (!silent) {
            const token = state.push('inline_tag', 'span', 0);
            token.content = match[1]!;
        }
        state.pos += match[0].length;
        return true;
    });
    md.inline.ruler.before('link', 'ruby_bracket', (state, silent) => {
        const start = state.pos;
        if (state.src.charCodeAt(start) !== 0x5b)
            return false;
        const closeBracket = state.src.indexOf(']', start + 1);
        if (closeBracket === -1 || closeBracket + 1 >= state.src.length || state.src.charCodeAt(closeBracket + 1) !== 0x7b)
            return false;
        const closeBrace = state.src.indexOf('}', closeBracket + 2);
        if (closeBrace === -1)
            return false;
        if (silent)
            return true;
        const baseText = state.src.slice(start + 1, closeBracket);
        const rubyText = state.src.slice(closeBracket + 2, closeBrace);
        if (!baseText || !rubyText)
            return false;
        const token = state.push('html_inline', '', 0);
        token.content = `<ruby>${escapeHtml(baseText)}<rp>(</rp><rt>${escapeHtml(rubyText)}</rt><rp>)</rp></ruby>`;
        state.pos = closeBrace + 1;
        return true;
    });
    md.renderer.rules.note_embed = (tokens, index) => {
        const parsed = parseWikiTarget(tokens[index]!.content);
        const label = parsed.alias || parsed.raw;
        return `<div class="note-embed loading" data-embed-target="${escapeAttr(encodeDataValue(parsed.raw))}"><span class="note-embed-head">${escapeHtml(label)}</span><div class="note-embed-body" aria-busy="true">${escapeHtml(t("common.loading"))}</div></div>`;
    };
    md.renderer.rules.wikilink = (tokens, index) => {
        const parsed = parseWikiTarget(tokens[index]!.content);
        const label = parsed.alias || parsed.raw;
        return `<a class="wikilink" data-wikilink="${escapeAttr(encodeDataValue(parsed.raw))}" href="#">${escapeHtml(label)}</a>`;
    };
    md.renderer.rules.block_reference = (tokens, index) => {
        const id = tokens[index]!.content;
        return `<a class="block-reference" data-block-ref="${escapeAttr(id)}" href="#%5E${escapeAttr(id)}">((${escapeHtml(id)}))</a>`;
    };
    md.renderer.rules.inline_tag = (tokens, index) => `<span class="inline-tag" data-tag="${escapeAttr(encodeDataValue(tokens[index]!.content))}" role="link" tabindex="0">#${escapeHtml(tokens[index]!.content)}</span>`;
}

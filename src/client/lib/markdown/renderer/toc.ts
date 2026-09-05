import MarkdownIt from 'markdown-it';
import { escapeHtml } from '@shared/escape';
import { t } from '../../i18n';
import { renderEnv } from './env';
import { escapeAttr } from './util';
export function registerToc(md: MarkdownIt): void {

    md.block.ruler.before('paragraph', 'toc', (state, startLine, _endLine, silent) => {
        const pos = state.bMarks[startLine]! + state.tShift[startLine]!;
        const max = state.eMarks[startLine]!;
        const line = state.src.slice(pos, max).trim();
        if (!/^\[(?:\[\s*(?:toc|TOC)\s*\]\]|(?:toc|TOC))\]$/.test(line)) {
            return false;
        }
        if (silent)
            return true;
        state.line = startLine + 1;
        const token = state.push('toc', 'nav', 0);
        token.map = [startLine, startLine + 1];
        return true;
    });
    md.renderer.rules.toc = (tokens, index, _options, env) => {
        const rEnv = renderEnv(env);
        const headings = rEnv.headings ?? [];
        const line = tokens[index]?.map?.[0];
        const dataLine = line !== undefined ? ` data-line="${line}"` : '';
        if (!headings.length) {
            return `<nav class="table-of-contents empty"${dataLine}><div class="toc-title">${t('common.table_of_contents')}</div></nav>`;
        }
        const items = headings.map((h) => {
            const indentClass = `toc-level-${h.level}`;
            return `<li class="toc-item ${indentClass}"><a href="#${escapeAttr(h.slug)}" class="toc-link">${escapeHtml(h.text)}</a></li>`;
        }).join('');
        return `<nav class="table-of-contents"${dataLine}><div class="toc-title">${t('common.table_of_contents')}</div><ul class="toc-list">${items}</ul></nav>`;
    };
}

import MarkdownIt from 'markdown-it';
import { parseFrontMatter } from '@shared/markdown-utils';
import { escapeHtml } from '@shared/escape';
import { getLocale, t } from '../../i18n';
import { renderFrontMatterValue } from './containers';
import type { RenderEnvironment } from './types';
import { renderEnv } from './env';
export 
function localizeFrontMatterError(error: string): string {
    if (error === 'Front Matter exceeds the 64 KiB safety limit')
        return t("markdown.front_matter_exceeds_the_64_kib_safety_limit");
    if (error === 'Front Matter root must be a YAML mapping')
        return t("markdown.the_front_matter_root_must_be_a_yaml_mapping");
    return getLocale() === 'zh-CN' ? t("markdown.invalid_yaml_check_indentation_quotes_and_duplicate_keys") : error;
}

export function registerFrontMatter(md: MarkdownIt): void {


    md.block.ruler.before('hr', 'front_matter', (state, startLine, _endLine, silent) => {
        if (startLine !== 0)
            return false;
        const parsed = parseFrontMatter(state.src);
        if (!parsed.lineOffset)
            return false;
        if (silent)
            return true;
        const token = state.push('front_matter', 'section', 0);
        token.block = true;
        token.map = [0, parsed.lineOffset];
        token.meta = { data: parsed.data, errors: parsed.errors };
        const env = renderEnv(state.env);
        env.frontMatter = parsed.data;
        env.frontMatterErrors = parsed.errors;
        state.line = parsed.lineOffset;
        return true;
    });
    md.renderer.rules.front_matter = (tokens, index, _options, env) => {
        if ((env as RenderEnvironment | undefined)?.hideFrontMatter)
            return '';
        const meta = tokens[index]!.meta as {
            data: Record<string, unknown>;
            errors: string[];
        };
        if (meta.errors.length) {
            const details = meta.errors.map((error) => `<li>${escapeHtml(localizeFrontMatterError(error))}</li>`).join('');
            return `<aside class="frontmatter-error" data-line="0"><strong>${escapeHtml(t("markdown.invalid_front_matter"))}</strong><ul>${details}</ul></aside>`;
        }
        const entries = Object.entries(meta.data);
        if (!entries.length)
            return '';
        const rows = entries
            .map(([key, value]) => `<div class="frontmatter-row"><dt>${escapeHtml(key)}</dt><dd>${renderFrontMatterValue(value)}</dd></div>`)
            .join('');
        return `<details class="frontmatter-properties" data-line="0"><summary>${escapeHtml(t("markdown.properties"))}</summary><dl>${rows}</dl></details>`;
    };
}

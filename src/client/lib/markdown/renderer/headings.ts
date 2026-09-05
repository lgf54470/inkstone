import MarkdownIt from 'markdown-it';
import { slugifyHeading } from '@shared/markdown-utils';
import { renderEnv } from './env';
import { plainInline } from './util';
export function registerHeadings(md: MarkdownIt): void {

    md.core.ruler.push('source_lines', (state) => {
        for (const token of state.tokens) {
            if (token.map && token.type.endsWith('_open') && token.level === 0) {
                token.attrSet('data-line', String(token.map[0]));
            }
        }
        return true;
    });
    md.core.ruler.push('collect_headings', (state) => {
        const env = renderEnv(state.env);
        env.headings = [];
        for (let index = 0; index < state.tokens.length; index++) {
            const token = state.tokens[index]!;
            if (token.type !== 'heading_open')
                continue;
            const inline = state.tokens[index + 1];
            const text = inline ? plainInline(inline) : '';
            env.headings.push({
                level: Number(token.tag.slice(1)),
                text,
                slug: token.attrGet('id') ?? slugifyHeading(text),
                line: token.map?.[0] ?? 0,
            });
        }
        return true;
    });
}

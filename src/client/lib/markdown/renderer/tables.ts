import MarkdownIt from 'markdown-it';
export function registerTables(md: MarkdownIt): void {

    md.renderer.rules.table_open = (tokens, index) => {
        const line = tokens[index]!.map ? ` data-line="${tokens[index]!.map![0]}"` : '';
        return `<div class="table-wrap"${line}><table>`;
    };
    md.renderer.rules.table_close = () => '</table></div>';
    const defaultThOpen = md.renderer.rules.th_open || ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
    md.renderer.rules.th_open = (tokens, idx, options, env, self) => {
        const token = tokens[idx]!;
        const style = token.attrGet('style');
        const alignMatch = style ? /text-align:\s*(center|right|left)/i.exec(style) : null;
        if (alignMatch) {
            token.attrSet('align', alignMatch[1]!.toLowerCase());
        }
        return defaultThOpen(tokens, idx, options, env, self);
    };
    const defaultTdOpen = md.renderer.rules.td_open || ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
    md.renderer.rules.td_open = (tokens, idx, options, env, self) => {
        const token = tokens[idx]!;
        const style = token.attrGet('style');
        const alignMatch = style ? /text-align:\s*(center|right|left)/i.exec(style) : null;
        if (alignMatch) {
            token.attrSet('align', alignMatch[1]!.toLowerCase());
        }
        return defaultTdOpen(tokens, idx, options, env, self);
    };
}

import type Token from 'markdown-it/lib/token.mjs';
import { escapeHtml } from '@shared/escape';
export 
function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, Number.isFinite(value) ? Math.trunc(value) : min));
}
export 
function plainInline(token: Token): string {
    if (token.type !== 'inline' || !token.children)
        return token.content;
    return token.children
        .filter((child) => ['text', 'code_inline', 'inline_tag', 'wikilink', 'block_reference'].includes(child.type))
        .map((child) => child.content)
        .join('')
        .trim();
}
export 
function escapeAttr(text: string): string {
    return escapeHtml(text).replace(/'/g, '&#39;').replace(/\n/g, '&#10;');
}

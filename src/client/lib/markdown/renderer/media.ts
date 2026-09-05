import MarkdownIt from 'markdown-it';
import { escapeHtml } from '@shared/escape';
import { t } from '../../i18n';
import { renderEnv } from './env';
import { escapeAttr } from './util';
export function registerMedia(md: MarkdownIt): void {

    const defaultImage = md.renderer.rules.image;
    md.renderer.rules.image = (tokens, index, options, env, self) => {
        const token = tokens[index]!;
        const src = token.attrGet('src') ?? '';
        // External https images are blocked by default (privacy default; the server
        // CSP drops `https:` from img-src while preview.externalImages is off, so
        // this is defense-in-depth for raw-HTML images too). Same-origin http(s)
        // URLs, relative paths, data:/blob: keep loading, and the whole check is
        // skipped when the caller passes `{ externalImages: true }`.
        if (renderEnv(env).externalImages !== true && isExternalImageUrl(src)) {
            // Placeholder instead of a broken <img>: the browser never loads an
            // external image while blocked, so no request leaves the origin.
            const alt = token.content ? escapeHtml(token.content) : '';
            return `<figure class="image-blocked" data-image-blocked="${escapeAttr(src)}">` +
                `<span class="image-blocked-label">${escapeHtml(t("markdown.external_image_blocked"))}</span>` +
                (alt ? `<figcaption class="image-blocked-fallback">${alt}</figcaption>` : '') +
                `</figure>`;
        }
        token.attrSet('loading', 'lazy');
        token.attrSet('decoding', 'async');
        token.attrSet('referrerpolicy', 'no-referrer');
        const title = token.attrGet('title');
        const rendered = defaultImage
            ? defaultImage(tokens, index, options, env, self)
            : self.renderToken(tokens, index, options);
        return title ? `<figure>${rendered}<figcaption>${escapeHtml(title)}</figcaption></figure>` : rendered;
    };
    /** True for http(s) URLs that point to a different origin than the app itself. */
    function isExternalImageUrl(src: string): boolean {
        if (!/^https?:/i.test(src))
            return false;
        try {
            const base = typeof location === 'undefined' ? 'http://localhost/' : location.href;
            const origin = typeof location === 'undefined' ? 'http://localhost/' : location.origin;
            return new URL(src, base).origin !== origin;
        }
        catch {
            return false;
        }
    }
    const defaultLink = md.renderer.rules.link_open;
    md.renderer.rules.link_open = (tokens, index, options, env, self) => {
        const href = tokens[index]!.attrGet('href') ?? '';
        if (href.startsWith('/api/files/')) {
            tokens[index]!.attrJoin('class', 'inline-file-chip');
            tokens[index]!.attrSet('data-inline-file', 'true');
        }
        else if (/^https?:/i.test(href)) {
            tokens[index]!.attrSet('target', '_blank');
            tokens[index]!.attrSet('rel', 'noopener noreferrer');
        }
        return defaultLink
            ? defaultLink(tokens, index, options, env, self)
            : self.renderToken(tokens, index, options);
    };
}

import { escapeHtml } from '@shared/escape';
import { decodeDataValue } from '../data-attr';
import { t } from '../../i18n';
import { sanitizeMathHtml } from '../sanitize';
import { remember, withTimeout } from './util';
interface KatexLike {
    renderToString: (tex: string, options?: Record<string, unknown>) => string;
}
let katexPromise: Promise<KatexLike> | null = null;
const mathCache = new Map<string, string>();
async function getKatex(): Promise<KatexLike | null> {
    if (!katexPromise) {
        const loading = withTimeout((async () => {
            const mod = await import('../../katex-loader')
            const katex = (mod.default ?? mod) as unknown as KatexLike
            return katex
        })(), OPTIONAL_RENDERER_LOAD_TIMEOUT_MS, t("markdown.math_rendering_timed_out_while_loading"));
        katexPromise = loading;
        void loading.catch((err) => {
            if (katexPromise === loading)
                katexPromise = null;
            console.warn(t("markdown.inkstone_math_rendering_failed_to_load"), err);
        });
    }
    try {
        return await katexPromise;
    }
    catch {
        return null;
    }
}
export async function renderMath(root: HTMLElement): Promise<void> {
    const pending = [...root.querySelectorAll<HTMLElement>('[data-math]')]
        .filter((node) => !node.dataset.rendered)
        .map((node) => {
        const source = decodeDataValue(node.dataset.math);
        const display = node.classList.contains('math-block');
        return { node, source, display, key: `${display ? 'block' : 'inline'}\u0000${source}` };
    });
    for (let index = pending.length - 1; index >= 0; index--) {
        const item = pending[index]!;
        const cached = mathCache.get(item.key);
        if (!cached)
            continue;
        item.node.innerHTML = cached;
        item.node.classList.remove('math-source');
        item.node.dataset.rendered = '1';
        pending.splice(index, 1);
    }
    if (!pending.length)
        return;
    const katex = await getKatex();
    if (!katex) {
        pending.forEach(({ node, source, display }) => showMathSource(node, source, display));
        return;
    }
    for (const { node, source, display, key } of pending) {
        try {
            const html = katex.renderToString(source, {
                displayMode: display,
                throwOnError: false,
                errorColor: 'var(--danger)',
                strict: false,
                output: 'html',
            });
            // KaTeX output is machine-generated from math source (\color values
            // are strictly validated and \href is inert at trust:false), but it
            // is still written through the same sanitizer as every other HTML
            // fragment so a future KaTeX change cannot introduce a sink.
            const safe = sanitizeMathHtml(html);
            remember(mathCache, key, safe, 160);
            node.innerHTML = safe;
            node.classList.remove('math-source');
            node.dataset.rendered = '1';
        }
        catch (err) {
            node.innerHTML = `<code class="math-error">${escapeHtml(source)}</code>`;
            node.dataset.rendered = '1';
            void err;
        }
    }
}
export function showMathSource(root: HTMLElement): void;
export function showMathSource(node: HTMLElement, source: string, display: boolean): void;
export function showMathSource(target: HTMLElement, source?: string, display?: boolean): void {
    if (source === undefined) {
        target.querySelectorAll<HTMLElement>('[data-math]').forEach((node) => {
            showMathSource(node, decodeDataValue(node.dataset.math), node.classList.contains('math-block'));
        });
        return;
    }
    delete target.dataset.rendered;
    target.classList.add('math-source');
    target.textContent = display ? `$$\n${source}\n$$` : `$${source}$`;
}
const OPTIONAL_RENDERER_LOAD_TIMEOUT_MS = 15000;

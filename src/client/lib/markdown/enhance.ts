import { escapeHtml } from '@shared/escape';
import { decodeDataValue } from './data-attr';
import { errorMessage } from '../errors';
import { t } from "../i18n";
import { highlightWithPrism } from './prism';
import { sanitizeCodeTokenHtml, sanitizeMathHtml } from './sanitize';

const CHARTJS_TEXT_COLORS = { dark: '#94a3b8', light: '#64748b' } as const
const OPTIONAL_RENDERER_LOAD_TIMEOUT_MS = 15000;

export function decorateCodeBlock(block: HTMLElement): void {
    const pre = block.querySelector<HTMLElement>('pre');
    const code = pre?.querySelector<HTMLElement>('code');
    if (!pre || !code)
        return;
    let lines = [...code.querySelectorAll<HTMLElement>(':scope > .line')];
    if (!lines.length) {
        const values = splitNodesAtNewlines([...code.childNodes]);
        if ((code.textContent ?? '').endsWith('\n'))
            values.pop();
        code.replaceChildren();
        values.forEach((value, index) => {
            const line = document.createElement('span');
            line.className = 'line';
            line.append(...value);
            if (!line.textContent)
                line.textContent = ' ';
            code.append(line);
            if (index < values.length - 1)
                code.append('\n');
        });
        lines = [...code.querySelectorAll<HTMLElement>(':scope > .line')];
    }
    const start = Math.max(1, Number(block.dataset.codeStart) || 1);
    const highlighted = new Set((block.dataset.highlightLines ?? '')
        .split(',')
        .map(Number)
        .filter((value) => Number.isInteger(value) && value > 0));
    const numbered = block.dataset.lineNumbers === 'true';
    block.classList.toggle('has-line-numbers', numbered);
    lines.forEach((line, index) => {
        line.dataset.lineNumber = String(start + index);
        line.classList.toggle('highlighted', highlighted.has(index + 1));
    });
}

function splitNodesAtNewlines(nodes: Node[]): Node[][] {
    const lines: Node[][] = [[]];
    for (const node of nodes) {
        const parts = splitNodeAtNewlines(node);
        lines[lines.length - 1]!.push(...parts[0]!);
        for (let index = 1; index < parts.length; index++)
            lines.push(parts[index]!);
    }
    return lines;
}

function splitNodeAtNewlines(node: Node): Node[][] {
    if (node.nodeType === Node.TEXT_NODE)
        return (node.textContent ?? '').split('\n').map((text) => [document.createTextNode(text)]);
    if (!(node instanceof HTMLElement))
        return [[node.cloneNode(true)]];
    return splitNodesAtNewlines([...node.childNodes]).map((children) => {
        const clone = node.cloneNode(false) as HTMLElement;
        clone.append(...children);
        return [clone];
    });
}

async function highlightCodeBlocks(root: HTMLElement): Promise<void> {
    await Promise.all([...root.querySelectorAll<HTMLElement>('.code-block')].map(async (block) => {
        const code = block.querySelector<HTMLElement>(':scope > pre > code');
        if (!code)
            return;
        const source = (code.textContent ?? '').replace(/\n$/, '');
        try {
            const highlighted = await highlightWithPrism(source, block.dataset.lang ?? '');
            if (highlighted) {
                code.innerHTML = sanitizeCodeTokenHtml(highlighted.html);
                code.classList.add(`language-${highlighted.language}`);
            }
            else {
                code.textContent = source;
            }
        }
        catch (err) {
            code.textContent = source;
            console.warn(t("markdown.inkstone_code_highlighting_failed_showing_plain_text"), err);
        }
        decorateCodeBlock(block);
    }));
}
let generatedCodeBlockId = 0;

export function configureCodeBlockCollapsing(root: HTMLElement, collapseLines: number): void {
    const threshold = Number.isInteger(collapseLines) && collapseLines >= 8 ? collapseLines : 0;
    root.querySelectorAll<HTMLElement>('.code-block:not(.markdown-example-code)').forEach((block) => {
        const button = block.querySelector<HTMLButtonElement>('[data-code-collapse]');
        const pre = block.querySelector<HTMLElement>(':scope > pre');
        const lineCount = block.querySelectorAll(':scope pre code > .line').length;
        const wasExpanded = block.classList.contains('is-code-expanded');
        block.classList.remove('is-code-collapsed', 'is-code-expanded');
        delete block.dataset.codeCollapseLines;
        delete block.dataset.codeLineCount;
        delete block.dataset.codeCollapseMaxHeight;
        if (pre)
            pre.style.maxHeight = '';
        button?.remove();
        if (!threshold || lineCount <= threshold)
            return;
        const head = block.querySelector<HTMLElement>(':scope > .code-block-head');
        if (!head)
            return;
        block.dataset.codeCollapseLines = String(threshold);
        block.dataset.codeLineCount = String(lineCount);
        block.classList.add(wasExpanded ? 'is-code-expanded' : 'is-code-collapsed');
        const maxHeight = `${threshold * 1.56 + 1.5}em`;
        block.dataset.codeCollapseMaxHeight = maxHeight;
        if (pre)
            pre.style.maxHeight = wasExpanded ? '' : maxHeight;
        const codeId = pre?.id || `ink-code-${++generatedCodeBlockId}`;
        if (pre)
            pre.id = codeId;
        const toggle = document.createElement('button');
        toggle.className = 'code-collapse';
        toggle.type = 'button';
        toggle.dataset.codeCollapse = '1';
        toggle.setAttribute('aria-controls', codeId);
        toggle.setAttribute('aria-expanded', String(wasExpanded));
        toggle.textContent = wasExpanded
            ? t('markdown.collapse_code')
            : t('markdown.show_more_code', { count: lineCount - threshold });
        head.insertBefore(toggle, head.querySelector('[data-copy]'));
    });
}
export function toggleCodeBlockCollapse(button: HTMLButtonElement): void {
    const block = button.closest<HTMLElement>('.code-block');
    if (!block)
        return;
    const expanded = block.classList.toggle('is-code-expanded');
    block.classList.toggle('is-code-collapsed', !expanded);
    const pre = block.querySelector<HTMLElement>(':scope > pre');
    if (pre)
        pre.style.maxHeight = expanded ? '' : block.dataset.codeCollapseMaxHeight ?? '';
    button.setAttribute('aria-expanded', String(expanded));
    button.textContent = expanded
        ? t('markdown.collapse_code')
        : t('markdown.show_more_code', {
            count: Math.max(0, Number(block.dataset.codeLineCount) - Number(block.dataset.codeCollapseLines)),
        });
}
interface KatexLike {
    renderToString: (tex: string, options?: Record<string, unknown>) => string;
}
let katexPromise: Promise<KatexLike> | null = null;
const mathCache = new Map<string, string>();
async function getKatex(): Promise<KatexLike | null> {
    if (!katexPromise) {
        const loading = withTimeout((async () => {
            const mod = await import('../katex-loader')
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
async function renderMath(root: HTMLElement): Promise<void> {
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
function showMathSource(root: HTMLElement): void;
function showMathSource(node: HTMLElement, source: string, display: boolean): void;
function showMathSource(target: HTMLElement, source?: string, display?: boolean): void {
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
type MermaidApi = typeof import('mermaid').default;
type MermaidTheme = 'dark' | 'default';
const MERMAID_LOAD_TIMEOUT_MS = 15000;
const MERMAID_RENDER_TIMEOUT_MS = 10000;
const MERMAID_CANCELLED = Symbol('mermaid-cancelled');
let mermaidPromise: Promise<MermaidApi> | null = null;
let mermaidTheme: 'dark' | 'default' | null = null;
let mermaidSeq = 0;
let mermaidRenderQueue: Promise<void> = Promise.resolve();
const mermaidCache = new Map<string, string>();
async function getMermaid(): Promise<MermaidApi> {
    if (!mermaidPromise) {
        const loading = withTimeout(import('mermaid').then((mod) => mod.default), MERMAID_LOAD_TIMEOUT_MS, t("markdown.diagram_rendering_timed_out_while_loading"));
        mermaidPromise = loading;
        void loading.catch((err) => {
            if (mermaidPromise === loading)
                mermaidPromise = null;
            console.warn(t("markdown.inkstone_diagram_rendering_failed_to_load"), err);
        });
    }
    return mermaidPromise;
}
function initializeMermaid(mermaid: MermaidApi, theme: MermaidTheme): void {
    if (mermaidTheme !== theme) {
        mermaidTheme = theme;
        mermaid.initialize({
            startOnLoad: false,
            theme,
            securityLevel: 'strict',
            suppressErrorRendering: true,
            fontFamily: getComputedStyle(document.documentElement).getPropertyValue('--font-ui').trim() ||
                'system-ui, sans-serif',
            themeVariables: {
                fontSize: '13px',
                background: 'transparent',
            },
        });
    }
}
function createMermaidRenderHost(): HTMLDivElement {
    const host = document.createElement('div');
    host.dataset.mermaidRenderHost = '1';
    host.setAttribute('aria-hidden', 'true');
    Object.assign(host.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100vw',
        visibility: 'hidden',
        pointerEvents: 'none',
        zIndex: 'var(--z-under)',
    });
    document.body.append(host);
    return host;
}
function mermaidKey(source: string, dark: boolean): string {
    return `${dark ? 'dark' : 'light'}\u0000${source}`;
}
function hydrateCachedMermaid(root: HTMLElement, dark: boolean): void {
    root.querySelectorAll<HTMLElement>('[data-mermaid]').forEach((node) => {
        if (node.dataset.rendered === currentSignature(node, dark))
            return;
        const cached = mermaidCache.get(mermaidKey(mermaidSource(node), dark));
        if (cached)
            applyMermaidSvg(node, cached, dark);
    });
}
function showMermaidSource(root: HTMLElement): void {
    root.querySelectorAll<HTMLElement>('[data-mermaid]').forEach((node) => {
        node.classList.remove('loading');
        node.classList.add('mermaid-source');
        node.removeAttribute('aria-busy');
        const code = document.createElement('code');
        code.textContent = mermaidSource(node);
        node.replaceChildren(code);
    });
}
export interface MermaidRenderHooks<T = unknown> {
    isCurrent?: () => boolean;
    beforeUpdate?: () => T;
    afterUpdate?: (snapshot: T) => void;
}
export async function renderPendingMermaid<T = unknown>(root: HTMLElement, dark: boolean, hooks: MermaidRenderHooks<T> = {}): Promise<void> {
    const isCurrent = () => hooks.isCurrent?.() !== false;
    const pending = [...root.querySelectorAll<HTMLElement>('[data-mermaid]')]
        .filter((node) => node.dataset.rendered !== currentSignature(node, dark))
        .map((node) => {
        const source = mermaidSource(node);
        return { node, source, key: mermaidKey(source, dark) };
    });
    for (const { node, source, key } of pending) {
        if (!isCurrent())
            return;
        try {
            const svg = await queueMermaidRender(key, source, dark, () => {
                return (isCurrent() &&
                    root.contains(node) &&
                    mermaidSource(node) === source &&
                    node.dataset.rendered !== currentSignature(node, dark));
            });
            if (!isCurrent() ||
                !root.contains(node) ||
                mermaidSource(node) !== source ||
                node.dataset.rendered === currentSignature(node, dark)) {
                continue;
            }
            updateMermaidNode(hooks, () => applyMermaidSvg(node, svg, dark));
        }
        catch (err) {
            if (err === MERMAID_CANCELLED || !isCurrent() || !root.contains(node))
                return;
            if (mermaidSource(node) !== source)
                continue;
            updateMermaidNode(hooks, () => showMermaidError(node, err, source));
        }
    }
}
function queueMermaidRender(key: string, source: string, dark: boolean, isCurrent: () => boolean): Promise<string> {
    const task = mermaidRenderQueue.then(async () => {
        const cached = mermaidCache.get(key);
        if (cached)
            return cached;
        if (!isCurrent())
            throw MERMAID_CANCELLED;
        const mermaid = await getMermaid();
        if (!isCurrent())
            throw MERMAID_CANCELLED;
        initializeMermaid(mermaid, dark ? 'dark' : 'default');
        const renderHost = createMermaidRenderHost();
        try {
            const { svg } = await withTimeout(mermaid.render(`ink-mermaid-${++mermaidSeq}`, source, renderHost), MERMAID_RENDER_TIMEOUT_MS, t("markdown.diagram_rendering_timed_out_check_the_diagram_or_try_again_later"));
            remember(mermaidCache, key, svg, 60);
            return svg;
        }
        finally {
            renderHost.remove();
        }
    });
    mermaidRenderQueue = task.then(() => undefined, () => undefined);
    return task;
}
function applyMermaidSvg(node: HTMLElement, svg: string, dark: boolean): void {
    node.innerHTML = svg;
    node.classList.remove('loading', 'mermaid-source', 'has-error');
    node.setAttribute('aria-busy', 'false');
    node.dataset.rendered = currentSignature(node, dark);
}
function showMermaidError(node: HTMLElement, err: unknown, source: string): void {
    const wrap = document.createElement('div');
    wrap.className = 'mermaid-error';
    const message = document.createElement('span');
    message.className = 'mermaid-error-message';
    const detail = errorMessage(err);
    message.textContent = detail.slice(0, 500);
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'mermaid-retry';
    retry.dataset.mermaidRetry = '1';
    retry.textContent = t("common.retry");
    const code = document.createElement('code');
    code.textContent = source;
    wrap.append(message, retry, code);
    node.replaceChildren(wrap);
    node.classList.remove('loading', 'mermaid-source');
    node.classList.add('has-error');
    node.setAttribute('aria-busy', 'false');
    delete node.dataset.rendered;
}
export function resetMermaidNode(node: HTMLElement): void {
    delete node.dataset.rendered;
    node.classList.remove('has-error', 'mermaid-source');
    node.classList.add('loading');
    node.setAttribute('aria-busy', 'true');
    node.textContent = t("markdown.redrawing_chart");
}
function updateMermaidNode<T>(hooks: MermaidRenderHooks<T>, update: () => void): void {
    if (!hooks.beforeUpdate) {
        update();
        return;
    }
    const snapshot = hooks.beforeUpdate();
    update();
    hooks.afterUpdate?.(snapshot);
}
function currentSignature(node: HTMLElement, dark: boolean): string {
    const source = mermaidSource(node);
    return `${dark ? 'd' : 'l'}:${source.length}:${shortHash(source)}`;
}
function mermaidSource(node: HTMLElement): string {
    return decodeDataValue(node.dataset.mermaid);
}
export interface EnhanceOptions {
    math: boolean;
    mermaid: boolean;
    dark: boolean;
    codeBlockCollapseLines?: number;
}
export async function enhancePreview(root: HTMLElement, options: EnhanceOptions): Promise<void> {
    if (options.mermaid) {
        hydrateCachedMermaid(root, options.dark);
        const hasPendingDiagram = [...root.querySelectorAll<HTMLElement>('[data-mermaid]')].some((node) => node.dataset.rendered !== currentSignature(node, options.dark));
        if (hasPendingDiagram)
            void getMermaid().catch(() => { });
    }
    else {
        showMermaidSource(root);
    }
    if (!options.math)
        showMathSource(root);
    await Promise.allSettled([
        highlightCodeBlocks(root),
        options.math ? renderMath(root) : Promise.resolve(),
        root.isConnected ? renderChartJs(root, options.dark) : Promise.resolve(),
    ]);
    configureCodeBlockCollapsing(root, options.codeBlockCollapseLines ?? 24);
}
let chartJsPromise: Promise<typeof import('chart.js/auto')> | null = null;
const CHART_LOAD_TIMEOUT_MS = 15000;

async function getChartJs(): Promise<typeof import('chart.js/auto')> {
    if (!chartJsPromise) {
        const loading = withTimeout(import('chart.js/auto'), CHART_LOAD_TIMEOUT_MS, t("markdown.diagram_rendering_timed_out_while_loading"));
        chartJsPromise = loading;
        void loading.catch((err) => {
            if (chartJsPromise === loading)
                chartJsPromise = null;
            console.warn(t("markdown.chart_rendering_failed"), err);
        });
    }
    return chartJsPromise;
}

export function destroyChartInstances(root: HTMLElement | null): void {
    root?.querySelectorAll<HTMLElement>('[data-chart]').forEach((node) => {
        const existing = (node as unknown as { __chartInstance?: { destroy: () => void } }).__chartInstance;
        if (existing && typeof existing.destroy === 'function') {
            existing.destroy();
            delete (node as unknown as { __chartInstance?: unknown }).__chartInstance;
        }
    });
}

function parseChartConfig(raw: string): Record<string, unknown> {
    try {
        return JSON.parse(raw);
    }
    catch (initialErr) {
        try {
            const cleaned = raw
                .replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '')
                .replace(/,\s*([\]}])/g, '$1')
                .replace(/\*\*/g, '');
            return JSON.parse(cleaned);
        }
        catch {
            throw initialErr;
        }
    }
}

export async function renderChartJs(root: HTMLElement, dark: boolean): Promise<void> {
    const nodes = [...root.querySelectorAll<HTMLElement>('[data-chart]')];
    if (!nodes.length)
        return;
    for (const node of nodes) {
        const raw = decodeDataValue(node.dataset.chart);
        const signature = `${dark ? 'd' : 'l'}:${raw.length}:${shortHash(raw)}`;
        if (node.dataset.rendered === signature)
            continue;
        let config: Record<string, unknown>;
        try {
            config = parseChartConfig(raw);
        }
        catch (err: unknown) {
            node.classList.remove('loading');
            node.classList.add('has-error', 'chart-error');
            node.removeAttribute('aria-busy');
            const message = errorMessage(err);
            node.innerHTML = `<div class="chart-error-banner"><span class="chart-error-text">${escapeHtml(t("markdown.chart_rendering_failed"))}: ${escapeHtml(message)}</span></div><pre><code>${escapeHtml(raw)}</code></pre>`;
            node.dataset.rendered = signature;
            continue;
        }
        try {
            const chartModule = await getChartJs();
            const Chart = chartModule.Chart ?? (chartModule as unknown as { default: typeof chartModule.Chart }).default;
            if (!root.contains(node))
                return;
            const existing = (node as unknown as { __chartInstance?: { destroy: () => void } }).__chartInstance;
            if (existing && typeof existing.destroy === 'function') {
                existing.destroy();
                delete (node as unknown as { __chartInstance?: unknown }).__chartInstance;
            }
            node.classList.remove('loading', 'has-error', 'chart-error');
            node.removeAttribute('aria-busy');
            node.replaceChildren();
            const container = document.createElement('div');
            container.className = 'chartjs-container';
            const canvas = document.createElement('canvas');
            canvas.className = 'chartjs-canvas';
            container.appendChild(canvas);
            node.appendChild(container);

            const textColor = CHARTJS_TEXT_COLORS[dark ? 'dark' : 'light'];
            const gridColor = dark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)';
            const userOptions = (config.options && typeof config.options === 'object' ? config.options : {}) as Record<string, unknown>;
            const userScales = (userOptions.scales && typeof userOptions.scales === 'object' ? userOptions.scales : {}) as Record<string, unknown>;
            const userPlugins = (userOptions.plugins && typeof userOptions.plugins === 'object' ? userOptions.plugins : {}) as Record<string, unknown>;

            const scales: Record<string, unknown> = {};
            for (const [key, val] of Object.entries(userScales)) {
                if (val && typeof val === 'object') {
                    const scaleObj = val as Record<string, unknown>;
                    scales[key] = {
                        ...scaleObj,
                        ticks: { color: textColor, ...(scaleObj.ticks as object || {}) },
                        grid: { color: gridColor, ...(scaleObj.grid as object || {}) },
                    };
                }
            }

            const chartConfig = {
                ...config,
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    color: textColor,
                    ...userOptions,
                    scales: Object.keys(scales).length > 0 ? scales : undefined,
                    plugins: {
                        legend: {
                            labels: {
                                color: textColor,
                            },
                        },
                        ...userPlugins,
                    },
                },
            };

            const instance = new Chart(canvas, chartConfig as never);
            (node as unknown as { __chartInstance?: unknown }).__chartInstance = instance;
            node.dataset.rendered = signature;
        }
        catch (err: unknown) {
            if (!root.contains(node))
                return;
            node.classList.remove('loading');
            node.classList.add('has-error', 'chart-error');
            node.removeAttribute('aria-busy');
            const message = errorMessage(err);
            node.innerHTML = `<div class="chart-error-banner"><span class="chart-error-text">${escapeHtml(t("markdown.chart_rendering_failed"))}: ${escapeHtml(message)}</span></div><pre><code>${escapeHtml(raw)}</code></pre>`;
            node.dataset.rendered = signature;
        }
    }
}
export function invalidateMermaidTheme(root: HTMLElement | null): void {
    root?.querySelectorAll<HTMLElement>('[data-mermaid]').forEach((node) => {
        delete node.dataset.rendered;
    });
    root?.querySelectorAll<HTMLElement>('[data-chart]').forEach((node) => {
        delete node.dataset.rendered;
    });
}
function remember<K, V>(cache: Map<K, V>, key: K, value: V, limit: number): void {
    if (cache.has(key))
        cache.delete(key);
    cache.set(key, value);
    while (cache.size > limit) {
        const oldest = cache.keys().next().value as K | undefined;
        if (oldest === undefined)
            break;
        cache.delete(oldest);
    }
}
function shortHash(value: string): string {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index++) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
        promise.then((value) => {
            window.clearTimeout(timer);
            resolve(value);
        }, (err) => {
            window.clearTimeout(timer);
            reject(err);
        });
    });
}

import { decodeDataValue } from '../data-attr';
import { errorMessage } from '../../errors';
import { t } from '../../i18n';
import { remember, shortHash, withTimeout } from './util';
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
export async function getMermaid(): Promise<MermaidApi> {
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
export function hydrateCachedMermaid(root: HTMLElement, dark: boolean): void {
    root.querySelectorAll<HTMLElement>('[data-mermaid]').forEach((node) => {
        if (node.dataset.rendered === currentSignature(node, dark))
            return;
        const cached = mermaidCache.get(mermaidKey(mermaidSource(node), dark));
        if (cached)
            applyMermaidSvg(node, cached, dark);
    });
}
export function showMermaidSource(root: HTMLElement): void {
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
export function currentSignature(node: HTMLElement, dark: boolean): string {
    const source = mermaidSource(node);
    return `${dark ? 'd' : 'l'}:${source.length}:${shortHash(source)}`;
}
function mermaidSource(node: HTMLElement): string {
    return decodeDataValue(node.dataset.mermaid);
}
export function invalidateMermaidTheme(root: HTMLElement | null): void {
    root?.querySelectorAll<HTMLElement>('[data-mermaid]').forEach((node) => {
        delete node.dataset.rendered;
    });
    root?.querySelectorAll<HTMLElement>('[data-chart]').forEach((node) => {
        delete node.dataset.rendered;
    });
}

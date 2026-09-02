import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

/** Idempotent jsdom shims needed to render React components in unit tests. */
export function installTestGlobals(): void {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    if (typeof globalThis.ResizeObserver === 'undefined') {
        class ResizeObserverStub {
            observe() {}
            unobserve() {}
            disconnect() {}
        }
        globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
    }
}

export interface RenderedElement {
    container: HTMLElement;
    unmount: () => void;
}

/** Render a React node into a fresh container appended to document.body (portals land on body as usual). */
export function renderElement(node: ReactNode): RenderedElement {
    installTestGlobals();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => { root.render(node); });
    return {
        container,
        unmount: () => {
            act(() => { root.unmount(); });
            container.remove();
        },
    };
}
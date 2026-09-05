import { configureCodeBlockCollapsing } from './code';
import { highlightCodeBlocks } from './code';
import { showMathSource } from './math';
import { renderMath } from './math';
import { hydrateCachedMermaid } from './mermaid';
import { currentSignature } from './mermaid';
import { getMermaid } from './mermaid';
import { showMermaidSource } from './mermaid';
import { renderChartJs } from './chart';
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
export { decorateCodeBlock } from './code';
export { configureCodeBlockCollapsing } from './code';
export { toggleCodeBlockCollapse } from './code';
export type { MermaidRenderHooks } from './mermaid';
export { renderPendingMermaid } from './mermaid';
export { resetMermaidNode } from './mermaid';
export { destroyChartInstances } from './chart';
export { renderChartJs } from './chart';
export { invalidateMermaidTheme } from './mermaid';

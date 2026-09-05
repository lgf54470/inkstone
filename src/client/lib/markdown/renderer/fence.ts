import MarkdownIt from 'markdown-it';
import { escapeHtml } from '@shared/escape';
import { t } from '../../i18n';
import { encodeDataValue } from '../data-attr';
import { emptyEnvironment, renderEnv } from './env';
import { stripObsidianComments, parseFenceInfo } from './parse';
import { escapeAttr } from './util';
export function registerFence(md: MarkdownIt): void {

    md.renderer.rules.fence = (tokens, index, _options, rendererEnv) => {
        const token = tokens[index]!;
        const info = parseFenceInfo(token.info);
        const line = token.map ? ` data-line="${token.map[0]}"` : '';
        if (info.language === 'md-example' || info.language === 'markdown-example') {
            const parentEnv = renderEnv(rendererEnv);
            const exampleId = ++parentEnv.exampleSequence;
            const childEnv = emptyEnvironment();
            childEnv.taskNonce = parentEnv.taskNonce;
            childEnv.tabSequence = parentEnv.tabSequence;
            childEnv.exampleSequence = parentEnv.exampleSequence;
            childEnv.docId = `${parentEnv.docId}-example-${exampleId}`;
            childEnv.externalImages = parentEnv.externalImages;
            const preview = md.render(stripObsidianComments(token.content), childEnv).replace(/ data-line="\d+"/g, '');
            parentEnv.hasMath ||= childEnv.hasMath;
            parentEnv.hasMermaid ||= childEnv.hasMermaid;
            parentEnv.hasChart ||= childEnv.hasChart;
            parentEnv.hasEmbeds ||= childEnv.hasEmbeds;
            parentEnv.tabSequence = childEnv.tabSequence;
            parentEnv.exampleSequence = Math.max(parentEnv.exampleSequence, childEnv.exampleSequence);
            const title = info.title || t("markdown.markdown_example");
            const titleId = `${parentEnv.docId}-markdown-example-${exampleId}`;
            return [
                `<section class="markdown-example"${line} aria-labelledby="${titleId}">`,
                `<div class="markdown-example-head"><span class="markdown-example-title" id="${titleId}">${escapeHtml(title)}</span></div>`,
                `<div class="markdown-example-grid">`,
                `<section class="markdown-example-preview" aria-label="${escapeAttr(t("common.preview"))}" data-markdown-example-id="${exampleId}" data-markdown-example="${escapeAttr(encodeDataValue(token.content))}">`,
                `<div class="markdown-example-preview-body">${preview}</div>`,
                `</section>`,
                `<section class="markdown-example-source" aria-label="Markdown">`,
                `<div class="code-block markdown-example-code" data-lang="markdown" data-code-start="1">`,
                `<button class="code-copy markdown-example-copy" data-copy type="button" aria-label="${escapeAttr(t("markdown.copy_code"))}">${escapeHtml(t("common.copy"))}</button>`,
                `<pre><code>${escapeHtml(token.content)}</code></pre>`,
                `</div>`,
                `</section>`,
                `</div>`,
                `</section>`,
            ].join('');
        }
        if (info.language === 'javascript-example' || info.language === 'js-example') {
            const title = info.title || t("workspace.runnable_javascript_code");
            return [
                `<section class="markdown-example js-example-block"${line}>`,
                `<div class="markdown-example-head js-example-head">`,
                `<span class="markdown-example-title js-example-title">`,
                `<span class="js-example-badge">JS</span>`,
                `<span>${escapeHtml(title)}</span>`,
                `</span>`,
                `<div class="js-example-controls">`,
                `<label class="js-example-switch-wrap" title="${escapeAttr(t("workspace.toggle_line_numbers"))}">`,
                `<span class="js-example-switch-label">${escapeHtml(t("workspace.line_numbers"))}</span>`,
                `<button type="button" role="switch" class="js-example-switch is-checked" data-js-switch="line-numbers" aria-checked="true" aria-label="${escapeAttr(t("workspace.line_numbers"))}">`,
                `<span class="js-example-switch-thumb"></span>`,
                `</button>`,
                `</label>`,
                `<button type="button" class="js-example-run-btn" data-js-run title="${escapeAttr(t("workspace.run_code"))}">`,
                `<span class="js-example-run-icon">▶</span>`,
                `<span>${escapeHtml(t("workspace.run"))}</span>`,
                `</button>`,
                `</div>`,
                `</div>`,
                `<div class="markdown-example-grid js-example-grid">`,
                `<section class="markdown-example-source js-example-source" aria-label="JavaScript">`,
                `<div class="code-block markdown-example-code has-line-numbers" data-lang="javascript" data-code-start="1" data-line-numbers="true">`,
                `<button class="code-copy markdown-example-copy" data-copy type="button" aria-label="${escapeAttr(t("markdown.copy_code"))}">${escapeHtml(t("common.copy"))}</button>`,
                `<pre><code class="language-javascript">${escapeHtml(token.content)}</code></pre>`,
                `</div>`,
                `</section>`,
                `<section class="markdown-example-preview js-example-output" aria-label="${escapeAttr(t("workspace.execution_result"))}">`,
                `<div class="js-example-output-head">`,
                `<span class="js-example-output-title">${escapeHtml(t("workspace.execution_result"))}</span>`,
                `<span class="js-example-output-status"></span>`,
                `</div>`,
                `<div class="js-example-output-body">`,
                `<div class="js-example-placeholder">${escapeHtml(t("workspace.click_run_to_execute"))}</div>`,
                `</div>`,
                `</section>`,
                `</div>`,
                `</section>`,
            ].join('');
        }
        if (info.language === 'mermaid') {
            renderEnv(rendererEnv).hasMermaid = true;
            return `<div class="mermaid-block loading"${line} data-mermaid="${escapeAttr(encodeDataValue(token.content))}" aria-busy="true">${escapeHtml(t("markdown.rendering_diagram"))}</div>`;
        }
        if (info.language === 'chart' || info.language === 'chartjs') {
            renderEnv(rendererEnv).hasChart = true;
            return `<div class="chartjs-block loading"${line} data-chart="${escapeAttr(encodeDataValue(token.content))}" aria-busy="true">${escapeHtml(t("markdown.rendering_chart"))}</div>`;
        }
        const title = info.title || info.language || t("markdown.code");
        return [
            `<div class="code-block${info.lineNumbers ? ' has-line-numbers' : ''}"${line} data-lang="${escapeAttr(info.language)}" data-code-start="${info.startLine}"${info.lineNumbers ? ' data-line-numbers="true"' : ''}${info.highlightedLines.length ? ` data-highlight-lines="${info.highlightedLines.join(',')}"` : ''}>`,
            `<div class="code-block-head">`,
            `<span class="code-title">${escapeHtml(title)}</span>`,
            info.title && info.language ? `<span class="code-lang">${escapeHtml(info.language)}</span>` : '',
            `<button class="code-copy" data-copy type="button" aria-label="${escapeAttr(t("markdown.copy_code"))}">${escapeHtml(t("common.copy"))}</button>`,
            `</div>`,
            `<pre><code>${escapeHtml(token.content)}</code></pre>`,
            `</div>`,
        ].join('');
    };
}

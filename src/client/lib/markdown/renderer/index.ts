/** Builds the sanitized Markdown rendering pipeline and its Inkstone-specific syntax extensions. */

import MarkdownIt from 'markdown-it';
import taskLists from 'markdown-it-task-lists';
import footnote from 'markdown-it-footnote';
import anchor from 'markdown-it-anchor';
import mark from 'markdown-it-mark';
import sub from 'markdown-it-sub';
import sup from 'markdown-it-sup';
import ins from 'markdown-it-ins';
import { full as emoji } from 'markdown-it-emoji';
import deflist from 'markdown-it-deflist';
import abbr from 'markdown-it-abbr';
import ruby from 'markdown-it-ruby';
import { slugifyHeading } from '@shared/markdown-utils';
import { sanitizeProseHtml } from '../sanitize';
import type { RenderResult } from './types';
import { emptyEnvironment, materializeTrustedTasks } from './env';
import { stripObsidianComments } from './parse';
import { registerFrontMatter } from './frontmatter';
import { registerContainers } from './containers';
import { registerMath } from './math';
import { registerToc } from './toc';
import { registerWiki } from './wiki';
import { registerObsidian } from './obsidian';
import { registerTasks } from './tasks';
import { registerAttachments } from './attachments';
import { registerFence } from './fence';
import { registerTables } from './tables';
import { registerMedia } from './media';
import { registerHeadings } from './headings';

const md = new MarkdownIt({
    html: true,
    linkify: true,
    breaks: false,
    typographer: false,
    langPrefix: 'language-',
});

md.use(taskLists, { enabled: true, label: false })
    .use(footnote)
    .use(mark)
    .use(sub)
    .use(sup)
    .use(ins)
    .use(emoji, { shortcuts: {} })
    .use(deflist)
    .use(abbr)
    .use(ruby)
    .use(anchor, {
    slugify: slugifyHeading,

    permalink: anchor.permalink.linkInsideHeader({
        symbol: '',
        placement: 'before',
        class: 'heading-anchor',
        ariaHidden: true,
    }),
});
registerFrontMatter(md);
registerContainers(md);
registerMath(md);
registerToc(md);
registerWiki(md);
registerObsidian(md);
registerTasks(md);
registerAttachments(md);
registerFence(md);
registerTables(md);
registerMedia(md);
registerHeadings(md);

export function renderMarkdown(source: string, options?: {
    /** Allow external https images; defaults to false (blocked). */
    externalImages?: boolean;
    hideFrontMatter?: boolean;
}): RenderResult {
    const env = emptyEnvironment();
    env.externalImages = options?.externalImages === true;
    env.hideFrontMatter = options?.hideFrontMatter === true;
    const raw = md.render(stripObsidianComments(source), env);
    const sanitized = sanitizeProseHtml(raw);
    const html = materializeTrustedTasks(sanitized, env.taskNonce);
    return {
        html,
        headings: env.headings,
        hasMath: env.hasMath,
        hasMermaid: env.hasMermaid,
        hasChart: env.hasChart,
        hasEmbeds: env.hasEmbeds,
        frontMatter: env.frontMatter,
        frontMatterErrors: env.frontMatterErrors,
    };
}
export type { Heading, RenderResult, WikiTarget, FenceInfo } from './types';
export { parseWikiTarget, parseFenceInfo } from './parse';

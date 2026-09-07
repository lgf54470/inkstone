import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './renderer';

const normalize = (html: string): string => html
  .replace(/data-task-placeholder="[^"]*"/g, 'data-task-placeholder="X"')
  .replace(/ink-[a-f0-9-]{36}/g, 'ink-X');

const DOCS: string[] = [
  'a $x$ b',
  'a $x + y$ b',
  '$$x$$',
  '$$\nx\ny\n$$',
  '$$\nunclosed',
  'see [[Note|alias]] here',
  'embed ![[image.png|alt]]',
  'block ((abc123)) ref',
  '#tag at start',
  'plain#tag notag',
  'and #one #two\n#three',
  '[ruby]{furigana} text',
  '#intro\n\n$$e=mc^2$$\n\n[[Note#^blk]] and $x$',
  '```js title="My Code" start=3 hl_lines="1 3"\nconst a = 1;\nconst b = 2;\nconst c = 3;\n```',
  '```{.python .numberLines linenos=false}\nprint(1)\n```',
  '```ts linenums startfrom=2\nlet x: number = 1;\n```',
  '```\nplain\n```',
  '```js-example\nconsole.log(1);\n```',
  '```md-example\n# inner\n\n[[Note]] $$m$$\n```',
  '```mermaid\ngraph TD; A-->B;\n```',
  '```chart\nbar\n```',
  'before %%hidden [[x]]%% after $x$',
];

describe('renderer output regression', () => {
  it('locks math/wiki/fence rendering output', () => {
    const results = DOCS.map((doc) => {
      const result = renderMarkdown(doc);
      return {
        doc,
        html: normalize(result.html),
        hasMath: result.hasMath,
      };
    });
    expect(results).toMatchSnapshot();
  });
});

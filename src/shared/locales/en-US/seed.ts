export const messages = {
"seed.welcome_note": `---
title: Welcome to Inkstone
tags: [getting-started, Inkstone]
aliases:
  - User guide
---

# Welcome to Inkstone

> [!TIP] Five things to know first
> - This is your private Markdown notebook; note bodies always remain plain text.
> - Content saves automatically, remains editable offline, and uploads after reconnection.
> - Common create, move, organize, and delete actions take effect locally first and roll back safely if persistence fails.
> - The title at the top of a note is independently editable and does not have to match the first body line.
> - MCP is entirely optional and requires account authorization before it can read notes.

Use the left side to organize notes, the center to edit plain Markdown, and the right side for live preview. There is no proprietary document format: every \`.md\` file in a backup opens in any text editor.

## Try these now

- [ ] Click this checkbox and watch the source update on the left
  - [ ] Nested tasks update their exact source line too
- [ ] Select text and press \`Ctrl + B\` to make it bold
- [ ] Press \`Ctrl + K\` to open the command palette
- [ ] Add a \`#tag\`, or click [[My first note]] to create a linked note
- [ ] Click the title above this note and give it a name different from the body
- [ ] Create a subfolder, then drag it into another folder or sibling position
- [ ] Alt-click another note, or choose **Open to side**, to work with two notes at once
- [ ] Install Inkstone as an offline-capable PWA under **Settings → About**
- [ ] Open **Settings → MCP** to review private AI connections and permissions
- [ ] Add a backup target under **Settings → Backup**
- [ ] Create a password-protected share for a note

> [!NOTE] Add a backup
> Open **Settings → Backup**, add a WebDAV or S3 target, test the connection, and run one **Back up now**.

> [!NOTE] Create a secure share
> Open **Share** from any note, then set an access password and expiration. Attachments in a protected share are available only after password verification.

## Essential Windows shortcuts

| Shortcut | Action |
| --- | --- |
| \`Ctrl + K\` | Open the command palette |
| \`Ctrl + P\` | Quickly open a note |
| \`Ctrl + N\` | Create a note |
| \`Ctrl + Shift + F\` | Search all notes |
| \`Ctrl + ,\` | Open settings |
| \`Ctrl + \\\` | Cycle editor, split, and preview layouts |
| \`Ctrl + S\` | Save now; normal edits save automatically |
| \`Ctrl + B / I / E\` | Bold, italic, and inline code |
| \`Ctrl + 1…6\` | Set heading levels one through six |
| \`Shift + ?\` | Show every shortcut |

## Why it works for long-term notes

:::: tabs
::: tab-item Writing
Independent titles, source editing, live preview, synchronized scrolling, focus and typewriter modes, an outline, and version history.
:::

::: tab-item Organization
Twelve levels of drag-sortable folders, inline \`#tags\`, \`[[wiki links]]\`, backlinks, a graph, and full-text search. On desktop, open a second note to the side and choose edit, split, or preview independently in each active group. Deleting a folder promotes its children and moves direct notes to the parent.
:::

::: tab-item Search & AI
Keyboard command-palette navigation, keyword search, and optional Workers AI semantic/hybrid search. Every account has a separate index, with automatic keyword fallback when AI is unavailable.
:::

::: tab-item Safety & backup
Self-hosting, an installable PWA, offline editing, multi-device sync, and conflict copies. Back up to several WebDAV or S3 targets and export readable Markdown, attachments, and complete structured data.
:::
::::

## Private MCP (optional)

Under **Settings → MCP**, the owner can enable the remote MCP service and each account can separately decide whether to allow writes or moves to trash:

- Full MCP clients such as Codex and Claude Code authorize through OAuth 2.1 with PKCE. You can revoke one client or every grant at any time.
- Scripts and minimal clients without OAuth can use an \`ink_...\` API key. A key is shown once, stored only as a hash, and can be revoked at any time.
- MCP can search, read bounded ranges, inspect outlines/folders/tags/links, and—with explicit permission—safely create, edit, organize, trash, or restore notes. Permanent purge is never exposed.
- With Workers AI configured, Inkstone builds a per-account semantic index and combines semantic and keyword results. The index can be rebuilt or cleared, and content changes are indexed in the background.

> [!WARNING] Check an external AI client's privacy policy before connecting
> Inkstone isolates accounts and enforces permissions, but content an authorized client actually reads is then processed by that client.

## Markdown quick reference

Under each example title, the **rendered result** is on the left and the **copyable source** is on the right.

### Inline styles

| Rendered result | Source |
| --- | --- |
| **Bold** | \`**Bold**\` |
| *Italic* | \`*Italic*\` |
| ~~Strikethrough~~ | \`~~Strikethrough~~\` |
| ==Highlight== | \`==Highlight==\` |
| \`Inline code\` | \`\` \`Inline code\` \`\` |

### Links, images, and note relationships

~~~~md-example title="Link"
[Open the example site](https://example.com)
~~~~

~~~~md-example title="Image"
![Inkstone project logo](/inkstone-logo.svg "Inkstone project logo")
~~~~

~~~~md-example title="Wiki links"
[[My first note|Open or create a note]] · [[Welcome to Inkstone#Markdown quick reference|Jump to this section]]
~~~~

~~~~md-example title="Block ID and reference"
This content can be addressed precisely. ^markdown-demo

Click [[#^markdown-demo]] to return to it.
~~~~

~~~~md-example title="Note embed"
This content is embedded again below. ^embed-demo

![[#^embed-demo|Embedded result]]
~~~~

~~~~md-example title="Footnote"
This sentence has an additional note.[^markdown-footnote]

[^markdown-footnote]: This is the rendered footnote. Use its links to move between the reference and definition.
~~~~

Obsidian comments are hidden in preview: \`%% one line %%\`, or place \`%%\` markers around multiple lines.

### Math and diagrams

~~~~md-example title="Math"
Inline math: $E = mc^2$

$$
a^2 + b^2 = c^2
$$
~~~~

~~~~md-example title="Mermaid diagram"
\`\`\`mermaid
flowchart LR
  A[Markdown source] --> B[Live preview]
\`\`\`
~~~~

### Modern block extensions

~~~~md-example title="Obsidian callout"
> [!NOTE]- Folded callout with a custom title
> Put explanations, tasks, lists, or other Markdown here.
>
> > [!TIP]+ Expanded nested callout
> > Nested callouts use the same syntax.
~~~~

~~~~md-example title="Folded details block"
::: details [Click to expand]
This content is hidden until the details block is opened.
:::
~~~~

~~~~md-example title="Tabs"
:::: tabs
::: tab-item First tab
This is the first tab panel.
:::

::: tab-item Second tab
This is the second tab panel.
:::
::::
~~~~

~~~~md-example title="Code block with a title, line numbers, and highlighting"
\`\`\`ts title="hello.ts" line-numbers {2}
const name = 'Inkstone'
console.log(\`Hello, \${name}!\`)
\`\`\`
~~~~

## Saving, syncing, and recovery

Changes save automatically and sync to your other devices. You can keep editing offline, and queued writes replay in order after reconnection. Everyday actions appear locally first and roll back only if background persistence fails; stale sync responses cannot overwrite newer local state.

Install the PWA under **Settings → About**. Application updates wait for confirmation and flush pending note writes before refreshing; only the owner receives deployment-version reminders. Existing databases upgrade through versioned, idempotent migrations, but keep a current backup before updating a self-hosted deployment.

Add several WebDAV/S3 destinations and a schedule under **Settings → Backup**. Import or export \`.md\`, \`.zip\`, and complete JSON archives under **Settings → Data**.

> [!WARNING] Backup is not sync
> Keep backups with at least two independent providers, and occasionally perform a real restore to prove they work.

## You are ready

Press \`Ctrl + ,\` to change the interface language, theme, typography, editor, sync, or backup settings. You now know everything needed to use Inkstone. Keep this note as a reference or delete it and start writing. #getting-started
`,
};
